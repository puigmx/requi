/* Reconstrucción por columnas para las cotizaciones de Marea Alta.
 * Conserva importes impresos y deja vacía una cantidad que no está en el PDF.
 * El lector genérico sigue atendiendo los demás formatos.
 */
(() => {
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const labels = new Set([
    'MANO DE OBRA', 'MATERIALES, INSUMOS Y HERRAJES', 'PLANOS Y DIGITALIZACION',
    'TRANSPORTACION A LOS ESTADOS', 'VIATICOS, HOSPEDAJES Y TRANSPORTES',
    'FLETES DE MATERIALES', 'RECEPCION Y MANIOBRAS EN BODEGA',
    'RECOLECCION, MANIOBRAS Y ENTREGA EN BODEGA', 'RESGUARDO'
  ]);
  const numeric = text => /^\d[\d,]*(?:\.\d+)?$/.test(text.trim());
  const amountText = text => /^\d[\d,\s]*\.\d{2}$/.test(text.trim());
  function extract(pages, subtotals, Decimal) {
    const details = [], summaries = [], warnings = [];
    let inSummary = false;
    for (const rows of pages) {
      const items = rows.flatMap(row => row.items);
      const dollars = items.filter(item => item.text.trim() === '$');
      if (!dollars.length) continue;
      // The line-amount column occurs most often. Section totals at the far
      // right are a different column and must not become additional lines.
      const column = dollars.reduce((best, item) => {
        const count = dollars.filter(other => Math.abs(other.x - item.x) <= 5).length;
        return count > best.count ? {x: item.x, count} : best;
      }, {x: 0, count: 0}).x;
      const money = [];
      for (const dollar of dollars.filter(item => Math.abs(item.x - column) <= 5)) {
        const values = items.filter(item => item.x > dollar.x && item.x < dollar.x + 85 && Math.abs(item.y - dollar.y) <= 3.5 && amountText(item.text));
        values.sort((a, b) => Math.abs(a.y - dollar.y) - Math.abs(b.y - dollar.y) || a.x - b.x);
        if (values[0] && !money.some(entry => entry.item === values[0])) money.push({item: values[0], dollar});
      }
      money.sort((a, b) => b.item.y - a.item.y);
      const anchors = items.filter(item => labels.has(normalize(item.text)) && item.x < column - 30).sort((a, b) => b.y - a.y);
      const summaryMarkers = items.filter(item => normalize(item.text) === 'RESUMEN');
      const totalMarkers = items.filter(item => /^(?:SUB\s*[-–]?\s*TOTAL|IVA|TOTAL|IMPUESTOS?)$/i.test(item.text.trim()));
      const used = new Set();
      const parsed = [];
      for (let index = 0; index < anchors.length; index++) {
        const anchor = anchors[index];
        const top = index ? (anchors[index - 1].y + anchor.y) / 2 : anchor.y + 25;
        const bottom = index + 1 < anchors.length ? (anchor.y + anchors[index + 1].y) / 2 : anchor.y - 25;
        const candidates = money.filter(entry => !used.has(entry) && entry.item.y <= top && entry.item.y > bottom && Math.abs(entry.item.y - anchor.y) <= 25);
        candidates.sort((a, b) => Math.abs(a.item.y - anchor.y) - Math.abs(b.item.y - anchor.y));
        const match = candidates[0];
        if (!match) continue; // A printed dash/zero service has no positive amount.
        // A subtotal/tax row is never a line, even when near the last label.
        if (totalMarkers.some(marker => Math.abs(marker.y - match.item.y) < 4)) continue;
        used.add(match);
        let description = anchor.text.trim();
        if (normalize(description) === 'RESGUARDO') {
          const period = items.find(item => item.x < column - 35 && Math.abs(item.y - match.item.y) < 4 && /^(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[- /]\d{2,4}$/i.test(item.text.trim()));
          if (period) description += ' ' + period.text.trim();
        }
        parsed.push({match, description, y: match.item.y});
      }
      // Some quotes put the description to the right of the amount instead
      // of using a left-hand concept column (e.g. luminarias/difusores).
      if (!anchors.length) for (const match of money) {
        const quantity = items.find(item => item.x > column - 60 && item.x < column - 12 && Math.abs(item.y - match.item.y) <= 5 && numeric(item.text));
        const description = items.filter(item => item.x > match.item.x + match.item.width && Math.abs(item.y - match.item.y) <= 3.5).sort((a, b) => a.x - b.x).map(item => item.text).join(' ').trim();
        if (quantity && description && !/^\d+$/.test(description)) parsed.push({match, description, y: match.item.y});
      }
      parsed.sort((a, b) => b.y - a.y);
      for (const entry of parsed) {
        const {match, description, y} = entry;
        const nearest = money.filter(other => other !== match).reduce((gap, other) => Math.min(gap, Math.abs(other.item.y - y)), Infinity);
        const radius = Math.min(8, nearest / 2);
        const quantities = items.filter(item => item.x > column - 60 && item.x < column - 12 && Math.abs(item.y - y) <= radius && numeric(item.text));
        quantities.sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y));
        const quantity = quantities[0] ? new Decimal(quantities[0].text.replace(/,/g, '')) : null;
        const amount = new Decimal(match.item.text.replace(/[,\s]/g, ''));
        if (amount.lte(0)) continue;
        const line = {description, quantity: quantity?.gt(0) ? quantity.toString() : '', price: quantity?.gt(0) ? amount.div(quantity).toDecimalPlaces(6).toString() : '', amount: amount.toFixed(2), date: null};
        if (summaryMarkers.some(marker => y <= marker.y + 4)) inSummary = true;
        (inSummary ? summaries : details).push(line);
      }
    }
    if (!details.length && !summaries.length) return null;
    const sum = lines => lines.reduce((total, line) => total.plus(line.amount), new Decimal(0));
    const difference = lines => subtotals.reduce((best, subtotal) => {
      const delta = sum(lines).minus(subtotal.amount).abs();
      return delta.lt(best) ? delta : best;
    }, new Decimal(Infinity));
    const names = lines => new Set(lines.map(line => normalize(line.description)));
    const summaryNames = names(summaries);
    const coversDetails = [...names(details)].every(name => summaryNames.has(name));
    // Choose the complete printed summary as one block, never concatenate it
    // with detail or change amounts merely to force agreement with a subtotal.
    const useSummary = summaries.length && coversDetails && summaries.every(line => line.quantity) && (!details.length || difference(summaries).lte(difference(details)));
    const lines = useSummary ? summaries : details;
    if (useSummary) warnings.push('Se leyó el bloque RESUMEN del PDF para evitar duplicar el detalle de sus secciones.');
    for (const line of lines) if (!line.quantity) warnings.push('El PDF no muestra una cantidad para «' + line.description + '». Confirma la cantidad y el precio; se conservó el importe impreso.');
    const delta = difference(lines);
    if (delta.gt(0) && delta.lte('.01')) warnings.push('Las partidas impresas difieren del subtotal por ' + delta.toFixed(2) + '. Revisa el redondeo del documento; no se modificaron los importes.');
    return {lines, warnings};
  }
  globalThis.RequiPDFTables = {extract};
})();
