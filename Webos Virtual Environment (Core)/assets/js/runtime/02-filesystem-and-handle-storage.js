

  // A kiválasztott gyökérmappa-handle IndexedDB-ben marad; a fájlírásokhoz nem kérünk engedélyt mentésenként.
  const HANDLE_DB_NAME = 'aero-base-local-handles';
  let handleDbPromise = null;
  function openHandleDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('Az IndexedDB nem érhető el.'));
    if (handleDbPromise) return handleDbPromise;
    handleDbPromise = new Promise((resolve,reject) => {
      const request = indexedDB.open(HANDLE_DB_NAME,1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('handles')) request.result.createObjectStore('handles'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('A helyi tárhely-adatbázis nem nyitható meg.'));
    });
    return handleDbPromise;
  }
  let packageHandleSaved = false;
  async function requestPersistentWebStorage() {
    // Preserve IndexedDB (and therefore the saved directory handle) against automatic storage eviction.
    try {
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        const persisted = await navigator.storage.persist();
        console.info('WEBOS persistent storage:', persisted ? 'enabled' : 'not granted by browser');
        return persisted;
      }
    } catch (error) { console.warn('A böngésző nem engedélyezte a tartós webes tárhelyet:', error); }
    return false;
  }
  async function persistPackageHandle(handle,isContent=false) {
    try {
      const db = await openHandleDb();
      await new Promise((resolve,reject) => {
        const tx = db.transaction('handles','readwrite');
        tx.objectStore('handles').put(handle,'packageRoot');
        tx.objectStore('handles').put(!!isContent,'packageRootIsContent');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('A mappakapcsolat mentése megszakadt.'));
      });
      packageHandleSaved = true;
      await requestPersistentWebStorage();
    } catch (error) {
      packageHandleSaved = false;
      console.warn('A Content mappa-kapcsolat nem jegyezhető meg ezen a böngészőprofilon:',error);
      return false;
    }
    return true;
  }
  async function readPackageHandle() {
    const db = await openHandleDb();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('handles','readonly');
      const store=tx.objectStore('handles');
      const handleRequest=store.get('packageRoot');
      const flagRequest=store.get('packageRootIsContent');
      let handle=null,isContent=false,complete=0;
      const finish=()=>{complete++;if(complete===2)resolve({handle:handle||null,isContent:!!isContent});};
      handleRequest.onsuccess=()=>{handle=handleRequest.result||null;finish();};
      flagRequest.onsuccess=()=>{isContent=!!flagRequest.result;finish();};
      handleRequest.onerror=()=>reject(handleRequest.error||new Error('A korábbi mappakapcsolat nem olvasható be.'));
      flagRequest.onerror=()=>reject(flagRequest.error||new Error('A mappakapcsolat beállítása nem olvasható be.'));
    });
  }

  // Fixed Windows Content storage, exposed through the bundled loopback service.
  // This keeps the existing File System Access-style interface without opening a folder picker.
  const SERVER_CONTENT_DISPLAY_PATH = 'C:\\WebosContentFolder\\Content';
  function validateServerEntryName(name) {
    if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[\\/]/.test(name) || /[<>:"|?*\x00-\x1F]/.test(name)) {
      throw new TypeError('Érvénytelen fájl- vagy mappanév.');
    }
    return name;
  }
  function serverContentUrl(action, parts=[]) {
    const query = new URLSearchParams();
    query.set('path', parts.join('/'));
    return '/api/content/' + action + '?' + query.toString();
  }
  async function serverContentRequest(action, parts=[], method='GET', body=null) {
    const response = await fetch(serverContentUrl(action,parts), {
      method, cache:'no-store', credentials:'same-origin', body
    });
    if (!response.ok) {
      let detail = null;
      try { detail = await response.json(); } catch (_) {}
      const error = new Error(detail && detail.error ? detail.error : ('A Content művelet nem sikerült (HTTP ' + response.status + ').'));
      error.name = detail && detail.name ? detail.name : (response.status === 404 ? 'NotFoundError' : 'UnknownError');
      throw error;
    }
    return response;
  }
  class ServerContentFileHandle {
    constructor(parts) {
      this.kind = 'file';
      this.pathParts = parts.slice();
      this.name = this.pathParts[this.pathParts.length-1] || '';
    }
    async getFile() {
      const response = await serverContentRequest('read',this.pathParts);
      const blob = await response.blob();
      const modified = Date.parse(response.headers.get('Last-Modified') || '') || Date.now();
      return new File([blob],this.name,{type:blob.type || 'application/octet-stream',lastModified:modified});
    }
    async createWritable() {
      const chunks = [];
      let closed = false;
      return {
        write: async value => {
          if (closed) throw new DOMException('A fájlíró már le van zárva.','InvalidStateError');
          if (value && typeof value === 'object' && ['write','truncate','seek'].includes(value.type)) {
            if (value.type === 'write') chunks.push(value.data);
            else if (value.type === 'truncate' && value.size === 0) chunks.length = 0;
            else throw new TypeError('A kért fájlíró művelet nem támogatott.');
          } else chunks.push(value);
        },
        close: async () => {
          if (closed) return;
          const payload = new Blob(chunks);
          await serverContentRequest('write',this.pathParts,'POST',payload);
          closed = true;
        },
        abort: async () => { chunks.length = 0; closed = true; }
      };
    }
    async isSameEntry(other) {
      return !!other && other.kind === 'file' && Array.isArray(other.pathParts) &&
        this.pathParts.length === other.pathParts.length && this.pathParts.every((part,index)=>part===other.pathParts[index]);
    }
  }
  class ServerContentDirectoryHandle {
    constructor(parts=[],displayPath=SERVER_CONTENT_DISPLAY_PATH) {
      this.kind = 'directory';
      this.pathParts = parts.slice();
      this.name = this.pathParts[this.pathParts.length-1] || 'Content';
      this.displayPath = displayPath;
      this.isWebosServerHandle = true;
    }
    async getDirectoryHandle(name,options={}) {
      validateServerEntryName(name);
      const parts = [...this.pathParts,name];
      await serverContentRequest('directory',parts,options.create?'POST':'GET');
      return new ServerContentDirectoryHandle(parts,this.displayPath);
    }
    async getFileHandle(name,options={}) {
      validateServerEntryName(name);
      const parts = [...this.pathParts,name];
      await serverContentRequest('file',parts,options.create?'POST':'GET');
      return new ServerContentFileHandle(parts);
    }
    async *entries() {
      const response = await serverContentRequest('list',this.pathParts);
      const data = await response.json();
      for (const item of (data.entries || [])) {
        const parts = [...this.pathParts,item.name];
        yield [item.name,item.kind === 'directory'
          ? new ServerContentDirectoryHandle(parts,this.displayPath)
          : new ServerContentFileHandle(parts)];
      }
    }
    async removeEntry(name,options={}) {
      validateServerEntryName(name);
      const parts = [...this.pathParts,name];
      const query = new URLSearchParams();
      query.set('path',parts.join('/'));
      query.set('recursive',options.recursive?'true':'false');
      const response = await fetch('/api/content/remove?' + query.toString(),{method:'DELETE',cache:'no-store',credentials:'same-origin'});
      if (!response.ok) {
        let detail=null;try{detail=await response.json();}catch(_){}
        const error=new Error(detail&&detail.error?detail.error:'A fájl vagy mappa törlése nem sikerült.');
        error.name=detail&&detail.name?detail.name:(response.status===404?'NotFoundError':'UnknownError');
        throw error;
      }
    }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
    async isSameEntry(other) {
      return !!other && other.kind === 'directory' && Array.isArray(other.pathParts) &&
        this.pathParts.length === other.pathParts.length && this.pathParts.every((part,index)=>part===other.pathParts[index]);
    }
    async resolve(other) {
      if (!other || other.kind !== 'directory' || !Array.isArray(other.pathParts) || other.pathParts.length < this.pathParts.length) return null;
      if (!this.pathParts.every((part,index)=>part===other.pathParts[index])) return null;
      return other.pathParts.slice(this.pathParts.length);
    }
  }
  async function connectFixedContentFolder() {
    const response = await fetch('/api/content/status',{cache:'no-store',credentials:'same-origin'});
    let result=null;try{result=await response.json();}catch(_){}
    if (!response.ok || !result || result.ok !== true) {
      throw new Error(result&&result.error?result.error:'A rögzített Content mappa nem érhető el. Indítsd újra a WEBOS indító BAT-fájlját.');
    }
    const contentHandle = new ServerContentDirectoryHandle([],result.path || SERVER_CONTENT_DISPLAY_PATH);
    await initializePackageFolder(contentHandle,false,true);
  }

  async function copyDirectoryContents(source,destination){
    for await (const [name,handle] of source.entries()){
      if(name==='.webos-folder')continue;
      if(handle.kind==='directory'){
        const target=await destination.getDirectoryHandle(name,{create:true});
        await copyDirectoryContents(handle,target);
      }else if(handle.kind==='file'){
        // Ütköző nevű régi fájlt nem hagyunk el és nem írunk felül: egyedi migrációs nevet kap.
        let targetName=name,exists=true;try{await destination.getFileHandle(targetName);}catch(error){if(error.name!=='NotFoundError')throw error;exists=false;}
        if(exists){const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';let suffix=1;while(exists){targetName=stem+' (migralt '+suffix+')'+ext;try{await destination.getFileHandle(targetName);suffix++;}catch(error){if(error.name!=='NotFoundError')throw error;exists=false;}}}
        const target=await destination.getFileHandle(targetName,{create:true});
        const file=await handle.getFile(),writer=await target.createWritable();try{await writer.write(await file.arrayBuffer());await writer.close();}catch(error){try{await writer.abort();}catch(_){}throw error;}
      }
    }
  }
  async function migrateLegacyEventFolders(content,eventJson,eventExport){
    const migrations=[['Event Studio',eventJson],['Event Export',eventExport]];
    for(const [legacyName,target] of migrations){
      let legacy=null;try{legacy=await content.getDirectoryHandle(legacyName);}catch(error){if(error.name!=='NotFoundError')console.warn('Régi eseménymappa nem olvasható:',legacyName,error);}
      if(!legacy)continue;
      try{await copyDirectoryContents(legacy,target);await content.removeEntry(legacyName,{recursive:true});console.info('Régi eseménymappa migrálva:',legacyName);}
      catch(error){console.error('Eseménymappa-migráció nem teljes:',legacyName,error);}
    }
  }
  async function migrateLegacyMtiPdfExport(mtiCollect,newPdfExport){
    let legacy=null;
    try{legacy=await mtiCollect.getDirectoryHandle('PDF EXPORT');}
    catch(error){if(error.name!=='NotFoundError')console.warn('Régi MTI PDF EXPORT mappa nem olvasható:',error);}
    if(!legacy)return;
    try{
      await copyDirectoryContents(legacy,newPdfExport);
      await mtiCollect.removeEntry('PDF EXPORT',{recursive:true});
      console.info('Régi MTI PDF EXPORT mappa az új EXPORT\\PDF helyre migrálva.');
    }catch(error){
      console.error('MTI exportmappa-migráció nem teljes; a régi mappa megmaradt:',error);
    }
  }
  async function initializePackageFolder(packageHandle, persist=true, selectedIsContent=null) {
    const isContent=typeof selectedIsContent==='boolean'?selectedIsContent:String(packageHandle.name||'').toLocaleLowerCase('hu-HU')==='content';
    const content = isContent ? packageHandle : await packageHandle.getDirectoryHandle('Content',{create:true});
    const contacts = await content.getDirectoryHandle('Contact',{create:true});
    const eventRoot = await content.getDirectoryHandle('Event',{create:true});
    const eventStudio = await eventRoot.getDirectoryHandle('Event Json',{create:true});
    const eventExport = await eventRoot.getDirectoryHandle('Event Export',{create:true});
    const eventWordExport = await eventExport.getDirectoryHandle('Word',{create:true});
    const eventPdfExport = await eventExport.getDirectoryHandle('PDF',{create:true});
    await migrateLegacyEventFolders(content,eventStudio,eventExport);
    const mtiCollect = await content.getDirectoryHandle('MTI Collect',{create:true});
    const mtiJsonImport = await mtiCollect.getDirectoryHandle('JSON IMPORT',{create:true});
    const mtiExport = await mtiCollect.getDirectoryHandle('EXPORT',{create:true});
    const mtiWordExport = await mtiExport.getDirectoryHandle('Word',{create:true});
    const mtiPdfExport = await mtiExport.getDirectoryHandle('PDF',{create:true});
    await migrateLegacyMtiPdfExport(mtiCollect,mtiPdfExport);
    const recycleBinDir = await content.getDirectoryHandle('Recycle Bin',{create:true});
    const musicDir = await content.getDirectoryHandle('Music',{create:true});
    for (const obsoleteName of ['Notifications','Log']) { try { await content.removeEntry(obsoleteName,{recursive:true}); } catch(error) { if(error.name!=='NotFoundError') console.warn('Régi Content-mappa eltávolítása nem sikerült:',obsoleteName,error); } }
    state.packageRoot = packageHandle; state.packageRootIsContent=isContent; state.contentRoot = content; state.contactDir = contacts; state.eventRootDir=eventRoot; state.eventStudioDir = eventStudio; state.eventExportDir = eventExport; state.eventWordExportDir=eventWordExport; state.eventPdfExportDir=eventPdfExport; state.mtiCollectDir=mtiCollect; state.mtiJsonImportDir=mtiJsonImport; state.mtiExportDir=mtiExport; state.mtiWordExportDir=mtiWordExport; state.mtiPdfExportDir=mtiPdfExport; state.recycleBinDir=recycleBinDir; state.musicDir=musicDir;
    window.AERO_FILES={getMusicDirectory:()=>state.musicDir,getContentDirectory:()=>state.contentRoot};
    window.AERO_CONTENT_CONNECTED=true;
    await recordActivity('content-connected',{path:'Content',packageRoot:packageHandle.name||''});
    state.currentPath = []; state.currentDir = content; state.selected = null;
    state.unlocked.clear(); state.expanded = new Set(['']);
    const handlePersisted = persist ? await persistPackageHandle(packageHandle,isContent) : true;
    await loadMeta();
    state.expanded=new Set(['']);
    await expandAllTreeDirectories(state.contentRoot,[],0);
    $('fm-empty').hidden = true; setButtons(true);
    await refreshAll(); await reloadContacts(); await reloadEventFolders(); await reloadMtiFiles();
    status(handlePersisted ? ('Content csatlakoztatva: ' + (packageHandle.displayPath || (isContent?packageHandle.name:packageHandle.name + '\\Content'))) : 'A Content csatlakozott, de a mappahivatkozás mentése nem szükséges vagy nem érhető el.');
    contactStatus('Tárhely csatlakoztatva — Content\\Contact');
    $('contact-disconnected').hidden = true;
    $('event-disconnected').hidden = true;
    eventStatus('Tárhely csatlakoztatva — Content\\Event\\Event Json');
    setExportStatus('Tárhely csatlakoztatva — Content\\Event\\Event Export');
    $('export-disconnected').hidden = true;
    $('mti-disconnected').hidden = true;
    setMtiStatus('Tárhely csatlakoztatva — Content\\MTI Collect\\JSON IMPORT');
    populateExportFolderSelect();
    window.dispatchEvent(new Event('aero:content-connected'));
    // If a saved folder handle finishes restoring after login, skip the gate automatically.
    if(window.AERO_CURRENT_USER && $('server-gate-screen').classList.contains('visible')) finishServerGate();
  }
  async function connectPackageFolder() {
    await connectFixedContentFolder();
  }
  async function connectOrResumeFolder() {
    await connectFixedContentFolder();
  }
  async function restoreSavedFolder() {
    const gateButton = $('server-gate-connect');
    const gateStatus = $('server-gate-status');
    if (gateButton) {
      gateButton.disabled = false;
      gateButton.textContent = 'Content mappa csatlakoztatása';
    }
    try {
      const response = await fetch('/api/content/status',{cache:'no-store',credentials:'same-origin'});
      const result = await response.json();
      if (!response.ok || !result || result.ok !== true) throw new Error(result&&result.error?result.error:'A Content mappa nem érhető el.');
      if (gateStatus) gateStatus.textContent = 'Készen áll: ' + (result.path || SERVER_CONTENT_DISPLAY_PATH);
    } catch (error) {
      console.warn('A rögzített Content mappa előkészítése nem sikerült:',error);
      if (gateStatus) gateStatus.textContent = 'A Content mappa nem érhető el. Indítsd újra a WEBOS indító BAT-fájlját.';
    }
  }
  async function loadMeta() {
    state.meta = {version:1,folderColors:{},vaults:{}};
    try {
      const handle = await state.contentRoot.getFileHandle(META_FILE);
      const file = await handle.getFile();
      const parsed = JSON.parse(await file.text());
      if (parsed && typeof parsed === 'object') {
        state.meta.folderColors = parsed.folderColors || {};
        state.meta.vaults = parsed.vaults || {};
      }
    } catch (e) { if (e.name !== 'NotFoundError') throw e; }
  }
  async function saveMeta() {
    const handle = await state.contentRoot.getFileHandle(META_FILE, {create:true});
    const writer = await handle.createWritable();
    await writer.write(JSON.stringify(state.meta, null, 2));
    await writer.close();
  }
  const pathKey = parts => parts.join('/');
  const joinPath = (a,b) => a ? a + '/' + b : b;
  function isLocked(key) { return !!state.meta.vaults[key] && !state.unlocked.has(key); }
  async function ensureUnlocked(parts) {
    for (let i=1; i<=parts.length; i++) {
      const key = pathKey(parts.slice(0,i));
      const record = state.meta.vaults[key];
      if (!record || state.unlocked.has(key)) continue;
      const result = await showDialog('Vault', [{name:'password',label:'Jelszó',type:'password'}]);
      if (!result) return false;
      const actual = await passwordHash(result.password, fromBase64(record.salt), record.iterations || 260000);
      if (actual !== record.hash) { status('Hibás jelszó. A mappa zárolva maradt.'); return false; }
      state.unlocked.add(key);
    }
    return true;
  }
  async function passwordHash(password, salt, iterations=260000) {
    if (!crypto.subtle) throw new Error('A Vault funkcióhoz Web Crypto támogatás szükséges.');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations,hash:'SHA-256'}, material, 256);
    return [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2,'0')).join('');
  }
  function toBase64(bytes) { let binary=''; bytes.forEach(b=>binary+=String.fromCharCode(b)); return btoa(binary); }
  function fromBase64(value) { return Uint8Array.from(atob(value), c=>c.charCodeAt(0)); }
