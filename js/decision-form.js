/* One decision in flight per requisition, including closing/reopening preview. */
(() => {
 const states=new Map();
 function mount(host,options){
  let state=states.get(options.id);
  if(!state){state={busy:false,rejecting:false,error:'',keys:{approved:crypto.randomUUID(),rejected:crypto.randomUUID()}};states.set(options.id,state);}
  if(!state.busy)state.rejecting=false;
  state.options=options;
  const form=document.createElement('form');form.className='decision-form';
  form.innerHTML='<label class="rejection-field" hidden>¿Por qué no se aprobó?<textarea class="glass" maxlength="4000" rows="4" placeholder="Escribe los comentarios para el solicitante"></textarea></label><div class="decision-buttons"><button class="glass action approve-action" type="button" data-approve>Aprobar</button><button class="glass action" type="button" data-reject>No aprobar</button><button class="glass action" type="submit" data-confirm hidden>Confirmar no aprobación</button></div>';
  host.append(form);
  const approve=form.querySelector('[data-approve]'),reject=form.querySelector('[data-reject]'),confirm=form.querySelector('[data-confirm]'),field=form.querySelector('.rejection-field'),textarea=form.querySelector('textarea');
  state.view=()=>{
   field.hidden=!state.rejecting;confirm.hidden=!state.rejecting;reject.hidden=state.rejecting;textarea.required=state.rejecting;textarea.disabled=state.busy;
   approve.textContent=state.busy&&state.decision==='approved'?'Aprobando…':state.rejecting?'Cancelar':'Aprobar';confirm.textContent=state.busy&&state.decision==='rejected'?'Guardando…':'Confirmar no aprobación';
   for(const button of [approve,reject,confirm])button.disabled=state.busy;
   form.setAttribute('aria-busy',String(state.busy));options.note.textContent=state.busy?'Guardando decisión y preparando correo…':state.error;
  };
  async function save(decision){
   if(state.busy)return;
   const comments=decision==='rejected'?textarea.value.trim():'';
   if(decision==='rejected'&&!comments){state.error='Escribe el motivo de no aprobación.';state.view();textarea.focus();return;}
   state.busy=true;state.decision=decision;state.error='';state.view();
   try{await state.options.save({decision,comments,requestId:state.keys[decision]});}
   catch(error){state.busy=false;state.error=error.message;state.view?.();return;}
   // A saved decision must never re-enable its old controls if refreshing the
   // preview fails. The server already owns the final decision at this point.
   states.delete(options.id);state.view=null;
   try{await state.options.done();}
   catch(error){state.options.note.textContent='La decisión se guardó. Cierra y vuelve a abrir la vista previa para actualizarla. '+error.message;}
  }
  approve.onclick=()=>{if(state.busy)return;if(state.rejecting){state.rejecting=false;state.error='';state.view();approve.focus();return;}return save('approved');};
  reject.onclick=()=>{if(state.busy||state.rejecting)return;state.rejecting=true;state.error='';state.view();textarea.focus();};
  form.onsubmit=event=>{event.preventDefault();if(state.rejecting)return save('rejected');};state.view();return form;
 }
 globalThis.RequiDecisionForm={mount};
})();
