const $=id=>document.getElementById(id);let profiles=[],active=null,editing=null,avatar='',attached=null,profileTransitioning=false;
function error(message){$('error').textContent=message;$('error').hidden=false;clearTimeout(error.timer);error.timer=setTimeout(()=>$('error').hidden=true,6000)}
async function api(path,options={}){return RequiLocal.api(path,options)}
function screen(name){if($('history-dialog')?.open)$('history-dialog').close();document.body.dataset.screen=name;for(const key of ['profiles','editor','chat'])$(key).hidden=key!==name;$('error').hidden=true;document.body.classList.remove('collapsed');syncBackground()}
function initials(name){return name.trim().split(/\s+/).slice(0,2).map(v=>Array.from(v)[0]).join('').toUpperCase()}
function avatarContent(element,profile){element.replaceChildren();if(profile.avatar){const img=document.createElement('img');img.src=profile.avatar;img.alt='';element.append(img)}else element.textContent=initials(profile.name||'Nuevo')}
function renderProfiles(){const grid=$('profile-grid');grid.replaceChildren();for(const p of profiles){const card=document.createElement('div');card.className='profile-card';const select=document.createElement('button');select.className='profile-select';const image=document.createElement('span');image.className='avatar';avatarContent(image,p);const name=document.createElement('div');name.className='profile-name';name.textContent=p.name;select.append(image,name);select.onclick=()=>selectProfile(p);const edit=document.createElement('button');edit.className='edit-profile';edit.textContent='✎';edit.setAttribute('aria-label','Editar perfil de '+p.name);edit.onclick=()=>openEditor(p);card.append(select,edit);grid.append(card)}const add=document.createElement('button');add.className='profile-select profile-card new-profile';const circle=document.createElement('span');circle.className='avatar add-avatar';circle.textContent='＋';const label=document.createElement('div');label.className='profile-name';label.textContent='Nuevo usuario';add.append(circle,label);add.onclick=()=>openEditor();grid.append(add)}
async function openEditor(p=null){if(p){try{profiles=await api('/api/profiles');p=profiles.find(v=>v.id===p.id);if(!p){error('El perfil ya no existe.');renderProfiles();return}}catch(e){error(e.message);return}}p=profiles.find(v=>v.id===p?.id)||p;editing=p;$('profile-next').value=p?.nextNumber||1;$('delete-profile').hidden=!p;avatar=p?.avatar||'';$('profile-name').value=p?.name||'';$('profile-number').value=p?.number||'';$('editor-title').textContent=p?'EDITAR PERFIL':'NUEVO PERFIL';previewAvatar();previewControl();screen('editor');$('profile-name').focus()}
function fullControl(p){return p.number+String(p.nextNumber||1).padStart(4,'0')}
function previewControl(){$('profile-control-preview').textContent=$('profile-number').value+String($('profile-next').value||1).padStart(4,'0')}
$('profile-number').oninput=previewControl;$('profile-next').oninput=previewControl;
function previewAvatar(){avatarContent($('avatar-upload'),{name:$('profile-name').value,avatar})}
async function selectProfile(p){
 if(profileTransitioning)return;profileTransitioning=true;
 const outgoing=[];let incoming=null;
 const motion=!reducedMotion.matches&&typeof $('profiles').animate==='function';
 try{
  active={...p};$('active-profile').replaceChildren(document.createTextNode(p.name));
  const number=document.createElement('small');number.textContent=p.number?'Próximo: '+fullControl(p):'Número pendiente';$('active-profile').append(number);$('greeting').textContent='Hola, '+p.name;resetChat();
  if(motion){
   document.body.classList.add('profile-transition');$('profiles').setAttribute('aria-busy','true');
   for(const node of [$('profiles'),document.querySelector('body > header')].filter(Boolean))outgoing.push(node.animate([{opacity:1},{opacity:0}],{duration:180,easing:'ease-out',fill:'forwards'}));
   await Promise.all(outgoing.map(animation=>animation.finished.catch(()=>{})));
  }
  screen('chat');for(const animation of outgoing)animation.cancel();
  if(motion){incoming=$('chat').animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:380,easing:'cubic-bezier(.2,.7,.2,1)'});await incoming.finished.catch(()=>{})}
  $('prompt').focus();
 }finally{for(const animation of outgoing)animation.cancel();if(incoming)incoming.cancel();$('profiles').removeAttribute('aria-busy');document.body.classList.remove('profile-transition');profileTransitioning=false}
}
function resetChat(){if(window.resetWorkflow)window.resetWorkflow();attached=null;$('pdf').value='';$('attachment').hidden=true;$('messages').replaceChildren();$('prompt').value='';$('welcome').hidden=false}
function message(text,role){const div=document.createElement('div');div.className='message '+role;if(role==='assistant'){const label=document.createElement('strong');label.textContent='REQUI';div.append(label)}div.append(document.createTextNode(text));$('messages').append(div);$('welcome').hidden=true;div.scrollIntoView({block:'nearest'})}
async function showProfiles(){try{profiles=await api('/api/profiles');renderProfiles();screen('profiles')}catch(e){error(e.message)}}
$('home').onclick=showProfiles;$('cancel').onclick=()=>screen('profiles');$('profile-name').oninput=previewAvatar;$('avatar-upload').onclick=()=>$('avatar-dialog').showModal();
$('avatar-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){error('Elige una imagen PNG, JPG o WebP de hasta 2 MB.');return}const reader=new FileReader();reader.onload=()=>{avatar=reader.result;previewAvatar();if($('avatar-dialog').open)$('avatar-dialog').close();$('avatar-file').value=''};reader.readAsDataURL(file)};
$('profile-form').onsubmit=async e=>{e.preventDefault();const name=$('profile-name').value.trim(),number=$('profile-number').value.trim();if(!name||!number){error('Completa el nombre y el número de usuario.');return}try{profiles=await api('/api/profiles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editing?.id,revision:editing?.revision,name,number,nextNumber:Number($('profile-next').value),avatar})});renderProfiles();screen('profiles')}catch(e){error(e.message)}};
$('switch-profile').onclick=()=>{if($('messages').children.length||attached){if(!confirm('¿Cambiar de perfil? Se descartará esta conversación de prueba.'))return}resetChat();showProfiles()};$('sidebar-toggle').onclick=()=>document.body.classList.toggle('collapsed');$('new-chat').onclick=()=>{resetChat();$('prompt').focus()};$('attach').onclick=()=>$('pdf').click();
$('pdf').onchange=e=>{const file=e.target.files[0];if(!file)return;if(!file.name.toLowerCase().endsWith('.pdf')||file.size>20*1024*1024){error('Elige un PDF de hasta 20 MB.');return}attached=file;$('attachment').hidden=false;$('attachment').replaceChildren(document.createTextNode('PDF · '+file.name+' · Solo seleccionado, sin analizar'));const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Quitar documento');remove.onclick=()=>{attached=null;$('attachment').hidden=true;$('pdf').value=''};$('attachment').append(remove)};
$('chat-form').onsubmit=e=>{e.preventDefault();const text=$('prompt').value.trim();if(!text&&!attached)return;message([text,attached?'Documento seleccionado: '+attached.name:''].filter(Boolean).join('\n'),'user');message('Tu perfil activo es '+active.name+' ('+(active.number||'número pendiente')+').\n\nEsta versión permite revisar la interfaz. Aún no analiza documentos ni genera requisiciones. Cuando conectemos tus plantillas y catálogos, este número se incluirá en el Excel.','assistant');$('prompt').value='';attached=null;$('attachment').hidden=true;$('pdf').value=''};
$('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chat-form').requestSubmit()}};
(async()=>{try{profiles=await api('/api/profiles');renderProfiles()}catch(e){error(e.message)}})();

$('close-avatars').onclick=()=>$('avatar-dialog').close();
$('custom-avatar').onclick=()=>{$('avatar-dialog').close();$('avatar-file').click()};
for(const [index,path] of REQUI_CONFIG.avatars.entries()){
 const i=index+1;
 const button=document.createElement('button');button.type='button';button.className='avatar-choice';button.setAttribute('aria-label','Elegir avatar '+i);
 const img=document.createElement('img');img.src=RequiLocal.asset(path);img.alt='Avatar '+i;button.append(img);
 button.onclick=async()=>{try{const response=await fetch(img.src);if(!response.ok)throw Error('No se pudo cargar el avatar.');const blob=await response.blob();const reader=new FileReader();reader.onload=()=>{avatar=reader.result;previewAvatar();$('avatar-dialog').close()};reader.onerror=()=>{$('avatar-dialog').close();error('No se pudo leer el avatar.')};reader.readAsDataURL(blob)}catch(e){$('avatar-dialog').close();error(e.message)}};
 $('avatar-bank').append(button);
}

async function deleteProfile(profile,button){
 if(!profile||!confirm('¿Eliminar el perfil de '+profile.name+'? Se borrarán su nombre, número de control y foto. Los Excel generados se conservarán.'))return;
 button.disabled=true;
 try{
  profiles=await api('/api/profiles/'+encodeURIComponent(profile.id),{method:'DELETE'});
  if(active?.id===profile.id){active=null;resetChat();$('active-profile').replaceChildren();$('greeting').textContent=''}
  editing=null;avatar='';renderProfiles();screen('profiles');
 }catch(e){error(e.message)}finally{button.disabled=false}
}
$('delete-profile').onclick=()=>deleteProfile(editing,$('delete-profile'));

const videoFadeTimers={};
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
function syncBackground(){
 const activeVideo=document.body.dataset.screen==='chat'?'background-requi':'background-user';
 for(const id of ['background-user','background-requi']){
  const video=$(id);clearTimeout(videoFadeTimers[id]);video.muted=true;
  if(id===activeVideo){
   const wasHidden=video.hidden;video.hidden=false;
   if(wasHidden){void video.offsetWidth}
   video.classList.add('is-visible');
   if(document.hidden||reducedMotion.matches){video.pause();continue}
   if(!video.getAttribute('src')){video.src=video.dataset.src;video.load()}
   const started=video.play();if(started)started.catch(()=>{video.dataset.needsPlay='true'});
  }else{
   video.classList.remove('is-visible');
   const stop=()=>{if((document.body.dataset.screen==='chat'?'background-requi':'background-user')!==id){video.pause();video.hidden=true}};
   if(document.hidden||reducedMotion.matches)stop();else videoFadeTimers[id]=setTimeout(stop,460);
  }
 }
}
document.addEventListener('visibilitychange',syncBackground);
if(reducedMotion.addEventListener)reducedMotion.addEventListener('change',syncBackground);
else reducedMotion.addListener(syncBackground);
syncBackground();

// WebKit may require a user gesture for the first playback.
for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{
 const id=document.body.dataset.screen==='chat'?'background-requi':'background-user';
 const video=document.getElementById(id);
 if(video&&!video.hidden&&!reducedMotion.matches&&video.paused){video.muted=true;video.play().catch(()=>{});}
},{passive:true});

// A native window can become visible after the initial page event.
window.addEventListener('focus',syncBackground);
window.addEventListener('pageshow',syncBackground);
setTimeout(syncBackground,300);
setTimeout(syncBackground,1200);

async function refreshProfilesAfterGeneration(){profiles=await api('/api/profiles');const updated=profiles.find(p=>p.id===active?.id);if(updated){active={...updated};const label=$('active-profile').querySelector('small');if(label)label.textContent='Próximo: '+fullControl(active);}renderProfiles();}

function newRunId(){if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
