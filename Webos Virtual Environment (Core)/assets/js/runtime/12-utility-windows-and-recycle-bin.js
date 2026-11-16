
  let utilityWindowCloseTimers = new Map();
  let globalSearchDebounce = 0;
  let globalSearchSequence = 0;
  let pdfPreviewUrl = '';
  let pdfPreviewName = '';
  let pdfPreviewPage = 1;
  let pdfPreviewZoom = 100;
  let currentGlobalSearchResults = [];

  function normalizeGlobalSearchText(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hu-HU');
  }
  function isProtectedSystemPath(parts) {
    return Array.isArray(parts) && parts.length >= 1 && ['Recycle Bin'].includes(parts[0]);
  }

  // -------------------------- Utility windows --------------------------
  function openUtilityWindow(id,taskId,label) {
    const win=$(id);win.classList.remove('closing','app-minimized');
    registerTask(taskId,label,()=>{if(win.classList.contains('app-minimized'))restoreUtilityWindow(id,taskId);else minimizeUtilityWindow(id,taskId);});
    bringAppToFront(win);void win.offsetWidth;win.classList.add('open');setTaskActive(taskId,true);
    recordActivity('app-opened',{app:label});
  }
  function minimizeUtilityWindow(id,taskId) {const win=$(id);if(!win.classList.contains('open'))return;win.classList.add('app-minimized');setTaskActive(taskId,false);}
  function restoreUtilityWindow(id,taskId) {const win=$(id);win.classList.remove('app-minimized','closing');bringAppToFront(win);setTaskActive(taskId,true);}
  function closeUtilityWindow(id,taskId) {
    const win=$(id);if(!win.classList.contains('open')&&!win.classList.contains('closing'))return;
    win.classList.remove('open');win.classList.add('closing');setTaskActive(taskId,false);
    const old=utilityWindowCloseTimers.get(id);if(old)clearTimeout(old);
    const timer=setTimeout(()=>{win.classList.remove('closing','app-minimized');removeTask(taskId);utilityWindowCloseTimers.delete(id);},250);
    utilityWindowCloseTimers.set(id,timer);
  }
  function openGlobalSearch() {
    openUtilityWindow('global-search-window','global-search','⌕ WEBOS Global Search');
    $('global-search-query').focus();
    if($('global-search-query').value.trim())scheduleGlobalSearch();
  }
  function minimizeGlobalSearch(){minimizeUtilityWindow('global-search-window','global-search');}
  function closeGlobalSearch(){closeUtilityWindow('global-search-window','global-search');}
  async function openRecycleBin() {
    openUtilityWindow('recycle-bin-window','recycle-bin','♲ WEBOS Recycle Bin');
    await renderRecycleBin();
  }
  function minimizeRecycleBin(){minimizeUtilityWindow('recycle-bin-window','recycle-bin');}
  function closeRecycleBin(){closeUtilityWindow('recycle-bin-window','recycle-bin');}

  // ------------------------------- Recycle Bin -------------------------------
  function captureRecycleMetadata(path) {
    const base=pathKey(path),result={folderColors:{},vaults:{}};
    for(const group of ['folderColors','vaults'])for(const [key,value] of Object.entries(state.meta[group]||{})){
      if(key===base||key.startsWith(base+'/'))result[group][key===base?'':key.slice(base.length+1)]=value;
    }
    return result;
  }
  function applyRecycleMetadata(metadata,targetPath) {
    if(!metadata)return;
    const base=pathKey(targetPath);
    for(const group of ['folderColors','vaults'])for(const [relative,value] of Object.entries(metadata[group]||{})){
      state.meta[group][relative?(base?base+'/':'')+relative:base]=value;
    }
  }
  async function moveItemToRecycleBin(item) {
    if(!state.recycleBinDir)throw new Error('A Lomtár nem érhető el. Csatlakoztasd a Content mappát.');
    if(isProtectedSystemPath(item.path))throw new Error('A rendszerkönyvtár nem helyezhető a Lomtárba.');
    const id='item-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    const wrapper=await state.recycleBinDir.getDirectoryHandle(id,{create:true});
    let size=0,sourceRemoved=false;
    try{
      const payload=await wrapper.getDirectoryHandle('payload',{create:true});
      if(item.kind==='file'){
        const file=await item.handle.getFile();size=file.size;
        await copyFileHandle(item.handle,payload,item.name);
      }else{
        await payload.getDirectoryHandle('item',{create:true});
        await copyDirectoryHandle(item.handle,await payload.getDirectoryHandle('item'));
      }
      const metadata={id,name:item.name,kind:item.kind,originalPath:item.path.slice(0,-1),deletedAt:new Date().toISOString(),size,meta:captureRecycleMetadata(item.path)};
      const metaHandle=await wrapper.getFileHandle('metadata.json',{create:true});
      const writer=await metaHandle.createWritable();await writer.write(JSON.stringify(metadata,null,2));await writer.close();
      // A Lomtárban már biztonságosan megvan a teljes másolat; csak ezután töröljük az eredetit.
      await removeEntry(item.parentDir,item.name);sourceRemoved=true;
      if(item.kind==='directory'){
        removeMetadataTree(pathKey(item.path));
        try{await saveMeta();}catch(metaError){console.warn('A törölt mappa metaadatainak takarítása nem sikerült:',metaError);}
      }
      await recordActivity('item-recycled',{name:item.name,kind:item.kind,path:'Content\\'+item.path.join('\\')});
      notifyUser('Elem a Lomtárba helyezve',item.name,'success');
      return metadata;
    }catch(error){
      // Ha az eredetit már eltávolítottuk, a Lomtár-másolatot soha nem dobjuk el.
      if(!sourceRemoved){try{await removeEntry(state.recycleBinDir,id);}catch(_){}}
      throw error;
    }
  }
  async function listRecycleBinItems() {
    if(!state.recycleBinDir)return [];
    const items=[];
    for await(const [id,handle] of state.recycleBinDir.entries()){
      if(handle.kind!=='directory')continue;
      try{
        const metadataHandle=await handle.getFileHandle('metadata.json');
        const metadata=JSON.parse(await (await metadataHandle.getFile()).text());
        if(metadata&&metadata.id)items.push({id,handle,metadata});
      }catch(error){console.warn('Sérült Lomtár-bejegyzés:',id,error);}
    }
    items.sort((a,b)=>String(b.metadata.deletedAt).localeCompare(String(a.metadata.deletedAt)));
    return items;
  }
  async function renderRecycleBin() {
    const host=$('recycle-bin-list');host.replaceChildren();
    if(!state.recycleBinDir){$('recycle-bin-status').textContent='Nincs csatlakoztatva a Content mappa.';const empty=document.createElement('div');empty.className='aero-tool-empty';empty.textContent='Csatlakoztasd a Content mappát.';host.append(empty);return;}
    const items=await listRecycleBinItems();$('recycle-bin-status').textContent=`${items.length} törölt elem · Content\\Recycle Bin`;$('recycle-bin-empty').disabled=!items.length;
    if(!items.length){const empty=document.createElement('div');empty.className='aero-tool-empty';empty.textContent='A Lomtár üres.';host.append(empty);return;}
    for(const entry of items){
      const meta=entry.metadata,row=document.createElement('div');row.className='aero-recycle-entry';
      const icon=document.createElement('span');icon.className='aero-result-icon';icon.textContent=meta.kind==='directory'?'▰':fileIcon(meta.name);
      const copy=document.createElement('div');copy.className='aero-entry-copy';
      const name=document.createElement('span');name.className='aero-entry-name';name.textContent=meta.name||'(névtelen elem)';
      const detail=document.createElement('span');detail.className='aero-entry-detail';
      const deletedAt=meta.deletedAt?new Date(meta.deletedAt).toLocaleString('hu-HU'):'ismeretlen idő';
      const original='Content'+(Array.isArray(meta.originalPath)&&meta.originalPath.length?'\\'+meta.originalPath.join('\\'):'');
      detail.textContent=`Eredeti hely: ${original} · Törölve: ${deletedAt}${meta.kind==='file'?' · '+formatSize(meta.size||0):''}`;
      copy.append(name,detail);
      const badge=document.createElement('span');badge.className='aero-entry-badge';badge.textContent=meta.kind==='directory'?'MAPPA':'FÁJL';
      const actions=document.createElement('div');actions.className='aero-entry-actions';
      const restore=document.createElement('button');restore.type='button';restore.className='fm-btn primary';restore.textContent='Visszaállítás';restore.addEventListener('click',()=>restoreRecycleItem(entry).catch(error=>reportOperationFailure('Recycle Bin',error)));
      const remove=document.createElement('button');remove.type='button';remove.className='fm-btn danger';remove.textContent='Végleges törlés';remove.addEventListener('click',()=>permanentlyDeleteRecycleItem(entry).catch(error=>reportOperationFailure('Recycle Bin',error)));
      actions.append(restore,remove);row.append(icon,copy,badge,actions);host.append(row);
    }
  }
  async function resolveOrCreateDir(parts) {
    let dir=state.contentRoot;
    for(const part of parts)dir=await dir.getDirectoryHandle(part,{create:true});
    return dir;
  }
  async function restoreRecycleItem(entry) {
    if(!state.contentRoot||!state.recycleBinDir)throw new Error('A Content mappa nincs csatlakoztatva.');
    const metadata=entry.metadata;
    if(!(await ensureUnlocked(metadata.originalPath||[])))return;
    const parent=await resolveOrCreateDir(metadata.originalPath||[]);
    const ext=metadata.kind==='file'&&metadata.name.includes('.')?metadata.name.slice(metadata.name.lastIndexOf('.')):'';
    const base=ext?metadata.name.slice(0,-ext.length):metadata.name;
    const restoredName=await uniqueFsName(parent,base,ext);
    const payload=await entry.handle.getDirectoryHandle('payload');
    if(metadata.kind==='file')await copyFileHandle(await payload.getFileHandle(metadata.name),parent,restoredName);
    else await copyDirectoryHandle(await payload.getDirectoryHandle('item'),await parent.getDirectoryHandle(restoredName,{create:true}));
    const restoredPath=[...(metadata.originalPath||[]),restoredName];
    applyRecycleMetadata(metadata.meta,restoredPath);await saveMeta();
    await removeEntry(state.recycleBinDir,entry.id);
    await recordActivity('item-restored',{name:restoredName,originalName:metadata.name,path:'Content\\'+restoredPath.join('\\')});
    notifyUser('Elem visszaállítva',restoredName,'success');
    await renderRecycleBin();
    if($('fm-window').classList.contains('open'))await refreshAll();
  }
  async function permanentlyDeleteRecycleItem(entry) {
    if(!confirm('Véglegesen törlöd ezt az elemet? Ez a művelet nem vonható vissza.'))return;
    await removeEntry(state.recycleBinDir,entry.id);
    await recordActivity('item-permanently-deleted',{name:entry.metadata.name,kind:entry.metadata.kind});
    notifyUser('Elem véglegesen törölve',entry.metadata.name,'warning');
    await renderRecycleBin();
  }
  async function emptyRecycleBin() {
    const items=await listRecycleBinItems();if(!items.length)return;
    if(!confirm(`Véglegesen törlöd a Lomtár összes (${items.length}) elemét? Ez nem vonható vissza.`))return;
    for(const item of items)await removeEntry(state.recycleBinDir,item.id);
    await recordActivity('recycle-bin-emptied',{count:items.length});
    notifyUser('Lomtár ürítve',items.length+' elem véglegesen törölve.','success');
    await renderRecycleBin();
  }
