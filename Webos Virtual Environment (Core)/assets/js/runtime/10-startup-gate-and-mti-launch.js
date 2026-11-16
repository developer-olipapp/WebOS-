


  // STARTUP GATE — the desktop is revealed only after connect or skip.
  function finishServerGate() {
    const gate=$('server-gate-screen');
    gate.classList.remove('visible');gate.setAttribute('aria-hidden','true');
    document.querySelectorAll('.desktop,.taskbar').forEach(el=>el.style.visibility='visible');
    document.body.classList.add('desktop-enter');
  }
  async function connectFromServerGate() {
    const button=$('server-gate-connect'),statusNode=$('server-gate-status');
    button.disabled=true;statusNode.textContent='Csatlakozás…';
    try {
      await connectPackageFolder();
      statusNode.textContent='Sikeres csatlakozás.';
      finishServerGate();
    } catch(error) {
      if(error&&error.name==='AbortError')statusNode.textContent='Megszakítva.';
      else statusNode.textContent=error&&error.message?error.message:'A csatlakozás nem sikerült.';
    } finally {button.disabled=false;}
  }

  // MTI.HU: ask the local WEBOS service to open only the shortcut beside WEBOS.html.
  // The service checks mti.ink first and mti.lnk as a compatibility spelling for Windows shortcuts.
  async function launchMtiChrome() {
    try {
      if(location.protocol!=='http:' || location.hostname!=='127.0.0.1')
        throw new Error('Az MTI parancsikon indításához a WEBOS-t a KIOSK BAT-fájllal kell elindítani.');
      const response=await fetch('/api/launch-mti',{method:'POST',cache:'no-store',credentials:'same-origin'});
      let result=null;try{result=await response.json();}catch(_){}
      if(!response.ok || !result || result.ok!==true)
        throw new Error(result&&result.error?result.error:'Az MTI parancsikon indítása nem sikerült (HTTP '+response.status+').');
    } catch(error) {
      console.error('MTI parancsikon indítási hiba:',error);
      window.alert('MTI indítási hiba\n\n'+(error&&error.message?error.message:String(error))+'\n\nEllenőrizd, hogy az mti.ink (vagy mti.lnk) parancsikon a WEBOS.html mellett található-e.');
    }
  }
