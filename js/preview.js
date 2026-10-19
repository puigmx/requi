/* Vista local de la hoja XLSX. Ningún archivo se envía a un visor público. */
(() => {
 const ns=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
 const first=(node,name)=>ns(node,name)[0];
 const parse=text=>{const xml=new DOMParser().parseFromString(text,'application/xml');if(ns(xml,'parsererror').length)throw Error('No se pudo leer la hoja del Excel.');return xml;};
 const col=name=>Array.from(name).reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
 const ref=value=>{const m=String(value).replace(/\$/g,'').match(/^([A-Z]+)(\d+)$/);return m?{col:col(m[1]),row:+m[2]}:null;};
 const label=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
 function calc(formula,get){
  let source=formula.replace(/\$/g,'').toUpperCase().replace(/^=/,'');
  source=source.replace(/SUM\(([^()]*)\)/g,(_,inner)=>{let total=0;for(const arg of inner.split(',')){const range=arg.trim().split(':');if(range.length===2){const a=ref(range[0]),b=ref(range[1]);if(!a||!b||(b.row-a.row+1)*(b.col-a.col+1)>150000)throw Error('Rango no compatible');for(let r=a.row;r<=b.row;r++)for(let c=a.col;c<=b.col;c++)total+=Number(get(label(c)+r))||0;}else total+=Number(calc(arg,get))||0;}return String(total);});
  source=source.replace(/(ROUND|ROUNDDOWN)\(([^(),]+),\s*(-?\d+)\)/g,(_,kind,expression,digits)=>{const n=calc(expression,get),factor=10**Number(digits);return String(kind==='ROUNDDOWN'?Math.trunc(n*factor)/factor:Math.sign(n)*Math.round((Math.abs(n)+Number.EPSILON)*factor)/factor);});
  const tokens=source.match(/[A-Z]+\d+|\d+(?:\.\d*)?(?:E[+-]?\d+)?|[()+\-*/]/g)||[];if(tokens.join('')!==source.replace(/\s/g,''))throw Error('Fórmula no compatible');let at=0;
  function primary(){const t=tokens[at++];if(t==='+')return primary();if(t==='-')return-primary();if(t==='('){const n=expression();if(tokens[at++]!==')')throw Error('Paréntesis');return n;}if(!t)throw Error('Fórmula incompleta');if(/^[A-Z]/.test(t))return Number(get(t))||0;const n=Number(t);if(!Number.isFinite(n))throw Error('Valor no válido');return n;}
  function product(){let n=primary();while(tokens[at]==='*'||tokens[at]==='/'){const op=tokens[at++],v=primary();n=op==='*'?n*v:n/v;}return n;}
  function expression(){let n=product();while(tokens[at]==='+'||tokens[at]==='-'){const op=tokens[at++],v=product();n=op==='+'?n+v:n-v;}return n;}
  const result=expression();if(at!==tokens.length||!Number.isFinite(result))throw Error('Fórmula no válida');return result;
 }
 async function model(buffer){
  const zip=await RequiLocal.openExcel(buffer);const xml=async path=>{const f=zip.file(path);return f?parse(await f.async('string')):null;};
  const sheet=await xml('xl/worksheets/sheet1.xml');if(!sheet)throw Error('El Excel no contiene la hoja esperada.');
  const shared=await xml('xl/sharedStrings.xml');const strings=shared?ns(shared,'si').map(si=>ns(si,'t').map(t=>t.textContent).join('')):[];
  const cells=new Map();let rows=1,cols=1;for(const cell of ns(sheet,'c')){const address=cell.getAttribute('r'),p=ref(address);if(!p)continue;rows=Math.max(rows,p.row);cols=Math.max(cols,p.col);const type=cell.getAttribute('t'),v=first(cell,'v')?.textContent;cells.set(address,{address,...p,style:+cell.getAttribute('s')||0,formula:first(cell,'f')?.textContent,value:type==='s'?strings[+v]||'':type==='inlineStr'?ns(cell,'t').map(t=>t.textContent).join(''):type==='b'?v==='1'?'Sí':'No':v===undefined?'':type==='str'||type==='e'?v:Number(v)});}
  const workbook=await xml('xl/workbook.xml');const printArea=workbook&&ns(workbook,'definedName').find(n=>n.getAttribute('name')==='_xlnm.Print_Area')?.textContent;const end=printArea?.replace(/\$/g,'').match(/:([A-Z]+\d+)$/);const printed=end&&ref(end[1]);if(printed){rows=printed.row;cols=printed.col;}else{const populated=[...cells.values()].filter(c=>c.value!==''||c.formula);rows=Math.max(1,...populated.map(c=>c.row));cols=Math.max(1,...populated.map(c=>c.col));}
  if(rows>5000||cols>40)throw Error('La hoja excede el tamaño de vista previa. Descarga el Excel para revisarlo.');
  const cache=new Map(),stack=new Set(),warnings=[];
  function value(address){if(cache.has(address))return cache.get(address);const c=cells.get(address);if(!c)return 0;if(stack.has(address))throw Error('Referencia circular');stack.add(address);let result=c.value;try{if(c.formula)result=calc(c.formula,value);}catch{result=c.value===''?'—':c.value;warnings.push(address);}stack.delete(address);cache.set(address,result);return result;}
  for(const c of cells.values())c.displayValue=value(c.address);
  const merges=ns(sheet,'mergeCell').map(n=>n.getAttribute('ref').split(':').map(ref)).filter(x=>x.length===2&&x.every(Boolean)&&x[1].row<=rows&&x[1].col<=cols);
  for(const[a,b]of merges){rows=Math.max(rows,b.row);cols=Math.max(cols,b.col);}
  if(rows>5000||cols>40)throw Error('La hoja excede el tamaño de vista previa.');
  const widths=Array(cols).fill(64),heights=Array(rows).fill(20);for(const c of ns(sheet,'col')){for(let i=+c.getAttribute('min');i<=Math.min(cols,+c.getAttribute('max'));i++)widths[i-1]=c.getAttribute('hidden')==='1'?0:(+c.getAttribute('width')||8.43)*7+5;}
  for(const r of ns(sheet,'row')){const index=+r.getAttribute('r')-1;if(index<rows)heights[index]=r.getAttribute('hidden')==='1'?0:(+r.getAttribute('ht')||15)*4/3;}
  const styles=await xml('xl/styles.xml');const group=name=>styles?Array.from(first(styles,name)?.children||[]):[];
  const theme=await xml('xl/theme/theme1.xml');let palette=[];if(theme){const scheme=first(theme,'clrScheme');palette=Array.from(scheme?.children||[]).map(n=>n.firstElementChild?.getAttribute('val')==='windowText'?'000000':n.firstElementChild?.getAttribute('lastClr')||n.firstElementChild?.getAttribute('val')||'000000');if(palette.length>=4)palette=[palette[1],palette[0],palette[3],palette[2],...palette.slice(4)];}
  const images=[];const drawing=await xml('xl/drawings/drawing1.xml'),rels=await xml('xl/drawings/_rels/drawing1.xml.rels');
  if(drawing&&rels){const targets=new Map(ns(rels,'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));for(const anchor of Array.from(drawing.documentElement.children)){const from=first(anchor,'from'),to=first(anchor,'to'),blip=first(anchor,'blip');if(!from||!blip)continue;const id=blip.getAttribute('r:embed'),target=targets.get(id);if(!target||!/^\.\.\/media\/[\w.-]+\.(png|jpe?g|webp)$/i.test(target))continue;const file=zip.file('xl/'+target.slice(3));if(!file)continue;const x=widths.slice(0,+first(from,'col').textContent).reduce((a,b)=>a+b,0)+(+first(from,'colOff')?.textContent||0)/9525;const y=heights.slice(0,+first(from,'row').textContent).reduce((a,b)=>a+b,0)+(+first(from,'rowOff')?.textContent||0)/9525;let w,h;if(to){w=widths.slice(0,+first(to,'col').textContent).reduce((a,b)=>a+b,0)+(+first(to,'colOff')?.textContent||0)/9525-x;h=heights.slice(0,+first(to,'row').textContent).reduce((a,b)=>a+b,0)+(+first(to,'rowOff')?.textContent||0)/9525-y;}else{const ext=first(anchor,'ext');w=(+ext?.getAttribute('cx')||0)/9525;h=(+ext?.getAttribute('cy')||0)/9525;}if(w>0&&h>0)images.push({x,y,w,h,crop:Object.fromEntries(['t','b','l','r'].map(side=>[side,(+first(anchor,'srcRect')?.getAttribute(side)||0)/100000])),bytes:await file.async('uint8array'),mime:/\.png$/i.test(target)?'image/png':/\.webp$/i.test(target)?'image/webp':'image/jpeg'});}}
  return{cells,rows,cols,merges,widths,heights,images,warnings,fonts:group('fonts'),fills:group('fills'),borders:group('borders'),xfs:group('cellXfs'),formats:new Map(group('numFmts').map(f=>[+f.getAttribute('numFmtId'),f.getAttribute('formatCode')])),palette};
 }
 function color(node,palette,fallback='#222'){if(!node)return fallback;let hex=node.getAttribute('rgb')?.slice(-6);if(!hex&&node.hasAttribute('theme'))hex=palette[+node.getAttribute('theme')];if(!hex&&node.hasAttribute('indexed'))hex=['000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF'][+node.getAttribute('indexed')%8];return /^[\da-f]{6}$/i.test(hex||'')?'#'+hex:fallback;}
 function formatted(value,xf,m){if(typeof value!=='number')return String(value??'');const id=+xf?.getAttribute('numFmtId')||0,code=m.formats.get(id)||'',tokens=code.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g,'');if([14,15,16,17,22].includes(id)||/[dy]/i.test(tokens)){return new Date(Date.UTC(1899,11,30)+value*86400000).toLocaleDateString('es-MX',{timeZone:'UTC'});}if([9,10].includes(id)||code.includes('%'))return(value*100).toLocaleString('es-MX',{maximumFractionDigits:2})+'%';if([2,4,39,40,44].includes(id)||/0\.00/.test(code))return value.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});return value.toLocaleString('es-MX',{maximumFractionDigits:6,useGrouping:!!code.includes(',')});}
 function layout(m){
  const xs=[0],ys=[0];for(const width of m.widths)xs.push(xs.at(-1)+width);for(const height of m.heights)ys.push(ys.at(-1)+height);
  const merged=new Map(),covered=new Set();for(const[a,b]of m.merges){merged.set(a.row+','+a.col,{rows:b.row-a.row+1,cols:b.col-a.col+1});for(let r=a.row;r<=b.row;r++)for(let c=a.col;c<=b.col;c++)if(r!==a.row||c!==a.col)covered.add(r+','+c);}
  const populated=(r,c)=>{const cell=m.cells.get(label(c)+r);return cell&&(cell.displayValue!==''&&cell.displayValue!=null||cell.formula);};
  const boxes=[];
  for(let r=1;r<=m.rows;r++)for(let c=1;c<=m.cols;c++){
   if(covered.has(r+','+c)||!m.heights[r-1]||!m.widths[c-1])continue;
   const cell=m.cells.get(label(c)+r),xf=m.xfs[cell?.style||0],merge=merged.get(r+','+c),alignment=xf&&first(xf,'alignment');
   const x=xs[c-1],y=ys[r-1],width=xs[c-1+(merge?.cols||1)]-x,height=ys[r-1+(merge?.rows||1)]-y;
   const align=alignment?.getAttribute('horizontal')||(typeof cell?.displayValue==='number'?'right':'left'),wrap=alignment?.getAttribute('wrapText')==='1',shrink=alignment?.getAttribute('shrinkToFit')==='1';
   let textX=x,textWidth=width;
   // Excel allows text in an unmerged cell to extend over empty neighbors.
   // Keep the actual cell geometry; expand only the separate text layer.
   if(!merge&&!wrap&&!shrink&&typeof cell?.displayValue==='string'&&cell.displayValue){
    let left=c,right=c;while(left>1&&!populated(r,left-1)&&!covered.has(r+','+(left-1))&&!merged.has(r+','+(left-1)))left--;
    while(right<m.cols&&!populated(r,right+1)&&!covered.has(r+','+(right+1))&&!merged.has(r+','+(right+1)))right++;
    if(align==='left'||align==='general'){textWidth=xs[right]-x;}
    else if(align==='right'){textX=xs[left-1];textWidth=x+width-textX;}
    else if(align==='center'){const center=x+width/2,radius=Math.min(center-xs[left-1],xs[right]-center);textX=center-radius;textWidth=radius*2;}
   }
   boxes.push({address:label(c)+r,row:r,col:c,cell,xf,merge,alignment,x,y,width,height,textX,textWidth,align,wrap,shrink,text:formatted(cell?.displayValue??'',xf,m)});
  }
  return{boxes,width:Math.max(xs.at(-1),...m.images.map(i=>i.x+i.w)),height:Math.max(ys.at(-1),...m.images.map(i=>i.y+i.h))};
 }
 function render(m,host){
  const geometry=layout(m),surface=document.createElement('div'),frame=document.createElement('div');surface.className='excel-sheet';frame.className='excel-frame';
  Object.assign(surface.style,{position:'relative',width:geometry.width+'px',height:geometry.height+'px',background:'white',transformOrigin:'top left',overflow:'hidden'});
  const texts=[];let canvas;
  try{canvas=document.createElement('canvas').getContext('2d');}catch{}
  for(const box of geometry.boxes){
   const {cell,xf,alignment}=box,base=document.createElement('div');base.className='excel-cell';base.dataset.cell=box.address;
   Object.assign(base.style,{position:'absolute',boxSizing:'border-box',left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'});
   const font=m.fonts[+xf?.getAttribute('fontId')||0],fill=m.fills[+xf?.getAttribute('fillId')||0],border=m.borders[+xf?.getAttribute('borderId')||0];
   const pattern=fill&&first(fill,'patternFill');if(pattern?.getAttribute('patternType')==='solid')base.style.backgroundColor=color(first(pattern,'fgColor'),m.palette,'white');
   for(const side of ['left','right','top','bottom']){
    let edge=border&&first(border,side);
    if(box.merge&&(side==='right'||side==='bottom')){const end=m.cells.get(label(box.col+box.merge.cols-1)+(box.row+box.merge.rows-1)),endXf=m.xfs[end?.style||0],endBorder=m.borders[+endXf?.getAttribute('borderId')||0];edge=(endBorder&&first(endBorder,side))||edge;}
    const style=edge?.getAttribute('style');if(style)base.style['border'+side[0].toUpperCase()+side.slice(1)]=(style==='medium'?'2':style==='thick'?'3':'1')+'px '+(style==='dashed'?'dashed':style==='dotted'?'dotted':style==='double'?'double':'solid')+' '+color(first(edge,'color'),m.palette);
   }
   surface.append(base);if(!box.text)continue;
   const text=document.createElement('div'),span=document.createElement('span');text.className='excel-text';text.dataset.cell=box.address;span.textContent=box.text;text.title=box.text;
   const family=(font&&first(font,'name')?.getAttribute('val')||'Calibri')+',Arial,sans-serif';let size=(+(font&&first(font,'sz')?.getAttribute('val'))||11)*4/3;
   const weight=font&&first(font,'b')?'700':'400',italic=font&&first(font,'i')?'italic':'normal';
   if(!box.wrap&&canvas){canvas.font=italic+' '+weight+' '+size+'px '+family;const measured=canvas.measureText(box.text).width;if(measured>box.textWidth-6)size*=Math.max(1,box.textWidth-6)/measured;}
   Object.assign(text.style,{position:'absolute',boxSizing:'border-box',left:box.textX+'px',top:box.y+'px',width:box.textWidth+'px',height:box.height+'px',padding:'0 3px',overflow:'hidden',display:'flex',flexDirection:'column',justifyContent:alignment?.getAttribute('vertical')==='top'?'flex-start':alignment?.getAttribute('vertical')==='center'?'center':'flex-end',textAlign:box.align,fontFamily:family,fontSize:size+'px',fontWeight:weight,fontStyle:italic,lineHeight:'1.15',color:color(font&&first(font,'color'),m.palette),whiteSpace:box.wrap?'pre-wrap':'pre',overflowWrap:box.wrap?'break-word':'normal',pointerEvents:'none'});
   if(font&&first(font,'u'))span.style.textDecoration='underline';text.append(span);texts.push(text);
  }
  surface.append(...texts);const urls=[];
  for(const image of m.images){
   const holder=document.createElement('div'),img=document.createElement('img'),crop=image.crop||{},horizontal=1-(crop.l||0)-(crop.r||0),vertical=1-(crop.t||0)-(crop.b||0);img.alt='';const url=URL.createObjectURL(new Blob([image.bytes],{type:image.mime}));urls.push(url);img.src=url;
   Object.assign(holder.style,{position:'absolute',left:image.x+'px',top:image.y+'px',width:image.w+'px',height:image.h+'px',overflow:'hidden',pointerEvents:'none'});
   Object.assign(img.style,{position:'absolute',maxWidth:'none',width:100/horizontal+'%',height:100/vertical+'%',left:-(crop.l||0)/horizontal*100+'%',top:-(crop.t||0)/vertical*100+'%'});holder.append(img);surface.append(holder);
  }
  frame.append(surface);host.replaceChildren(frame);host.scrollTop=0;host.scrollLeft=0;
  let fitting=true,scale=1;
  const resize=()=>{if(fitting){const css=typeof getComputedStyle==='function'?getComputedStyle(host):null,space=(host.clientWidth||geometry.width)-(parseFloat(css?.paddingLeft)||0)-(parseFloat(css?.paddingRight)||0);scale=Math.min(1,Math.max(.1,space/geometry.width));}surface.style.transform='scale('+scale+')';frame.style.width=geometry.width*scale+'px';frame.style.height=geometry.height*scale+'px';};
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(host);resize();
  const cleanup=()=>{observer?.disconnect();urls.forEach(URL.revokeObjectURL);};cleanup.fit=()=>{fitting=true;resize();};cleanup.actual=()=>{fitting=false;scale=1;resize();};return cleanup;
 }

 let cleanup=null;
 async function open(id,{actions}={}){let dialog=document.getElementById('excel-preview');if(!dialog){dialog=document.createElement('dialog');dialog.id='excel-preview';dialog.className='glass preview-dialog';dialog.innerHTML='<div class="preview-heading"><div><p class="eyebrow">VISTA PREVIA DEL EXCEL</p><h2></h2></div><button class="icon" aria-label="Cerrar vista previa" data-close>×</button></div><div class="preview-tools"><button class="glass action" data-download disabled>Descargar Excel</button><button class="glass action" type="button" data-fit>Ajustar al ancho</button><button class="glass action" type="button" data-actual>100%</button><span role="status"></span></div><p class="preview-note">Vista de la primera hoja. El Excel descargado conserva el formato original.</p><div class="excel-scroll"></div><div class="preview-actions"></div>';document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{cleanup?.();cleanup=null;});}
  cleanup?.();cleanup=null;const heading=dialog.querySelector('h2'),status=dialog.querySelector('[role=status]'),host=dialog.querySelector('.excel-scroll'),buttons=dialog.querySelector('.preview-actions'),download=dialog.querySelector('[data-download]');heading.textContent='Cargando…';status.textContent='';host.replaceChildren();buttons.replaceChildren();download.disabled=true;if(!dialog.open)dialog.showModal();const requestId=crypto.randomUUID();dialog.dataset.request=requestId;dialog.dataset.record=id;
  try{const record=await RequiCloud.file(id);if(dialog.dataset.request!==requestId||!dialog.open)return;heading.textContent=record.file;download.disabled=false;download.onclick=()=>RequiLocal.saveBlob(record.blob,record.file);const m=await model(await record.blob.arrayBuffer());if(dialog.dataset.request!==requestId||!dialog.open)return;cleanup=render(m,host);dialog.querySelector('[data-fit]').onclick=()=>cleanup?.fit();dialog.querySelector('[data-actual]').onclick=()=>cleanup?.actual();status.textContent=m.warnings.length?'Algunas fórmulas usan el valor guardado. Comprueba el Excel descargado.':'';if(actions)await actions(buttons,record,dialog);}catch(e){status.textContent=e.message;}
 }
 globalThis.RequiPreview={open,model,calc,layout,formatted};
})();
