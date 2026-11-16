

  // CONTACT — every record is a separate JSON file in Content\Contact.
  let contactRecords = [];
  let contactCloseTimer = 0;
  function setContactTask(active) { setTaskActive('contact-manager',active); }
  function contactStatus(message) { $('contact-status').textContent = message; }
  async function runContactSafe(fn) {
    if (state.busy) return;
    try { state.busy=true; await fn(); }
    catch (error) {
      console.error(error);
      contactStatus(error && error.message ? error.message : 'Kontakt műveleti hiba');
      if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) $('contact-disconnected').hidden = false;
      await reportOperationFailure('Contact Manager',error);
    }
    finally { state.busy=false; }
  }
  function openContact() {
    const win = $('contact-window');
    win.classList.remove('closing','app-minimized');
    registerTask('contact-manager','▤ Contact Manager',() => { if (win.classList.contains('app-minimized')) restoreContact(); else minimizeContact(); });
    positionContactWindow();
    bringAppToFront(win);
    void win.offsetWidth;
    win.classList.add('open');
    setContactTask(true);
    $('contact-disconnected').hidden = !!state.contactDir;
    if (state.contactDir) runContactSafe(reloadContacts);
  }
  function minimizeContact() {
    const win = $('contact-window');
    if (!win.classList.contains('open')) return;
    win.classList.add('app-minimized');
    setContactTask(false);
  }
  function restoreContact() {
    const win = $('contact-window');
    win.classList.remove('app-minimized');
    positionContactWindow();
    bringAppToFront(win);
    setContactTask(true);
  }
  function closeContact() {
    const win = $('contact-window');
    if (!win.classList.contains('open') && !win.classList.contains('closing')) return;
    win.classList.remove('open'); win.classList.add('closing'); setContactTask(false);
    window.clearTimeout(contactCloseTimer);
    contactCloseTimer = window.setTimeout(() => { win.classList.remove('closing','app-minimized'); removeTask('contact-manager'); },270);
  }
  function positionContactWindow() {
    const win = $('contact-window');
    const vw = Math.max(320,window.innerWidth || document.documentElement.clientWidth);
    const vh = Math.max(240,window.innerHeight || document.documentElement.clientHeight);
    const taskbar = document.querySelector('.taskbar');
    const workHeight = Math.max(180,vh-(taskbar ? taskbar.getBoundingClientRect().height : 32));
    win.style.setProperty('left','50%','important');
    win.style.setProperty('top',(workHeight/2)+'px','important');
    win.style.setProperty('width',Math.max(1,Math.min(1040,vw-24))+'px','important');
    win.style.setProperty('height',Math.max(1,Math.min(700,workHeight-16))+'px','important');
    win.style.setProperty('transform','translate(-50%,-50%)','important');
  }
  function normalizeContactName(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hu-HU').trim();
  }
  function makeContactId() {
    return (window.crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : 'contact-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  }
  async function reloadContacts() {
    if (!state.contactDir) {
      $('contact-disconnected').hidden = false;
      contactRecords = []; renderContactList();
      contactStatus('Nincs csatlakoztatva: Content\\Contact');
      return;
    }
    const loaded = [];
    let unreadable = 0;
    for await (const [fileName,handle] of state.contactDir.entries()) {
      if (handle.kind !== 'file' || !/\.json$/i.test(fileName)) continue;
      try {
        const file = await handle.getFile();
        if (file.size > 1024*1024) { unreadable++; continue; }
        const data = JSON.parse(await file.text());
        if (!data || typeof data.name !== 'string') { unreadable++; continue; }
        loaded.push({
          id: typeof data.id === 'string' ? data.id : fileName,
          name: data.name, title: typeof data.title === 'string' ? data.title : '',
          phone: typeof data.phone === 'string' ? data.phone : '',
          email: typeof data.email === 'string' ? data.email : '',
          createdAt: data.createdAt || '', updatedAt: data.updatedAt || '',
          fileName, handle
        });
      } catch (error) { unreadable++; console.warn('Nem olvasható kontaktfájl:',fileName,error); }
    }
    loaded.sort((a,b)=>a.name.localeCompare(b.name,'hu',{sensitivity:'base'}));
    contactRecords = loaded;
    renderContactList();
    renderSearcherResults();
    contactStatus(`${contactRecords.length} kontakt betöltve${unreadable ? ` · ${unreadable} fájl nem olvasható` : ''} · Content\\Contact`);
  }
  function renderContactList() {
    const host = $('contact-list');
    host.replaceChildren();
    const newest = [...contactRecords].sort((a,b) => {
      const aTime = Date.parse(a.createdAt || a.updatedAt || '') || 0;
      const bTime = Date.parse(b.createdAt || b.updatedAt || '') || 0;
      return bTime - aTime || b.fileName.localeCompare(a.fileName,'hu');
    });
    $('contact-count').textContent = `${newest.length} személy`;
    for (let index=0; index<newest.length; index++) {
      const record = newest[index];
      const row = document.createElement('div'); row.className='contact-recent-row';
      const number = document.createElement('span'); number.className='contact-recent-index'; number.textContent=String(index+1).padStart(2,'0');
      const copy = document.createElement('span'); copy.className='contact-recent-copy';
      const name = document.createElement('span'); name.className='contact-recent-name'; name.textContent=record.name||'No data';
      const date = document.createElement('span'); date.className='contact-recent-date';
      date.textContent = record.createdAt ? new Date(record.createdAt).toLocaleString('hu-HU') : 'Korábban rögzítve';
      copy.append(name,date); row.append(number,copy); host.append(row);
    }
    if (!newest.length) {
      const note = document.createElement('div'); note.className='contact-empty';
      note.textContent = state.contactDir ? 'Még nincs elmentett kontakt.\nA jobb oldali űrlapon vehetsz fel új személyt.' : 'Csatlakoztasd a Content mappát a kontaktok rögzítéséhez.';
      host.append(note);
    }
  }
  function fillContactForm(focus=false) {
    $('contact-name').value = '';
    $('contact-title').value = '';
    $('contact-phone').value = '';
    $('contact-email').value = '';
    $('contact-editor-title').textContent = 'Új kontakt';
    if (focus) $('contact-name').focus();
  }
  function newContact() {
    fillContactForm(false);
    renderContactList();
    $('contact-name').focus();
  }
  async function saveContact(event) {
    if (event) event.preventDefault();
    if (!state.contactDir) { $('contact-disconnected').hidden=false; throw new Error('Előbb csatlakoztasd a Content mappát.'); }
    const form = $('contact-form');
    const rawName = $('contact-name').value.trim();
    const name = rawName ? validateName(rawName) : '';
    const title = $('contact-title').value.trim();
    const phone = $('contact-phone').value.trim();
    const email = $('contact-email').value.trim();
    const normalized = normalizeContactName(name);
    const duplicate = normalized ? contactRecords.find(record=>normalizeContactName(record.name)===normalized) : null;
    if (duplicate) throw new Error('Ezzel a névvel már van kontakt: '+duplicate.name+'. A Contact Manager csak új személy rögzítésére szolgál.');

    const fileBase = name || 'No Name';
    let fileName = `${fileBase}.json`, suffix=2;
    while(await entryExists(state.contactDir,fileName)) fileName=`${fileBase} (${suffix++}).json`;
    const now = new Date().toISOString();
    const payload = {
      format:'AERO-BASE-CONTACT', version:1, id:makeContactId(),
      name, title, phone, email, createdAt:now, updatedAt:now
    };
    const handle = await state.contactDir.getFileHandle(fileName,{create:true});
    const writer = await handle.createWritable();
    try { await writer.write(JSON.stringify(payload,null,2)); await writer.close(); }
    catch (error) { try { await writer.abort(); } catch (_) {} throw error; }

    await reloadContacts();
    fillContactForm(false);
    $('contact-name').focus();
    contactStatus('Új kontakt mentve: Content\\Contact\\'+fileName);
    await recordActivity('contact-saved',{name,fileName,path:'Content\\Contact\\'+fileName});
    notifyUser('Új kontakt mentve',name||fileName,'success');
  }
  // CONTACT SEARCHER — name-only results and independent profile windows.
  let profileWindowSequence = 0;
  const profileWindows = new Map();
