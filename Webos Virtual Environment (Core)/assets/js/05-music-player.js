(()=>{
'use strict';
const $=id=>document.getElementById(id),panel=$('music-panel'),button=$('dock-music'),audio=$('music-audio');
if(!panel||!button||!audio)return;
let rootHandle=null,currentHandle=null,currentPath=[],currentEntries=[],currentTracks=[],playingIndex=-1,activeTrack=null,objectUrl='',audioContext=null,analyser=null,sourceNode=null,meterFrame=0,frequencyData=null;
const barNodes=[...button.querySelectorAll('.music-meter i')];
function status(message){$('music-player-status').textContent=message;}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function formatTime(value){if(!Number.isFinite(value)||value<0)return'0:00';const seconds=Math.floor(value);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
function isAudio(name){return /\.(mp3|wav|wave)$/i.test(name||'');}
function setPanel(open){if(open){panel.hidden=false;panel.setAttribute('aria-hidden','false');requestAnimationFrame(()=>panel.classList.add('open'));loadMusicRoot().catch(error=>status(error.message||'A zenetár nem tölthető be.'));}else{panel.classList.remove('open');panel.setAttribute('aria-hidden','true');setTimeout(()=>{if(!panel.classList.contains('open'))panel.hidden=true;},240);}}
async function getRoot(){
 if(!window.AERO_FILES||typeof window.AERO_FILES.getMusicDirectory!=='function')throw new Error('Először csatlakoztasd a Content mappát a File Managerben.');
 const handle=window.AERO_FILES.getMusicDirectory();if(!handle)throw new Error('A Content\\Music mappa még nem érhető el.');
 if(handle.queryPermission){let permission=await handle.queryPermission({mode:'read'});if(permission!=='granted'&&handle.requestPermission)permission=await handle.requestPermission({mode:'read'});if(permission!=='granted')throw new Error('A Music mappa olvasási engedélye szükséges.');}
 return handle;
}
async function loadMusicRoot(){rootHandle=await getRoot();await navigate(rootHandle,[]);status('A Content\\Music mappa betöltve.');}
async function navigate(handle,path){currentHandle=handle;currentPath=path.slice();currentEntries=[];currentTracks=[];
 for await(const [name,item] of handle.entries()){
  if(item.kind==='directory')currentEntries.push({name,handle:item,kind:'directory'});
  else if(item.kind==='file'&&isAudio(name))currentTracks.push({name,handle:item,path:path.concat(name)});
 }
 currentEntries.sort((a,b)=>a.name.localeCompare(b.name,'hu',{numeric:true,sensitivity:'base'}));currentTracks.sort((a,b)=>a.name.localeCompare(b.name,'hu',{numeric:true,sensitivity:'base'}));playingIndex=activeTrack?currentTracks.findIndex(t=>t.path.join('/')===activeTrack.path.join('/')):-1;
 $('music-path').textContent='Music'+(path.length?' / '+path.join(' / '):'');$('music-back').disabled=path.length===0;
 $('music-library-count').textContent=currentTracks.length+' zeneszám · '+currentEntries.length+' mappa';
 renderEntries();
}
function renderEntries(){
 const host=$('music-items');let html='';
 currentEntries.forEach((entry,index)=>{html+=`<button class="music-entry folder" type="button" data-music-folder="${index}"><span class="music-entry-icon">▰</span><span class="music-entry-info"><strong>${escapeHtml(entry.name)}</strong><small>MAPPA</small></span><span class="music-entry-action">›</span></button>`;});
 currentTracks.forEach((track,index)=>{const active=!!activeTrack&&track.path.join('/')===activeTrack.path.join('/');html+=`<button class="music-entry ${active?'active':''}" type="button" data-music-track="${index}"><span class="music-entry-icon">♫</span><span class="music-entry-info"><strong>${escapeHtml(track.name.replace(/\.(mp3|wav|wave)$/i,''))}</strong><small>${track.name.split('.').pop().toUpperCase()} AUDIO</small></span><span class="music-entry-action">${active&&!audio.paused?'Ⅱ':'▶'}</span></button>`;});
 if(!html)html='<div class="music-empty"><span>♫</span><strong>Ebben a mappában nincs zeneszám</strong><small>Helyezz MP3 vagy WAV fájlokat ebbe a mappába, vagy nyiss meg egy almappát.</small></div>';
 host.innerHTML=html;
}
async function playTrack(index){
 const track=currentTracks[index];if(!track)return;
 try{const file=await track.handle.getFile();if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(file);audio.src=objectUrl;audio.load();playingIndex=index;activeTrack=track;
  $('music-now-title').textContent=track.name.replace(/\.(mp3|wav|wave)$/i,'');$('music-now-folder').textContent='Music'+(track.path.length>1?' / '+track.path.slice(0,-1).join(' / '):'');$('music-play').textContent='Ⅱ';$('music-play').title='Szünet';
  await audio.play();await setupAnalyser();renderEntries();status('Lejátszás folyamatban.');
 }catch(error){console.error('Music lejátszási hiba:',error);status('A fájl nem indítható el: '+(error.message||error));}
}
async function setupAnalyser(){startMeter();}
function startMeter(){cancelAnimationFrame(meterFrame);button.classList.add('playing');button.classList.remove('analyser-active');button.setAttribute('aria-label','Zenelejátszó – zene szól');barNodes.forEach(node=>{node.style.removeProperty('height');node.style.removeProperty('transform');});}
function stopMeter(){cancelAnimationFrame(meterFrame);button.classList.remove('playing','analyser-active');button.setAttribute('aria-label','Zenelejátszó');barNodes.forEach(node=>{node.style.removeProperty('height');node.style.removeProperty('transform');});}
function updateTimeline(){const duration=audio.duration||0,current=audio.currentTime||0;$('music-current-time').textContent=formatTime(current);$('music-duration').textContent=formatTime(duration);$('music-seek').value=duration?String(Math.round(current/duration*1000)):'0';}
function nextTrack(direction){if(!currentTracks.length)return;let next=playingIndex<0?(direction>0?0:currentTracks.length-1):(playingIndex+direction+currentTracks.length)%currentTracks.length;playTrack(next);}
button.addEventListener('click',()=>setPanel(panel.hidden||!panel.classList.contains('open')));
$('music-panel-close').addEventListener('click',()=>setPanel(false));
$('music-refresh').addEventListener('click',()=>{if(currentHandle)navigate(currentHandle,currentPath).then(()=>status('Zenetár frissítve.')).catch(e=>status(e.message||'Frissítési hiba.'));else loadMusicRoot().catch(e=>status(e.message||'Betöltési hiba.'));});
$('music-items').addEventListener('click',e=>{const folder=e.target.closest('[data-music-folder]'),track=e.target.closest('[data-music-track]');if(folder){const entry=currentEntries[Number(folder.dataset.musicFolder)];if(entry)navigate(entry.handle,currentPath.concat(entry.name)).catch(error=>status(error.message||'A mappa nem nyitható meg.'));}else if(track)playTrack(Number(track.dataset.musicTrack));});
$('music-back').addEventListener('click',async()=>{if(!currentPath.length||!rootHandle)return;const newPath=currentPath.slice(0,-1);let handle=rootHandle;for(const part of newPath)handle=await handle.getDirectoryHandle(part);await navigate(handle,newPath);});
$('music-play').addEventListener('click',async()=>{if(!audio.src){if(currentTracks.length)await playTrack(0);else{status('Válassz ki egy zeneszámot.');}return;}if(audio.paused){try{await audio.play();await setupAnalyser();$('music-play').textContent='Ⅱ';}catch(error){status(error.message||'A lejátszás nem indítható.');}}else audio.pause();});
$('music-prev').addEventListener('click',()=>nextTrack(-1));$('music-next').addEventListener('click',()=>nextTrack(1));
$('music-seek').addEventListener('input',()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=(Number($('music-seek').value)/1000)*audio.duration;});
$('music-volume').addEventListener('input',()=>audio.volume=Number($('music-volume').value));audio.volume=.8;
audio.addEventListener('timeupdate',updateTimeline);audio.addEventListener('loadedmetadata',updateTimeline);audio.addEventListener('play',()=>{$('music-play').textContent='Ⅱ';$('music-play').title='Szünet';});audio.addEventListener('pause',()=>{if(!audio.ended){$('music-play').textContent='▶';$('music-play').title='Lejátszás';stopMeter();}});audio.addEventListener('ended',()=>{stopMeter();nextTrack(1);});audio.addEventListener('error',()=>{stopMeter();status('A hangfájl formátuma nem támogatott, vagy a fájl sérült.');});
window.addEventListener('aero:content-connected',()=>{rootHandle=null;if(!panel.hidden)loadMusicRoot().catch(error=>status(error.message||'A Music mappa nem tölthető be.'));});
window.AERO_MUSIC={open:()=>setPanel(true),close:()=>setPanel(false),refresh:()=>loadMusicRoot(),isPlaying:()=>!audio.paused};
})();
