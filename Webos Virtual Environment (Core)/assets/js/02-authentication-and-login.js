(()=>{
'use strict';
const $=id=>document.getElementById(id);
const boot=$('boot-screen'),brand=$('boot-brand'),wrap=$('boot-progress-wrap'),fill=$('boot-progress-fill');
const login=$('login-screen'),form=$('login-form'),user=$('login-user'),pass=$('login-pass'),fx=$('login-exit');
let authenticated=false;
const ADMIN_USERNAME='Admin';
const FALLBACK_ADMIN={id:'WEBOS-SYSTEM-ADMIN',username:'Admin',displayName:'ADMIN',role:'admin',active:true,salt:'f8e8fc4a7a4f24d3da9ea23d64e56d5a',passwordHash:'42aa68db10170ee0f2db12d296104d4e991226e381b2b4cdd4ab04e12b45a11a',iterations:120000,createdAt:'2026-11-14T00:00:00.000Z'};
let systemAdminRecord={...FALLBACK_ADMIN},serverLoginAvailable=false;
const USERS_KEYS=['AERO_BASE_USER_ACCOUNTS_V3','AERO_BASE_USER_ACCOUNTS_V2','AERO_BASE_USER_ACCOUNTS_V1'];
const ACCOUNT_DB='aero-base-account-store-v3',ACCOUNT_STORE='accounts';
const LOGIN_FILE='login.json';
let accountCache=[],storageMode='initial',storageError='',loginFileMode='login.json · rendszerfájl';
const ITERATIONS=120000;

function bytes(value){return new TextEncoder().encode(String(value));}
function concatBytes(a,b){const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out;}
function hex(data){return [...data].map(v=>v.toString(16).padStart(2,'0')).join('');}
function fromHex(value){const clean=String(value||'').replace(/[^0-9a-f]/gi,'');if(!clean||clean.length%2)throw new Error('Sérült jelszó-só.');return Uint8Array.from(clean.match(/.{2}/g),x=>parseInt(x,16));}
const SHA_K=new Uint32Array([
0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);
function rotr(x,n){return(x>>>n)|(x<<(32-n));}
function sha256(input){
 const bitLen=input.length*8, paddedLen=Math.ceil((input.length+9)/64)*64;
 const data=new Uint8Array(paddedLen);data.set(input);data[input.length]=0x80;
 const view=new DataView(data.buffer);view.setUint32(paddedLen-4,bitLen>>>0);view.setUint32(paddedLen-8,Math.floor(bitLen/0x100000000));
 let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
 const w=new Uint32Array(64);
 for(let offset=0;offset<paddedLen;offset+=64){
  for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);
  for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2],s0=rotr(x,7)^rotr(x,18)^(x>>>3),s1=rotr(y,17)^rotr(y,19)^(y>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}
  let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
  for(let i=0;i<64;i++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),t1=(h+S1+ch+SHA_K[i]+w[i])>>>0,S0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
  h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
 }
 const out=new Uint8Array(32),v=new DataView(out.buffer);[h0,h1,h2,h3,h4,h5,h6,h7].forEach((x,i)=>v.setUint32(i*4,x));return out;
}
function hmacSha256(key,message){
 let k=key.length>64?sha256(key):key;const inner=new Uint8Array(64),outer=new Uint8Array(64);
 for(let i=0;i<64;i++){const v=i<k.length?k[i]:0;inner[i]=v^0x36;outer[i]=v^0x5c;}
 return sha256(concatBytes(outer,sha256(concatBytes(inner,message))));
}
async function fallbackPbkdf2(password,salt,iterations=ITERATIONS){
 const key=bytes(password),block=concatBytes(salt,new Uint8Array([0,0,0,1]));
 let u=hmacSha256(key,block),result=u.slice();
 for(let i=1;i<iterations;i++){
  u=hmacSha256(key,u);for(let j=0;j<result.length;j++)result[j]^=u[j];
  if(i%2000===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return hex(result);
}
async function hash(value,salt){
 const saltBytes=fromHex(salt),subtle=window.crypto&&window.crypto.subtle;
 if(subtle){try{const material=await subtle.importKey('raw',bytes(value),'PBKDF2',false,['deriveBits']);const bits=await subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:ITERATIONS,hash:'SHA-256'},material,256);return hex(new Uint8Array(bits));}catch(error){console.warn('Web Crypto nem használható, helyi PBKDF2 tartalék indul:',error);}}
 return await fallbackPbkdf2(value,saltBytes,ITERATIONS);
}
function makeSalt(){const out=new Uint8Array(16);try{if(window.crypto&&window.crypto.getRandomValues)window.crypto.getRandomValues(out);else for(let i=0;i<out.length;i++)out[i]=Math.floor(Math.random()*256);}catch(_){for(let i=0;i<out.length;i++)out[i]=Math.floor(Math.random()*256);}return hex(out);}
function makeUserId(){try{if(window.crypto&&typeof window.crypto.randomUUID==='function')return window.crypto.randomUUID();}catch(_){}return 'user-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);}
function normalizeUsers(value){
 if(!Array.isArray(value))return[];const out=[],seen=new Set(),ids=new Set();
 for(const item of value){if(!item||typeof item.username!=='string'||!item.username.trim()||typeof item.passwordHash!=='string'||typeof item.salt!=='string')continue;
  const username=item.username.trim(),key=username.toLocaleLowerCase('en-US');if(key==='admin'||seen.has(key))continue;seen.add(key);
  let id=String(item.id||'').trim();if(!id||ids.has(id))id=makeUserId();ids.add(id);
  out.push({id,username,displayName:String(item.displayName||username).trim()||username,active:item.active!==false,passwordHash:item.passwordHash,salt:item.salt,createdAt:item.createdAt||new Date().toISOString(),updatedAt:item.updatedAt||null});
 }
 return out;
}
function readLocalUsers(key){try{const raw=localStorage.getItem(key);return raw===null?null:normalizeUsers(JSON.parse(raw));}catch(error){storageError=error.message||String(error);return null;}}
function openDb(){return new Promise((resolve,reject)=>{if(!window.indexedDB){reject(new Error('IndexedDB nem érhető el.'));return;}const req=indexedDB.open(ACCOUNT_DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(ACCOUNT_STORE))req.result.createObjectStore(ACCOUNT_STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Az adatbázis nem nyitható meg.'));req.onblocked=()=>reject(new Error('A fiókadatbázis megnyitását egy másik böngészőablak blokkolja.'));});}
async function readDb(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(ACCOUNT_STORE,'readonly'),req=tx.objectStore(ACCOUNT_STORE).get('users');req.onsuccess=()=>{const result=req.result;db.close();resolve(result);};req.onerror=()=>{const error=req.error;db.close();reject(error||new Error('Az adatbázisból nem olvashatók a fiókok.'));};});}
async function writeDb(list){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(ACCOUNT_STORE,'readwrite');tx.objectStore(ACCOUNT_STORE).put(list,'users');tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=()=>{const error=tx.error;db.close();reject(error||new Error('Az adatbázis mentése sikertelen.'));};tx.onabort=()=>{const error=tx.error;db.close();reject(error||new Error('Az adatbázis mentése megszakadt.'));};});}
function normalizeAdmin(value){
 if(!value||typeof value!=='object'||String(value.username||'').toLocaleLowerCase('en-US')!=='admin'||typeof value.salt!=='string'||typeof value.passwordHash!=='string')return {...FALLBACK_ADMIN};
 return {...FALLBACK_ADMIN,...value,id:String(value.id||FALLBACK_ADMIN.id),username:'Admin',displayName:'ADMIN',role:'admin',active:value.active!==false};
}
function loginPayload(list,updatedAt=new Date().toISOString()){
 const admin=normalizeAdmin(systemAdminRecord);
 return {format:'WEBOS-LOGIN',version:2,application:'WEBOS',updatedAt,systemAccounts:[{id:admin.id,username:'Admin',displayName:'ADMIN',role:'admin',active:admin.active!==false,salt:admin.salt,passwordHash:admin.passwordHash,iterations:admin.iterations||ITERATIONS,createdAt:admin.createdAt||null}],users:list.map(u=>({id:u.id,username:u.username,displayName:u.displayName,active:u.active!==false,passwordHash:u.passwordHash,salt:u.salt,createdAt:u.createdAt,updatedAt:u.updatedAt||null}))};
}
async function readLoginApi(){
 const response=await fetch('/api/login?ts='+Date.now(),{method:'GET',cache:'no-store',credentials:'same-origin'});
 if(!response.ok)throw new Error('A login.json rendszerfájl nem olvasható (HTTP '+response.status+').');
 const data=await response.json();
 if(!data||data.format!=='WEBOS-LOGIN'||!Array.isArray(data.users))throw new Error('A login.json fájl formátuma hibás.');
 return data;
}
async function writeLoginApi(list){
 const response=await fetch('/api/login',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(loginPayload(list))});
 let result=null;try{result=await response.json();}catch(_){}
 if(!response.ok||!result||result.ok!==true)throw new Error(result&&result.error?result.error:'A login.json fájl mentése nem sikerült (HTTP '+response.status+').');
 return true;
}
function storageHealth(){return{mode:storageMode,error:storageError,count:accountCache.length,loginFile:loginFileMode,loginConnected:serverLoginAvailable};}
async function loadAccounts(){
 let loaded=null,source='';
 try{
  const fileData=await readLoginApi();
  serverLoginAvailable=true;systemAdminRecord=normalizeAdmin(Array.isArray(fileData.systemAccounts)?fileData.systemAccounts.find(x=>String(x.username||'').toLowerCase()==='admin'):null);
  loginFileMode='login.json · ZIP rendszerfájl';
  const fromFile=normalizeUsers(fileData.users);
  const pristine=(fileData.updatedAt===null||fileData.updatedAt===undefined)&&fromFile.length===0;
  if(pristine){
   for(const key of USERS_KEYS){const cached=readLocalUsers(key);if(cached!==null){if(cached.length){loaded=cached;source=key;await writeLoginApi(loaded);}break;}}
  }
  if(loaded===null){loaded=fromFile;source='login.json';}
 }catch(error){
  serverLoginAvailable=false;storageError=error.message||String(error);loginFileMode='login.json · helyi szolgáltatás nem érhető el';
  console.warn('login.json API nem érhető el; böngészőprofil-tároló használata:',error);
 }
 if(loaded===null){for(const key of USERS_KEYS){const value=readLocalUsers(key);if(value!==null){loaded=value;source=key;break;}}}
 if(loaded===null){try{const fromDb=await readDb();if(Array.isArray(fromDb)){loaded=normalizeUsers(fromDb);source='IndexedDB';}}catch(error){console.warn('Fiókadatbázis nem olvasható:',error);storageError=error.message||String(error);}}
 accountCache=loaded||[];
 let localSaved=false;try{localStorage.setItem(USERS_KEYS[0],JSON.stringify(accountCache));localSaved=true;}catch(error){storageError=error.message||String(error);}
 let dbSaved=false;try{await writeDb(accountCache);dbSaved=true;}catch(error){console.warn('IndexedDB kezdeti szinkron nem sikerült:',error);}
 storageMode=serverLoginAvailable?'login.json + helyi biztonsági másolat':localSaved&&dbSaved?'localStorage + IndexedDB':localSaved?'localStorage':dbSaved?'IndexedDB':'csak munkamenet';
 if(source&&source!=='login.json')console.info('Fiókadatok migrálva innen:',source);
 return accountCache;
}
const accountsReady=loadAccounts().catch(error=>{console.error('Fiókbetöltési hiba:',error);accountCache=[];systemAdminRecord={...FALLBACK_ADMIN};storageMode='csak munkamenet';storageError=error.message||String(error);return accountCache;});
async function saveAccounts(list){
 const normalized=normalizeUsers(list);
 let serverSaved=false,serverError=null;
 try{await writeLoginApi(normalized);serverSaved=true;serverLoginAvailable=true;loginFileMode='login.json · mentve';}
 catch(error){serverError=error;serverLoginAvailable=false;loginFileMode='login.json · mentés nem érhető el';}
 let localSaved=false,dbSaved=false,lastError=null;
 try{const value=JSON.stringify(normalized);localStorage.setItem(USERS_KEYS[0],value);localStorage.setItem(USERS_KEYS[1],value);localSaved=true;}catch(error){lastError=error;}
 try{await writeDb(normalized);dbSaved=true;}catch(error){lastError=error;}
 const localServerExpected=location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname);
 if(localServerExpected&&!serverSaved)throw new Error('A WEBOS helyi szolgáltatása nem érhető el, ezért a login.json nem frissült. Indítsd a WEBOS-t a START_WEBOS_CHROME_KIOSK.bat vagy START_WEBOS_EDGE_KIOSK.bat fájllal. Részlet: '+(serverError&&serverError.message||'kapcsolati hiba'));
 if(!serverSaved&&!localSaved&&!dbSaved)throw new Error('A böngésző nem engedélyezi a tartós fiókmentést. '+(lastError&&lastError.message?'Részlet: '+lastError.message:''));
 accountCache=normalized;storageError='';
 storageMode=serverSaved?'login.json rendszerfájl + helyi biztonsági másolat':localSaved&&dbSaved?'localStorage + IndexedDB':localSaved?'localStorage':'IndexedDB';
 window.dispatchEvent(new CustomEvent('aero:accounts-updated',{detail:{count:accountCache.length,storage:storageMode}}));return true;
}
function users(){return accountCache.map(x=>({...x}));}
function showLogin(){boot.style.display='none';login.classList.add('visible');document.body.classList.remove('booting');user.value='';pass.value='';user.focus();}
const startBootSequence=()=>{setTimeout(()=>brand&&brand.classList.add('visible'),350);setTimeout(()=>wrap&&wrap.classList.add('visible'),900);const pct=$('boot-progress-percent'),start=performance.now()+900;function tick(now){const progress=Math.min(100,((now-start)/4200)*100);if(fill)fill.style.width=progress+'%';if(pct)pct.textContent=Math.floor(progress)+'%';if(progress<100)requestAnimationFrame(tick);else setTimeout(showLogin,400);}requestAnimationFrame(tick);};window.addEventListener('webos:modules-ready',startBootSequence,{once:true});
form.addEventListener('submit',async e=>{
 e.preventDefault();if(authenticated)return;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
 try{await accountsReady;const name=user.value.trim(),password=pass.value;const adminRecord=normalizeAdmin(systemAdminRecord);let valid=false,selected=null;if(name.toLocaleLowerCase('en-US')===ADMIN_USERNAME.toLocaleLowerCase('en-US')&&adminRecord.active!==false){valid=(await hash(password,adminRecord.salt))===adminRecord.passwordHash;}
  if(!valid){const found=accountCache.find(x=>x.username.toLocaleLowerCase('en-US')===name.toLocaleLowerCase('en-US')&&x.active!==false);if(found){valid=(await hash(password,found.salt))===found.passwordHash;if(valid)selected=found;}}
  if(valid){authenticated=true;window.AERO_CURRENT_USER=selected?{username:selected.username,displayName:selected.displayName||selected.username,role:'user'}:{username:'Admin',displayName:'ADMIN',role:'admin'};login.style.opacity='0';login.style.transform='translateY(-18px) scale(.98)';fx.classList.add('active');setTimeout(()=>{login.style.display='none';document.body.classList.remove('booting');const gate=$('server-gate-screen');if(window.AERO_CONTENT_CONNECTED){gate.classList.remove('visible');gate.setAttribute('aria-hidden','true');document.querySelectorAll('.desktop,.taskbar').forEach(el=>el.style.visibility='visible');document.body.classList.add('desktop-enter');}else{gate.classList.add('visible');gate.setAttribute('aria-hidden','false');}},950);setTimeout(()=>{fx.classList.remove('active');fx.style.display='none';},1100);}
  else{$('login-error').textContent='Felhasználónév vagy jelszó hibás.';pass.value='';pass.focus();document.querySelector('.login-inner').animate([{transform:'translateX(0)'},{transform:'translateX(-7px)'},{transform:'translateX(7px)'},{transform:'translateX(0)'}],{duration:260});}
 }catch(error){console.error('Bejelentkezési hiba:',error);$('login-error').textContent=error.message||'A bejelentkezés nem sikerült.';}
 finally{if(submit)submit.disabled=false;}
});
[user,pass].forEach(el=>el.addEventListener('keydown',e=>{if(e.key==='Enter')form.requestSubmit();}));
window.AERO_ACCOUNT_AUTH={hash,makeSalt,users,ready:accountsReady,save:saveAccounts,storageHealth,adminName:ADMIN_USERNAME,systemAdmin:()=>({...systemAdminRecord})};
})();
