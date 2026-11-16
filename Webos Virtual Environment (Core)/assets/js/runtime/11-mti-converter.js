

  // MTI CONVERTER — adapts to top-level arrays, nested article arrays, and object-shaped JSON files.
  let mtiFiles=[];
  let currentMti=null;
  let mtiCloseTimer=0;
  function setMtiStatus(message) {$('mti-status-text').textContent=message;}
  async function runMtiSafe(fn) {
    try { await fn(); }
    catch(error) { console.error('MTI Converter hiba:',error);setMtiStatus(error&&error.message?error.message:'MTI Converter műveleti hiba');await reportOperationFailure('MTI Converter',error); }
  }
  function openMtiConverter() {
    const win=$('mti-converter-window');win.classList.remove('closing','app-minimized');
    registerTask('mti-converter','▧ MTI Converter',()=>{if(win.classList.contains('app-minimized'))restoreMtiConverter();else minimizeMtiConverter();});
    bringAppToFront(win);void win.offsetWidth;win.classList.add('open');setTaskActive('mti-converter',true);
    $('mti-disconnected').hidden=!!state.mtiCollectDir;
    if(state.mtiCollectDir)runMtiSafe(reloadMtiFiles);
  }
  function minimizeMtiConverter(){const win=$('mti-converter-window');if(!win.classList.contains('open'))return;win.classList.add('app-minimized');setTaskActive('mti-converter',false);}
  function restoreMtiConverter(){const win=$('mti-converter-window');win.classList.remove('app-minimized');bringAppToFront(win);setTaskActive('mti-converter',true);}
  function closeMtiConverter(){const win=$('mti-converter-window');if(!win.classList.contains('open')&&!win.classList.contains('closing'))return;win.classList.remove('open');win.classList.add('closing');setTaskActive('mti-converter',false);clearTimeout(mtiCloseTimer);mtiCloseTimer=setTimeout(()=>{win.classList.remove('closing','app-minimized');removeTask('mti-converter');},240);}
  function formatMtiFileDate(date){if(!date)return 'Dátum nem érhető el';try{return new Date(date).toLocaleString('hu-HU');}catch(_){return '';}}
  async function reloadMtiFiles(){
    const host=$('mti-file-list');host.replaceChildren();
    if(!state.mtiCollectDir||!state.mtiJsonImportDir){
      mtiFiles=[];currentMti=null;$('mti-disconnected').hidden=false;
      $('mti-file-count').textContent='0 fájl';$('mti-current-file').textContent='Nincs csatlakoztatott tárhely';
      $('mti-record-summary').textContent='Csatlakoztasd a Content mappát.';$('mti-record-count').textContent='—';
      $('mti-table-wrap').innerHTML='<div class="mti-empty large">A JSON-fájlok megjelenítéséhez csatlakoztatás szükséges.</div>';
      $('mti-export-pdf').disabled=true;$('mti-export-docx').disabled=true;$('mti-select-mode').disabled=true;$('mti-delete-selected').disabled=true;
      setMtiStatus('Content\\MTI Collect\\JSON IMPORT · Nincs csatlakoztatva');return;
    }
    $('mti-disconnected').hidden=true;mtiFiles=[];
    for await(const [name,handle] of state.mtiJsonImportDir.entries()){
      if(handle.kind!=='file'||!name.toLowerCase().endsWith('.json'))continue;
      try{const file=await handle.getFile();mtiFiles.push({name,handle,size:file.size,lastModified:file.lastModified});}
      catch(error){console.warn('MTI fájl metaadat nem olvasható:',name,error);}
    }
    mtiFiles.sort((a,b)=>b.lastModified-a.lastModified||a.name.localeCompare(b.name,'hu',{numeric:true,sensitivity:'base'}));
    $('mti-file-count').textContent=mtiFiles.length+' fájl';
    if(!mtiFiles.length){
      const empty=document.createElement('div');empty.className='mti-empty';empty.textContent='A JSON IMPORT mappa még nem tartalmaz JSON-fájlokat.';host.append(empty);
      currentMti=null;resetMtiSelection();renderMtiEmpty();setMtiStatus('0 JSON-fájl · Content\\MTI Collect\\JSON IMPORT');return;
    }
    for(const item of mtiFiles){
      const button=document.createElement('button');button.type='button';button.className='mti-file-item'+(currentMti&&currentMti.name===item.name?' active':'');
      const icon=document.createElement('span');icon.className='mti-file-icon';icon.textContent='▧';
      const copy=document.createElement('span');copy.className='mti-file-copy';
      const name=document.createElement('span');name.className='mti-file-name';name.textContent=item.name;
      const meta=document.createElement('span');meta.className='mti-file-meta';meta.textContent=(item.size<1024?item.size+' B':(item.size/1024).toFixed(1)+' KB')+' · '+formatMtiFileDate(item.lastModified);
      copy.append(name,meta);button.append(icon,copy);button.addEventListener('click',()=>runMtiSafe(()=>openMtiJson(item.name)));host.append(button);
    }
    if(currentMti&&!mtiFiles.some(item=>item.name===currentMti.name))currentMti=null;
    if(currentMti){const keep=currentMti.name;await openMtiJson(keep,false);}else{resetMtiSelection();renderMtiEmpty();}
    setMtiStatus(mtiFiles.length+' JSON-fájl · Content\\MTI Collect\\JSON IMPORT');
  }
  let mtiSelectionMode=false;
  let mtiSelectedRows=new Set();
  function resetMtiSelection(){
    mtiSelectionMode=false;mtiSelectedRows.clear();
    const select=$('mti-select-mode'),del=$('mti-delete-selected'),hint=$('mti-selection-hint');
    if(select){select.textContent='Szelektálás';select.classList.remove('selection-active');select.setAttribute('aria-pressed','false');select.disabled=!currentMti;}
    if(del)del.disabled=true;
    if(hint)hint.hidden=true;
    const host=$('mti-table-wrap');if(host)host.classList.remove('mti-select-mode');
  }
  function updateMtiSelectionControls(){
    const select=$('mti-select-mode'),del=$('mti-delete-selected'),hint=$('mti-selection-hint');
    if(select){select.disabled=!currentMti;select.textContent=mtiSelectionMode?'Szelektálás befejezése':'Szelektálás';select.classList.toggle('selection-active',mtiSelectionMode);select.setAttribute('aria-pressed',mtiSelectionMode?'true':'false');}
    if(del)del.disabled=!currentMti||mtiSelectedRows.size===0;
    if(hint){hint.hidden=!mtiSelectionMode;hint.textContent=mtiSelectionMode?(mtiSelectedRows.size?mtiSelectedRows.size+' sor kijelölve · kattints a sorokra a módosításhoz':'Kattints a törlendő sorokra.'):' ';}
    const host=$('mti-table-wrap');if(host)host.classList.toggle('mti-select-mode',mtiSelectionMode);
  }
  function toggleMtiSelectionMode(){
    if(!currentMti)return;
    mtiSelectionMode=!mtiSelectionMode;
    if(!mtiSelectionMode)mtiSelectedRows.clear();
    renderMtiRows();updateMtiSelectionControls();
  }
  function toggleMtiRowSelection(index,row){
    if(!mtiSelectionMode)return;
    if(mtiSelectedRows.has(index))mtiSelectedRows.delete(index);else mtiSelectedRows.add(index);
    row.classList.toggle('mti-row-selected',mtiSelectedRows.has(index));
    updateMtiSelectionControls();
  }
  function renderMtiEmpty(){
    $('mti-current-file').textContent='Nincs kiválasztott fájl';$('mti-record-summary').textContent='Válassz egy JSON-fájlt a bal oldali listából.';$('mti-record-count').textContent='—';
    $('mti-table-wrap').replaceChildren();const empty=document.createElement('div');empty.className='mti-empty large';empty.textContent='A kiválasztott JSON adatai itt jelennek meg az export PDF oszlopaival megegyező elrendezésben.';$('mti-table-wrap').append(empty);
    $('mti-export-pdf').disabled=true;$('mti-export-docx').disabled=true;resetMtiSelection();
  }
  function mtiGetPath(root,path){let node=root;for(const key of path)node=node==null?undefined:node[key];return node;}
  function mtiFindRecordArray(root){
    if(Array.isArray(root))return {path:[],array:root};
    const preferred=['events','articles','article','items','records','results','news','entries','posts','collected','stories','data','messages'];
    const candidates=[];
    function walk(node,path,depth){
      if(depth>5||node==null||typeof node!=='object')return;
      if(Array.isArray(node)){
        const objects=node.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)).length;
        const ratio=node.length?objects/node.length:0;
        const key=String(path[path.length-1]||'').toLowerCase(),p=preferred.indexOf(key);
        let score=(objects?100:0)+(ratio*40)+Math.min(node.length,60)+(p>=0?(preferred.length-p)*5:0)-path.length*8;
        if(node.length===0&&path.length===0)score=1000;
        candidates.push({path:[...path],array:node,score});return;
      }
      for(const [key,value] of Object.entries(node))walk(value,[...path,key],depth+1);
    }
    walk(root,[],0);candidates.sort((a,b)=>b.score-a.score||a.path.length-b.path.length);
    return candidates.length?candidates[0]:null;
  }
  function mtiPrepareView(root){
    if(Array.isArray(root))return {mode:'array',path:[],rows:root};
    const descriptor=mtiFindRecordArray(root);
    if(descriptor)return {mode:'array',path:descriptor.path,rows:descriptor.array};
    if(root&&typeof root==='object')return {mode:'object',path:[],rows:Object.entries(root).map(([key,value])=>({__mtiKey:key,__mtiValue:value}))};
    return {mode:'primitive',path:[],rows:[{value:root}]};
  }
  function mtiCellValue(value){
    if(value===null||value===undefined)return '';
    if(typeof value==='string')return value;
    if(typeof value==='number'||typeof value==='boolean')return String(value);
    if(Array.isArray(value))return value.map(item=>typeof item==='object'&&item!==null?JSON.stringify(item):String(item??'')).join(' | ');
    try{return JSON.stringify(value,null,2);}catch(_){return String(value);}
  }
  function mtiFlattenRecord(record,prefix='',out={}){
    if(record&&typeof record==='object'&&!Array.isArray(record)){
      for(const [key,value] of Object.entries(record)){
        const label=prefix?prefix+'.'+key:key;
        if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=18)mtiFlattenRecord(value,label,out);
        else out[label]=mtiCellValue(value);
      }
    }else out[prefix||'Érték']=mtiCellValue(record);
    return out;
  }
  async function openMtiJson(fileName,updateList=true){
    if(!state.mtiJsonImportDir)throw new Error('Nincs csatlakoztatva a Content\\MTI Collect\\JSON IMPORT mappa.');
    const item=mtiFiles.find(entry=>entry.name===fileName);if(!item)throw new Error('A kiválasztott JSON-fájl már nem található.');
    const file=await item.handle.getFile();if(file.size>50*1024*1024)throw new Error('A JSON-fájl nagyobb 50 MB-nál, ezért nem nyitható meg.');
    let parsed;try{parsed=JSON.parse(await file.text());}catch(error){throw new Error('Hibás JSON-formátum: '+error.message);}
    currentMti={name:fileName,handle:item.handle,root:parsed,view:mtiPrepareView(parsed),lastModified:file.lastModified};
    resetMtiSelection();renderMtiRows();$('mti-current-file').textContent=fileName;$('mti-record-summary').textContent='JSON megnyitva · '+(file.size/1024).toFixed(1)+' KB';
    if(updateList){for(const button of $('mti-file-list').querySelectorAll('.mti-file-item'))button.classList.toggle('active',button.querySelector('.mti-file-name')?.textContent===fileName);}
    setMtiStatus('Megnyitva: Content\\MTI Collect\\JSON IMPORT\\'+fileName);
    await recordActivity('mti-json-opened',{fileName,records:currentMti.view.rows.length});
  }
  function mtiEditorTime(record){
    if(!record)return '';
    const date=String(record.date||'').trim(),time=String(record.time||'').trim();
    let shown='';
    if(date){const m=/^(\d{4})\.(\d{2})\.(\d{2})$/.exec(date);shown=m?`${m[1]}. ${m[2]}. ${m[3]}.`:date;}
    return [shown,time].filter(Boolean).join(' ');
  }
  function renderMtiRows(){
    const host=$('mti-table-wrap');host.replaceChildren();$('mti-export-pdf').disabled=!currentMti||!state.mtiJsonImportDir;$('mti-export-docx').disabled=!currentMti||!state.mtiJsonImportDir;
    if(!currentMti){renderMtiEmpty();return;}
    const rows=currentMti.view.rows||[];$('mti-record-count').textContent=rows.length+' sor';
    if(!rows.length){const empty=document.createElement('div');empty.className='mti-empty large';empty.textContent='A JSON-fájl nem tartalmaz megjeleníthető rekordot. Üres lista.';host.append(empty);updateMtiSelectionControls();return;}
    const records=mtiPdfRecords();
    const columns=[['IDŐ',record=>mtiEditorTime(record)],['HELY',record=>record.place],['RENDEZVÉNY',record=>record.nature],['RENDEZVÉNY LEÍRÁSA',record=>record.description],['KAPCSOLAT',record=>record.contact]];
    const table=document.createElement('table');table.className='mti-data-table';
    const thead=document.createElement('thead'),headRow=document.createElement('tr');
    for(const [label] of columns){const th=document.createElement('th');th.textContent=label;headRow.append(th);}
    thead.append(headRow);table.append(thead);
    const tbody=document.createElement('tbody');
    rows.forEach((rawRow,index)=>{
      const record=records[index]||{date:'',time:'',place:'',nature:'',description:mtiCellValue(rawRow),contact:''};
      const tr=document.createElement('tr');if(mtiSelectedRows.has(index))tr.classList.add('mti-row-selected');
      for(const [,getValue] of columns){const td=document.createElement('td');td.textContent=getValue(record)||'';tr.append(td);}
      tr.addEventListener('click',()=>toggleMtiRowSelection(index,tr));tbody.append(tr);
    });
    table.append(tbody);host.append(table);updateMtiSelectionControls();
  }
  async function writeMtiJson(){
    const writable=await currentMti.handle.createWritable();
    try{await writable.write(JSON.stringify(currentMti.root,null,2)+'\n');await writable.close();}
    catch(error){try{await writable.abort();}catch(_){}throw error;}
  }
  async function deleteSelectedMtiRows(){
    if(!currentMti||!mtiSelectedRows.size)return;
    const indexes=[...mtiSelectedRows].sort((a,b)=>b-a),count=indexes.length,view=currentMti.view;
    if(!confirm(`Biztosan törlöd a kijelölt ${count} sort? A módosítás közvetlenül az eredeti JSON-fájlba mentődik.`))return;
    if(view.mode==='array'){
      const array=mtiGetPath(currentMti.root,view.path);
      if(!Array.isArray(array))throw new Error('A JSON rekordlistája időközben megváltozott.');
      for(const index of indexes){if(index<0||index>=array.length)throw new Error('Egy kijelölt sor már nem létezik.');array.splice(index,1);}
    }else if(view.mode==='object'){
      for(const index of indexes){const row=view.rows[index];if(!row)continue;delete currentMti.root[row.__mtiKey];}
    }else if(indexes.includes(0))currentMti.root=null;
    currentMti.view=mtiPrepareView(currentMti.root);mtiSelectedRows.clear();mtiSelectionMode=false;
    await writeMtiJson();
    const item=mtiFiles.find(entry=>entry.name===currentMti.name);if(item){const file=await item.handle.getFile();item.size=file.size;item.lastModified=file.lastModified;}
    renderMtiRows();setMtiStatus(`${count} kijelölt sor törölve és elmentve: Content\MTI Collect\JSON IMPORT\${currentMti.name}`);
    await recordActivity('mti-records-deleted',{fileName:currentMti.name,count});notifyUser('MTI-adatok módosítva',count+' rekord törölve és elmentve.','success');
    if(state.contentRoot&&$('fm-window').classList.contains('open'))await refreshAll();
  }
  function mtiNormalizeKey(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hu-HU').replace(/[^a-z0-9]/g,'');}
  function mtiWalkEntries(value,out=[],depth=0,path=[]){
    if(depth>5||!value||typeof value!=='object')return out;
    if(Array.isArray(value)){
      value.forEach((item,index)=>{if(item&&typeof item==='object')mtiWalkEntries(item,out,depth+1,[...path,String(index)]);});
      return out;
    }
    for(const [key,val] of Object.entries(value)){
      const nextPath=[...path,key];
      out.push({key,normalized:mtiNormalizeKey(key),value:val,path:nextPath});
      if(val&&typeof val==='object')mtiWalkEntries(val,out,depth+1,nextPath);
    }
    return out;
  }
  function mtiPickEntry(record,aliases){
    const entries=mtiWalkEntries(record,[]);const wanted=aliases.map(mtiNormalizeKey);
    for(const alias of wanted){
      const match=entries.find(entry=>entry.normalized===alias&&entry.value!==null&&entry.value!==undefined&&mtiCellValue(entry.value).trim()!=='');
      if(match)return match;
    }
    return null;
  }
  function mtiEntryText(entry){return entry?mtiCellValue(entry.value):'';}
  function mtiParseDate(value){
    const raw=String(value||'').trim();if(!raw)return '';
    // MTI formátum: például „2026. 11. 13” (a pontok után szóköz is lehet).
    let m=/^(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})(?:\.|\b)/.exec(raw);
    if(m){const y=+m[1],mo=+m[2],d=+m[3],date=new Date(y,mo-1,d);if(date.getFullYear()===y&&date.getMonth()===mo-1&&date.getDate()===d)return `${y}.${String(mo).padStart(2,'0')}.${String(d).padStart(2,'0')}`;}
    m=/^(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})(?:\.|\b)/.exec(raw);
    if(m){const d=+m[1],mo=+m[2],y=+m[3],date=new Date(y,mo-1,d);if(date.getFullYear()===y&&date.getMonth()===mo-1&&date.getDate()===d)return `${y}.${String(mo).padStart(2,'0')}.${String(d).padStart(2,'0')}`;}
    const parsed=new Date(raw);if(!Number.isNaN(parsed.getTime()))return eventDateKey(parsed);
    return '';
  }
  function mtiPdfRecords(){
    if(!currentMti)return [];
    const view=currentMti.view;
    let sourceRows=view.mode==='array'?view.rows:view.mode==='object'?[currentMti.root]:view.rows;
    return sourceRows.map((row,index)=>{
      const objectRow=row&&typeof row==='object'&&!Array.isArray(row)?row:{value:row};
      // A tényleges MTI Agenda Collector JSON-mezői elsőbbséget élveznek.
      const dateEntry=mtiPickEntry(objectRow,['idopont','date','datum','publicationDate','publishedAt','published','createdAt','timestamp','datetime','dateTime','pubDate','timeStamp']);
      const timeEntry=mtiPickEntry(objectRow,['ido','time','eventTime','startTime','hour']);
      const placeEntry=mtiPickEntry(objectRow,['helyszin','place','location','hely','venue','city','town','address','telepules','orszag']);
      const natureEntry=mtiPickEntry(objectRow,['esemenyjellege','rendezvenyjellege','eventNature','title','headline','cim','subject','event','eventTitle','name','type','topic','rendezveny']);
      const descriptionEntry=mtiPickEntry(objectRow,['esemenyleirasa','rendezvenyleirasa','description','content','body','text','summary','lead','excerpt','leiras','abstract','articleText','details']);
      const contactEntry=mtiPickEntry(objectRow,['kapcsolattarto','contact','kapcsolat','author','authorName','email','phone','reporter','byline']);
      const categoryEntry=mtiPickEntry(objectRow,['kategoria','category','group']);
      const dateRaw=mtiEntryText(dateEntry),timeRaw=mtiEntryText(timeEntry);
      const combinedDate=mtiParseDate(dateRaw)||mtiParseDate(timeRaw);
      let time='';
      // Az „2026. 11. 13” dátumot nem szabad 11.13 időpontnak értelmezni.
      // Először a külön Idő mezőt nézzük; ha az üres, csak a dátum UTÁNI részből olvasunk időt.
      let timeCandidate=String(timeRaw||'').trim();
      if(!timeCandidate){
        const dateText=String(dateRaw||'').trim();
        const datePrefixes=[
          /^\d{4}\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{1,2}\.?\s*(.*)$/,
          /^\d{1,2}\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{4}\.?\s*(.*)$/
        ];
        for(const pattern of datePrefixes){const match=pattern.exec(dateText);if(match){timeCandidate=match[1].trim();break;}}
      }
      const timeMatch=timeCandidate.match(/(?:^|[T\s])(\d{1,2})\s*[:.]\s*(\d{2})(?::\d{2})?(?:Z|[+\-]\d{2}:?\d{2})?(?:\s|$)/i);
      if(timeMatch){try{time=parseEventTime(timeMatch[1]+':'+timeMatch[2]).normalized;}catch(_){}}
      const place=mtiEntryText(placeEntry),nature=mtiEntryText(natureEntry),description=mtiEntryText(descriptionEntry),contact=mtiEntryText(contactEntry),category=mtiEntryText(categoryEntry);
      // A mintában lévő Kategória mezőnek nincs külön oszlopa az Event Studio PDF-ben,
      // ezért az eseményleírás elején megőrizzük; a gyűjtési metaadatokat nem tesszük a PDF-be.
      const usedPaths=new Set([dateEntry,timeEntry,placeEntry,natureEntry,descriptionEntry,contactEntry,categoryEntry].filter(Boolean).map(entry=>entry.path.join('.')));
      const internalKeys=new Set(['begyujtve','ellenorzesszukseges','forrasoldal','version','format','exportedat']);
      const extras=Object.entries(mtiFlattenRecord(objectRow)).filter(([key,value])=>{
        const leaf=key.split('.').pop(),normal=mtiNormalizeKey(leaf);
        return value&&!usedPaths.has(key)&&!leaf.startsWith('_')&&!internalKeys.has(normal);
      }).map(([key,value])=>key+': '+value);
      const fullDescription=[category?'Kategória: '+category:'',description,...extras].filter(Boolean).join('\n');
      return {date:combinedDate,time,place,nature:nature||('MTI rekord '+(index+1)),description:fullDescription,contact};
    });
  }
  function mtiPdfDate(records){
    const dates=records.map(row=>row.date).filter(Boolean).sort((a,b)=>a.localeCompare(b));
    return dates[0]||eventDateKey(new Date());
  }
  async function exportCurrentMtiDocument(format='pdf'){
    if(!state.mtiPdfExportDir||!state.mtiWordExportDir)throw new Error('Előbb csatlakoztasd a Content\\MTI Collect tárhelyet.');
    if(!currentMti)throw new Error('Válassz ki egy JSON-fájlt.');
    const isWord=format==='docx',extension=isWord?'docx':'pdf',label=isWord?'WORD':'PDF',folderLabel=isWord?'Word':'PDF';
    const pdfButton=$('mti-export-pdf'),wordButton=$('mti-export-docx');pdfButton.disabled=true;wordButton.disabled=true;
    try {
      const records=mtiPdfRecords(),date=mtiPdfDate(records);setMtiStatus(label+' exportálás…');
      const bytes=isWord?await makeAeroEventDocx(records,date+'.'):await makeAeroEventPdf(records,date+'.');
      const formatDir=isWord?state.mtiWordExportDir:state.mtiPdfExportDir;
      const datedDir=await formatDir.getDirectoryHandle(date,{create:true});
      let name=date+'.'+extension,suffix=2;while(await entryExists(datedDir,name)){name=date+' ('+(suffix++)+').'+extension;}
      const handle=await datedDir.getFileHandle(name,{create:true}),writer=await handle.createWritable();
      try{await writer.write(bytes);await writer.close();}catch(error){try{await writer.abort();}catch(_){}throw error;}
      if(state.contentRoot&&$('fm-window').classList.contains('open'))await refreshAll();
      setMtiStatus(label+' export kész: '+name+' · '+records.length+' rekord');
      await recordActivity(isWord?'docx-exported':'pdf-exported',{source:'MTI Converter',fileName:name,records:records.length,path:'Content\\MTI Collect\\EXPORT\\'+folderLabel+'\\'+date+'\\'+name});
      notifyUser(label+' export sikeres',name+' · '+records.length+' rekord','success');
    } finally {pdfButton.disabled=!currentMti||!state.mtiJsonImportDir;wordButton.disabled=!currentMti||!state.mtiJsonImportDir;}
  }


  // Activity logging and Notification Center were intentionally removed.
  function recordActivity(){return Promise.resolve(null);}
  function notifyUser(){return null;}
  async function reportOperationFailure(app,error) {
    const message=String(error&&error.message?error.message:error||'Ismeretlen hiba').slice(0,500);
    console.error('WEBOS műveleti hiba ['+app+']:',message);
    await recordActivity('operation-failed',{app,message});
  }
