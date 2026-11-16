(()=>{
'use strict';
const $=id=>document.getElementById(id),win=$('settings-window'),list=$('account-list'),backdrop=$('account-editor');
let editing=null;
function auth(){if(!window.AERO_ACCOUNT_AUTH)throw new Error('A fiókkezelő modul nem töltődött be.');return window.AERO_ACCOUNT_AUTH;}
function getUsers(){return auth().users();}
function setStorageStatus(message,type='info'){const el=$('account-storage-status');if(!el)return;el.textContent=message;el.dataset.state=type;}
function refreshStorageStatus(){try{const h=auth().storageHealth();const label=h.loginConnected?'Rendszerfájl mentés aktív: '+h.loginFile+' · '+h.mode:'Böngészőprofil-tároló aktív · a login.json API nem érhető el';setStorageStatus(label+(h.error?' · '+h.error:''),h.loginConnected?'success':'info');}catch(e){setStorageStatus(e.message||'A tárhely állapota nem olvasható.','error');}}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function render(){
 try{const users=getUsers();$('account-count').textContent=users.length+' fiók';
  if(!users.length)list.innerHTML='<div class="aero-tool-empty">Még nincs létrehozott felhasználói fiók. Az ADMIN profil nem jelenik meg ezen a listán.</div>';
  else list.innerHTML=users.map((u,i)=>`<article class="account-row"><div class="account-avatar">♙</div><div class="account-info"><strong>${escapeHtml(u.displayName||u.username)}</strong><small>@${escapeHtml(u.username)}</small></div><span class="account-state ${u.active===false?'disabled':''}">${u.active===false?'LETILTVA':'AKTÍV'}</span><div class="account-actions"><button type="button" data-edit="${i}">Szerkesztés</button><button type="button" class="delete" data-delete="${i}">Törlés</button></div></article>`).join('');
  refreshStorageStatus();
 }catch(error){list.innerHTML='<div class="aero-tool-empty">A fióklista betöltése sikertelen: '+escapeHtml(error.message||error)+'</div>';setStorageStatus(error.message||'Fióklista-hiba','error');}
}
async function open(){
 if(window.AERO_CURRENT_USER?.role!=='admin'){alert('Az Account Management használatához ADMIN hozzáférés szükséges.');return;}
 try{await auth().ready;win.classList.add('open');win.classList.remove('app-minimized');window.AERO_BRING_TO_FRONT?.(win);window.AERO_DOCK_TASKS?.register('settings','Settings');window.AERO_DOCK_TASKS?.setActive('settings',true);render();}
 catch(error){alert('A fiókkezelő nem indítható: '+(error.message||error));}
}
function close(){win.classList.remove('open','app-minimized');window.AERO_DOCK_TASKS?.remove('settings');}
function editor(account=null){
 editing=account?account.username:null;$('account-editor-title').textContent=account?'Fiók szerkesztése':'Új fiók létrehozása';
 $('account-username').value=account?.username||'';$('account-username').disabled=false;$('account-display').value=account?.displayName||'';$('account-password').value='';$('account-active').checked=account?.active!==false;$('account-form-error').textContent='';$('account-password').required=!account;backdrop.hidden=false;$('account-username').focus();
}
function hideEditor(){backdrop.hidden=true;$('account-form').reset();editing=null;}
$('account-add').addEventListener('click',()=>editor());$('account-editor-close').addEventListener('click',hideEditor);$('account-cancel').addEventListener('click',hideEditor);$('settings-close').addEventListener('click',close);
$('settings-minimize').addEventListener('click',()=>{win.classList.remove('open');win.classList.add('app-minimized');window.AERO_DOCK_TASKS?.setActive('settings',false);});
$('account-form').addEventListener('submit',async e=>{
 e.preventDefault();const form=$('account-form'),saveButton=form.querySelector('[type="submit"]'),error=$('account-form-error');error.textContent='';if(saveButton){saveButton.disabled=true;saveButton.textContent='Mentés…';}
 try{
  await auth().ready;const username=$('account-username').value.trim(),displayName=$('account-display').value.trim(),password=$('account-password').value,users=getUsers();
  if(username.toLocaleLowerCase('en-US')==='admin')throw new Error('Az ADMIN rendszerfiók védett és nem kezelhető itt.');
  if(!/^[a-zA-Z0-9._-]{3,32}$/.test(username))throw new Error('A felhasználónév 3–32 karakter lehet: betű, szám, pont, _ vagy -.');
  if(users.some(u=>u.username.toLocaleLowerCase('en-US')===username.toLocaleLowerCase('en-US')&&u.username.toLocaleLowerCase('en-US')!==String(editing||'').toLocaleLowerCase('en-US')))throw new Error('Ez a felhasználónév már foglalt.');
  if(!editing&&password.length<4)throw new Error('A jelszó legalább 4 karakter legyen.');
  let passwordHash=null,salt=null;if(password){salt=auth().makeSalt();passwordHash=await auth().hash(password,salt);}
  let next;
  if(editing){next=users.map(u=>{if(u.username!==editing)return u;const updated={...u,username,displayName:displayName||username,active:$('account-active').checked,updatedAt:new Date().toISOString()};if(passwordHash){updated.passwordHash=passwordHash;updated.salt=salt;}return updated;});}
  else next=[...users,{id:(window.crypto&&crypto.randomUUID?crypto.randomUUID():'user-'+Date.now()),username,displayName:displayName||username,active:$('account-active').checked,passwordHash,salt,createdAt:new Date().toISOString(),updatedAt:null}];
  await auth().save(next);hideEditor();render();setStorageStatus('A fiók mentése sikeres. ('+auth().storageHealth().mode+')','success');
 }catch(saveError){console.error('Account Management mentési hiba:',saveError);error.textContent=saveError.message||'A fiók mentése nem sikerült.';setStorageStatus(error.textContent,'error');}
 finally{if(saveButton){saveButton.disabled=false;saveButton.textContent='Mentés';}}
});
list.addEventListener('click',async e=>{
 const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');
 if(edit){const account=getUsers()[Number(edit.dataset.edit)];if(account)editor(account);}
 if(del){const account=getUsers()[Number(del.dataset.delete)];if(account&&confirm(`Biztosan törlöd a(z) ${account.username} fiókot?`)){try{await auth().save(getUsers().filter(x=>x.username!==account.username));render();setStorageStatus('A fiók törlése sikeres.','success');}catch(error){alert(error.message||'A fiók törlése nem sikerült.');}}}
});
$('dock-settings').addEventListener('click',open);$('dock-search').addEventListener('click',()=>$('global-search-button').click());

// The dock has one mild hover lift only: no wave/magnification animation.
const dock=$('aero-dock');if(dock){dock.addEventListener('pointerover',e=>{const icon=e.target.closest('.dock-icon');if(!icon)return;document.querySelectorAll('#aero-dock .dock-icon').forEach(x=>x.classList.toggle('dock-hovered',x===icon));});dock.addEventListener('pointerleave',()=>document.querySelectorAll('#aero-dock .dock-icon').forEach(x=>x.classList.remove('dock-hovered')));}
window.addEventListener('aero:accounts-updated',()=>{if(win.classList.contains('open'))render();});
window.AERO_SETTINGS={open,close,render};
})();
