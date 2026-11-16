/* WEBOS Modular Bootstrap · Build 35
   Loads separate HTML components, CSS files and JS modules in strict source order.
   The shared runtime fragments are assembled as one Blob script to preserve the
   original closure and variable scope without eval/new Function. */
(async function WEBOSModuleBootstrap(){
  'use strict';
  const root=document.getElementById('webos-runtime-root');
  const loadText=async path=>{
    const response=await fetch(path,{cache:'no-cache'});
    if(!response.ok)throw new Error('A modul nem tölthető be ('+response.status+'): '+path);
    return response.text();
  };
  const loadScript=src=>new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;script.async=false;
    script.onload=()=>resolve();
    script.onerror=()=>reject(new Error('JavaScript modul betöltése sikertelen: '+src));
    document.body.appendChild(script);
  });
  try{
    const manifest=JSON.parse(await loadText('./system/module-manifest.json'));
    if(manifest.application!=='WEBOS'||manifest.version!=='35')throw new Error('Érvénytelen WEBOS moduljegyzék.');
    const bootPath=manifest.markup[0];
    root.innerHTML=await loadText(bootPath);
    const remaining=await Promise.all(manifest.markup.slice(1).map(loadText));
    root.insertAdjacentHTML('beforeend',remaining.join('\n'));
    window.WEBOS_MODULE_MANIFEST=manifest;
    window.WEBOS_CONTENT_STRUCTURE=JSON.parse(await loadText(manifest.contentStructure));

    for(const item of manifest.scripts){
      if(item==='@runtime-parts'){
        const partsManifest=JSON.parse(await loadText(manifest.runtimeParts));
        const sources=await Promise.all(partsManifest.parts.map(loadText));
        const source='(()=>{\n'+sources.join('\n')+'\n})();';
        const blob=new Blob([source],{type:'text/javascript'});
        const url=URL.createObjectURL(blob);
        try{await loadScript(url);}finally{URL.revokeObjectURL(url);}
      }else await loadScript(item);
    }
    document.body.classList.add('webos-modules-ready');
    window.dispatchEvent(new CustomEvent('webos:modules-ready',{detail:{version:35,modules:manifest.markup.length}}));
  }catch(error){
    console.error('WEBOS modulbetöltési hiba:',error);
    root.innerHTML='<main style="min-height:100vh;display:grid;place-items:center;padding:32px;background:#050b18;color:#eaf5ff;font:16px Segoe UI,Arial,sans-serif"><section style="max-width:680px;padding:28px;border:1px solid #5b789b;border-radius:18px;background:rgba(15,30,54,.94)"><h1 style="margin-top:0">WEBOS – Betöltési hiba</h1><p>A moduláris rendszer egyik fájlja nem tölthető be.</p><pre style="white-space:pre-wrap;color:#ffb7c4">'+String(error&&error.message||error).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</pre><p>Ellenőrizd, hogy a teljes ZIP-et kicsomagoltad-e, és a WEBOS-t a START_WEBOS_CHROME_KIOSK.bat fájllal indítod-e.</p></section></main>';
    document.body.classList.remove('booting');
  }
})();
