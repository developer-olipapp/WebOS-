

  // ----------------------------- Global Search -----------------------------
  function scheduleGlobalSearch() {
    clearTimeout(globalSearchDebounce);
    globalSearchDebounce=setTimeout(()=>runGlobalSearch().catch(error=>reportOperationFailure('Global Search',error)),260);
  }
  function addGlobalSearchResult(results,result) {
    if(results.length>=120)return;
    const signature=[result.kind,result.path||'',result.fileName||'',result.name||'',result.recordIndex||''].join('|');
    if(results.some(item=>item.signature===signature))return;
    result.signature=signature;results.push(result);
  }
  async function scanGenericFiles(dir,parts,query,results,depth=0) {
    if(depth>18||results.length>=120)return;
    const entries=await getEntries(dir);
    for(const item of entries){
      if(results.length>=120)return;
      const path=[...parts,item.name],fullPath='Content\\'+path.join('\\');
      if(parts.length===0&&['Contact','MTI Collect','Recycle Bin'].includes(item.name))continue;
      if(item.kind==='directory'){
        if(normalizeGlobalSearchText(item.name+' '+fullPath).includes(query))addGlobalSearchResult(results,{kind:'folder',name:item.name,path,detail:fullPath,handle:item.handle});
        const key=pathKey(path);if(isLocked(key))continue;
        await scanGenericFiles(item.handle,path,query,results,depth+1);
      }else{
        let matched=normalizeGlobalSearchText(item.name+' '+fullPath).includes(query),matchType='fájlnév';
        if(!matched&&/\.(txt|md|log|json|xml|html?|css|js|csv|ini|cfg|yaml|yml|rtf)$/i.test(item.name)){
          try{const file=await item.handle.getFile();if(file.size<=350000){const contents=await file.text();matched=normalizeGlobalSearchText(contents).includes(query);if(matched)matchType='fájltartalom';}}catch(_){}
        }
        if(matched)addGlobalSearchResult(results,{kind:'file',name:item.name,path,detail:fullPath+' · '+matchType,handle:item.handle});
      }
    }
  }
  async function searchContacts(query,results) {
    if(!state.contactDir)return;
    for await(const [fileName,handle] of state.contactDir.entries()){
      if(handle.kind!=='file'||!fileName.toLowerCase().endsWith('.json'))continue;
      try{
        const file=await handle.getFile();if(file.size>1024*1024)continue;
        const data=JSON.parse(await file.text());if(!data||typeof data.name!=='string')continue;
        const record={id:data.id||fileName,name:data.name,title:data.title||'',phone:data.phone||'',email:data.email||'',createdAt:data.createdAt||'',updatedAt:data.updatedAt||'',fileName,handle};
        if(normalizeGlobalSearchText([record.name,record.title,record.phone,record.email].join(' ')).includes(query))addGlobalSearchResult(results,{kind:'contact',name:record.name,detail:[record.title,record.phone,record.email].filter(Boolean).join(' · ')||'Kontakt',record,fileName});
      }catch(_){}
    }
  }
  async function searchEvents(query,results) {
    if(!state.eventStudioDir)return;
    for await(const [folderName,folderHandle] of state.eventStudioDir.entries()){
      if(folderHandle.kind!=='directory')continue;
      const records=await readEventRecords(folderName);
      for(const record of records){
        const searchable=[record.date,record.time,record.group,record.place,record.nature,record.description,record.contact,folderName].join(' ');
        if(normalizeGlobalSearchText(searchable).includes(query))addGlobalSearchResult(results,{kind:'event',name:record.nature||record.fileName,detail:[record.date,record.time,record.place,folderName].filter(Boolean).join(' · '),record});
        if(results.length>=120)return;
      }
    }
  }
  async function searchMtiData(query,results) {
    if(!state.mtiJsonImportDir)return;
    for await(const [fileName,handle] of state.mtiJsonImportDir.entries()){
      if(handle.kind!=='file'||!fileName.toLowerCase().endsWith('.json'))continue;
      try{
        const file=await handle.getFile();if(file.size>20*1024*1024)continue;
        const root=JSON.parse(await file.text());
        if(normalizeGlobalSearchText(fileName).includes(query))addGlobalSearchResult(results,{kind:'mti',name:fileName,detail:'MTI JSON-fájl · fájlnév találat',fileName,recordIndex:-1});
        const view=mtiPrepareView(root);const rows=(view.rows||[]).slice(0,5000);
        for(let index=0;index<rows.length;index++){
          const flattened=mtiFlattenRecord(rows[index]);const searchable=Object.entries(flattened).map(([key,value])=>key+' '+value).join(' ');
          if(normalizeGlobalSearchText(searchable).includes(query)){
            addGlobalSearchResult(results,{kind:'mti',name:fileName+' · '+(index+1)+'. rekord',detail:Object.values(flattened).filter(Boolean).slice(0,3).join(' · ').slice(0,250),fileName,recordIndex:index});
            if(results.length>=120)return;
          }
        }
      }catch(_){}
    }
  }
  async function runGlobalSearch() {
    const query=normalizeGlobalSearchText($('global-search-query').value.trim());
    const scope=$('global-search-scope').value||'all';
    const sequence=++globalSearchSequence;
    const host=$('global-search-results');host.replaceChildren();
    if(query.length<2){$('global-search-status').textContent='Írj be legalább két karaktert a kereséshez.';const empty=document.createElement('div');empty.className='aero-tool-empty';empty.textContent='A keresési kifejezés legalább két karakter legyen.';host.append(empty);return;}
    if(!state.contentRoot){$('global-search-status').textContent='Nincs csatlakoztatva a Content mappa.';const empty=document.createElement('div');empty.className='aero-tool-empty';empty.textContent='Csatlakoztasd a Content mappát a kereséshez.';host.append(empty);return;}
    $('global-search-status').textContent='Keresés folyamatban…';
    const results=[];
    if(scope==='all'||scope==='files')await scanGenericFiles(state.contentRoot,[],query,results);
    if(sequence!==globalSearchSequence)return;
    if(scope==='all'||scope==='contacts')await searchContacts(query,results);
    if(sequence!==globalSearchSequence)return;
    if(scope==='all'||scope==='events')await searchEvents(query,results);
    if(sequence!==globalSearchSequence)return;
    if(scope==='all'||scope==='mti')await searchMtiData(query,results);
    if(sequence!==globalSearchSequence)return;
    currentGlobalSearchResults=results;
    const typeOrder={contact:0,event:1,mti:2,folder:3,file:4};
    results.sort((a,b)=>(typeOrder[a.kind]??9)-(typeOrder[b.kind]??9));
    $('global-search-status').textContent=`${results.length} találat · keresés: „${$('global-search-query').value.trim()}”`;
    if(!results.length){const empty=document.createElement('div');empty.className='aero-tool-empty';empty.textContent='Nincs találat a csatlakoztatott Content mappában.';host.append(empty);return;}
    const icons={contact:'▤',event:'◷',mti:'▧',folder:'▰',file:'▤'};
    const labels={contact:'KONTAKT',event:'ESEMÉNY',mti:'MTI ADAT',folder:'MAPPA',file:'FÁJL'};
    results.forEach((result,index)=>{
      const button=document.createElement('button');button.type='button';button.className='aero-search-result';
      const icon=document.createElement('span');icon.className='aero-result-icon';icon.textContent=icons[result.kind]||'⌕';
      const copy=document.createElement('span');copy.className='aero-result-copy';
      const name=document.createElement('span');name.className='aero-result-name';name.textContent=result.name||'(névtelen találat)';
      const detail=document.createElement('span');detail.className='aero-result-detail';detail.textContent=result.detail||'';
      copy.append(name,detail);
      const kind=document.createElement('span');kind.className='aero-result-kind';kind.textContent=labels[result.kind]||result.kind;
      button.append(icon,copy,kind);button.addEventListener('click',()=>handleGlobalSearchResult(result).catch(error=>reportOperationFailure('Global Search',error)));host.append(button);
    });
  }
  async function handleGlobalSearchResult(result) {
    if(result.kind==='contact'){
      openContact();await reloadContacts();const record=contactRecords.find(item=>item.fileName===result.fileName)||result.record;if(record)openContactProfile(record);return;
    }
    if(result.kind==='event'){
      openEventStudio();openEventDetail(result.record);return;
    }
    if(result.kind==='mti'){
      openMtiConverter();await reloadMtiFiles();await openMtiJson(result.fileName);
      if(Number.isInteger(result.recordIndex)&&result.recordIndex>=0&&result.recordIndex<(currentMti?.view.rows||[]).length){
        mtiSelectedRows.clear();mtiSelectedRows.add(result.recordIndex);mtiSelectionMode=true;renderMtiRows();
      }
      return;
    }
    openManager();
    if(result.kind==='folder'){
      const folderPath=result.path||[];if(!(await ensureUnlocked(folderPath)))return;
      state.currentPath=folderPath.slice();state.selected=null;await refreshAll();status('Keresési találat megnyitva: Content\\'+folderPath.join('\\'));return;
    }
    if(result.kind==='file'){
      const path=result.path||[],parentPath=path.slice(0,-1),name=path[path.length-1];
      if(!(await ensureUnlocked(parentPath)))return;
      state.currentPath=parentPath;await refreshAll();
      const handle=await state.currentDir.getFileHandle(name);
      state.selected={name,handle,kind:'file',parentKey:pathKey(parentPath),parentDir:state.currentDir,path};
      await renderList();refreshSelectionButtons();
      if(/\.pdf$/i.test(name))await openPdfPreview(handle,name);
      else if(isTextFile(name))await editSelected();
      else status('Találat kijelölve: '+name);
    }
  }

  // ----------------------------- PDF Preview -----------------------------
  async function openPdfPreview(handle,name) {
    if(!handle||handle.kind!=='file'||!/\.pdf$/i.test(name||''))throw new Error('Csak PDF-fájl nyitható meg az előnézetben.');
    const file=await handle.getFile();
    if(file.size===0)throw new Error('A PDF-fájl üres.');
    if(pdfPreviewUrl)URL.revokeObjectURL(pdfPreviewUrl);
    pdfPreviewUrl=URL.createObjectURL(file);pdfPreviewName=String(name||'Dokumentum.pdf');pdfPreviewPage=1;pdfPreviewZoom=100;
    $('pdf-preview-name').textContent=pdfPreviewName;$('pdf-page-input').value='1';$('pdf-zoom-label').textContent='100%';
    $('pdf-preview-frame').src=pdfPreviewUrl+'#toolbar=1&navpanes=0&page=1&zoom=100';
    const overlay=$('pdf-preview-overlay');overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');
    await recordActivity('pdf-preview-opened',{fileName:pdfPreviewName,size:file.size});
  }
  function updatePdfPreviewFrame() {
    if(!pdfPreviewUrl)return;
    $('pdf-page-input').value=String(pdfPreviewPage);$('pdf-zoom-label').textContent=pdfPreviewZoom+'%';
    $('pdf-preview-frame').src=pdfPreviewUrl+'#toolbar=1&navpanes=0&page='+pdfPreviewPage+'&zoom='+pdfPreviewZoom;
  }
  function setPdfPreviewPage(value) {pdfPreviewPage=Math.max(1,Math.min(99999,Math.floor(Number(value)||1)));updatePdfPreviewFrame();}
  function setPdfPreviewZoom(value) {pdfPreviewZoom=Math.max(50,Math.min(200,Math.round((Number(value)||100)/10)*10));updatePdfPreviewFrame();}
  function closePdfPreview() {
    const overlay=$('pdf-preview-overlay');overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');
    $('pdf-preview-frame').src='about:blank';
    if(pdfPreviewUrl){URL.revokeObjectURL(pdfPreviewUrl);pdfPreviewUrl='';}
    pdfPreviewName='';
  }
