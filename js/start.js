/* Arranque por rutas relativas: compatible con /repositorio/ en GitHub Pages. */
(async () => {
  const base = new URL('../', document.currentScript.src);
  globalThis.REQUI_BASE = base.href;
  async function json(path) {const r=await fetch(new URL(path,base),{cache:'no-store'});if(!r.ok)throw Error('No se pudo cargar '+path);return r.json();}
  async function script(path) {await new Promise((resolve,reject)=>{const s=document.createElement('script');const url=new URL(path,base);url.searchParams.set('v','20261019-pdf-rows1');s.src=url;s.onload=resolve;s.onerror=()=>reject(Error('No se pudo cargar '+path));document.head.append(s);});}
  try {
    if(location.protocol!=='https:' && location.hostname!=='localhost') throw Error('Esta versión se abre desde GitHub Pages por HTTPS. No abras index.html mediante doble clic.');
    globalThis.REQUI_CONFIG=await json('config.json');
    if(!Array.isArray(REQUI_CONFIG.avatars)||REQUI_CONFIG.avatars.some(path=>typeof path!=='string'||!path.startsWith('assets/avatars/')||path.includes('..')))throw Error('Revisa la lista avatars de config.json.');
    const manifest=await json('assets/manifest.json');
    globalThis.__REQUI_EMBED__={assets:manifest.assets,books:manifest.books,fonts:manifest.fonts};
    await script('js/cloud.js'); await RequiCloud.connect();
    await script('js/pdf-worker.js'); await script('js/engine.js');
    RequiLocal.mount();
    for(const path of ['js/approval-ui.js','js/preview.js'])await script(path);
    if(RequiCloud.session.role==='boss'){await script('js/manager.js');}
    else for(const path of ['js/profiles.js','js/mail-profile.js','js/workflow.js','js/history.js','js/settings.js','js/navigation.js'])await script(path);
  } catch(error) {
    const box=document.getElementById('requi-boot');box.replaceChildren();
    const text=document.createElement('p');text.textContent=error.message;box.append(text);
    const retry=document.createElement('button');retry.textContent='Volver a intentar';retry.onclick=()=>location.reload();box.append(retry);
  }
})();
