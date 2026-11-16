
  async function resolveDir(parts) {
    let dir = state.contentRoot;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    return dir;
  }
  async function getEntries(dir) {
    const entries = [];
    for await (const [name, handle] of dir.entries()) {
      if ((name === META_FILE && dir === state.contentRoot) || name === '.webos-folder') continue;
      entries.push({name,handle,kind:handle.kind});
    }
    entries.sort((a,b) => a.kind === b.kind ? a.name.localeCompare(b.name,'hu',{numeric:true,sensitivity:'base'}) : a.kind === 'directory' ? -1 : 1);
    if (state.eventStudioDir && dir === state.eventStudioDir) {
      entries.sort((a,b) => a.kind === b.kind ? (a.kind === 'directory' ? compareEventFolderNames(a.name,b.name) : a.name.localeCompare(b.name,'hu',{numeric:true,sensitivity:'base'})) : a.kind === 'directory' ? -1 : 1);
    }
    return entries;
  }
  async function refreshAll() {
    if (!state.contentRoot) return;
    state.currentDir = await resolveDir(state.currentPath);
    $('fm-path').textContent = 'Content' + (state.currentPath.length ? '\\' + state.currentPath.join('\\') : '');
    await renderTree();
    await renderList();
    
    refreshSelectionButtons();
  }
  async function expandAllTreeDirectories(dir,parts,depth=0) {
    if(depth>60)return;
    for(const [name,handle] of (await getEntries(dir)).filter(entry=>entry.kind==='directory').map(entry=>[entry.name,entry.handle])){
      const next=[...parts,name],key=pathKey(next);
      if(isLocked(key))continue;
      state.expanded.add(key);
      await expandAllTreeDirectories(handle,next,depth+1);
    }
  }
  async function renderTree() {
    const host = $('fm-tree'); host.replaceChildren();
    const rootRow = makeTreeRow('Content', [], true, false);
    host.append(rootRow);
    if (state.expanded.has('')) await appendTreeChildren(host, state.contentRoot, [], 1);
  }
  function makeTreeRow(name, parts, root=false, locked=false) {
    const row = document.createElement('div'); row.className = 'fm-tree-row';
    row.style.paddingLeft = (root ? 3 : Math.min(180, parts.length*14+3)) + 'px';
    if (pathKey(parts) === pathKey(state.currentPath)) row.classList.add('active');
    const toggle = document.createElement('button'); toggle.type='button'; toggle.className='fm-tree-toggle';
    toggle.textContent = state.expanded.has(pathKey(parts)) ? '▾' : '▸';
    if (locked) { toggle.classList.add('empty'); }
    if (root) toggle.classList.add('empty');
    toggle.addEventListener('click', e => { e.stopPropagation(); const key=pathKey(parts); if(state.expanded.has(key)) state.expanded.delete(key); else state.expanded.add(key); renderTree().catch(showError); });
    row.append(toggle, folderGlyph(root ? '#c69a42' : colorFor(parts),name,root?0:parts.length));
    const label=document.createElement('span');label.className='fm-tree-label';label.textContent=name;
    if (locked) { const lock=document.createElement('span');lock.className='fm-vault-tag';lock.textContent='🔒';row.append(label,lock); }
    else row.append(label);
    row.addEventListener('click', () => runSafe(async()=>{
      if (!root && !(await ensureUnlocked(parts))) return;
      state.currentPath=parts.slice();state.expanded.add(pathKey(parts));state.selected=null;await refreshAll();
    }));
    return row;
  }
  async function appendTreeChildren(host, dir, parts, depth) {
    const children = (await getEntries(dir)).filter(x=>x.kind==='directory');
    for (const item of children) {
      const next=[...parts,item.name], key=pathKey(next), locked=isLocked(key);
      host.append(makeTreeRow(item.name,next,false,locked));
      if (state.expanded.has(key) && !locked) {
        const child=await dir.getDirectoryHandle(item.name);
        await appendTreeChildren(host,child,next,depth+1);
      }
    }
  }
  function colorFor(parts) { return state.meta.folderColors[pathKey(parts)] || '#d7aa4b'; }
  function folderGlyph(color,name='',depth=99) {
    const wrap=document.createElement('span');wrap.className='fm-folder-glyph';
    const categoryIcons=(window.WEBOS_CONTENT_STRUCTURE&&window.WEBOS_CONTENT_STRUCTURE.icons)||{'Contact':'👥','Event':'🗓️','MTI Collect':'📰','Recycle Bin':'♻️','Music':'♫'};
    if(depth===1&&categoryIcons[name]){wrap.classList.add('fm-category-glyph');wrap.textContent=categoryIcons[name];wrap.setAttribute('aria-label',name);return wrap;}
    const safe=/^#[0-9a-fA-F]{6}$/.test(color)?color:'#d7aa4b';
    wrap.innerHTML=`<svg viewBox="0 0 20 16" aria-hidden="true"><path d="M1 3h7l2 2h9v10H1Z" fill="${safe}" stroke="#654b18" stroke-width="1"/><path d="M1 6h18v9H1Z" fill="${safe}" stroke="#654b18" stroke-width="1"/><path d="M3 8h14v5H3Z" fill="rgba(255,255,255,.25)"/></svg>`;
    return wrap;
  }
  async function renderList() {
    const host=$('fm-list');host.replaceChildren();
    let entries=await getEntries(state.currentDir);
    if (state.currentPath.length === 3 && state.currentPath[0] === 'Event' && state.currentPath[1] === 'Event Json') entries = await sortEventFilesForFileManager(entries);
    $('fm-count').textContent=entries.length+' elem';
    for(const item of entries){
      const row=document.createElement('div');row.className='fm-entry';
      if(state.selected && state.selected.name===item.name && state.selected.parentKey===pathKey(state.currentPath))row.classList.add('selected');
      const icon=document.createElement('span');icon.className='fm-entry-icon';
      if(item.kind==='directory')icon.append(folderGlyph(colorFor([...state.currentPath,item.name]),item.name,state.currentPath.length+1));
      else icon.textContent=fileIcon(item.name);
      const name=document.createElement('span');name.className='fm-entry-name';name.textContent=item.name;
      row.append(icon,name);
      row.addEventListener('click',()=>runSafe(async()=>{
        const parts=[...state.currentPath,item.name];if(item.kind==='directory'&&!(await ensureUnlocked(parts)))return;
        state.selected={...item,parentKey:pathKey(state.currentPath),path:parts,parentDir:state.currentDir};
        await renderList();refreshSelectionButtons();status('Kijelölve: '+item.name);
      }));
      row.addEventListener('dblclick',()=>runSafe(async()=>{
        if(item.kind==='directory'){const parts=[...state.currentPath,item.name];if(!(await ensureUnlocked(parts)))return;state.currentPath=parts;state.expanded.add(pathKey(parts));state.selected=null;await refreshAll();}
        else if(/\.pdf$/i.test(item.name))await openPdfPreview(item.handle,item.name);
        else if(isTextFile(item.name))await editSelected();
      }));
      host.append(row);
    }
    if(!entries.length){const note=document.createElement('div');note.className='fm-empty-note';note.textContent='Ez a mappa üres.';host.append(note);}
  }
function fileIcon(name){const ext=name.split('.').pop().toLowerCase();if(['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext))return '▧';if(['mp3','wav','ogg','flac'].includes(ext))return '♫';if(['mp4','webm','mov','avi'].includes(ext))return '▶';if(['zip','7z','rar'].includes(ext))return '▤';if(['txt','md','log','json','xml','html','css','js','csv'].includes(ext))return '▧';return '▤';}
  function guessMime(name){const e=name.split('.').pop().toLowerCase();return ({txt:'text/plain',md:'text/markdown',log:'text/plain',json:'application/json',xml:'application/xml',html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',csv:'text/csv',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',svg:'image/svg+xml',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm'})[e]||'';}
  function isTextFile(name){return /\.(txt|md|log|json|xml|html?|css|js|mjs|cjs|csv|ini|cfg|yaml|yml|svg|sql|py|bat|cmd|ps1|rtf)$/i.test(name);}
  function formatSize(bytes){if(bytes<1024)return bytes+' B';const units=['KB','MB','GB','TB'];let n=bytes/1024,i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return n.toFixed(n>=10?1:2)+' '+units[i];}

  // Reusable compact retro dialog.
  function showDialog(title, fields, okText='OK') {
    return new Promise(resolve=>{
      if(state.dialogResolver) state.dialogResolver(null);
      state.dialogResolver=resolve;$('fm-dialog-title').textContent=title;$('fm-dialog-fields').replaceChildren();$('fm-dialog-ok').textContent=okText;
      for(const field of fields){
        const wrap=document.createElement('div');wrap.className='fm-field';
        if(field.type==='checkbox'){
          const label=document.createElement('label');label.className='fm-check';
          const input=document.createElement('input');input.type='checkbox';input.name=field.name;input.checked=!!field.value;
          label.append(input,document.createTextNode(field.label));wrap.append(label);
        } else {
          const label=document.createElement('label');label.textContent=field.label;label.htmlFor='fm-field-'+field.name;
          let input;
          if(field.type==='textarea'){input=document.createElement('textarea');input.value=field.value??'';}
          else if(field.type==='select'){
            input=document.createElement('select');
            for(const opt of field.options||[]){const o=document.createElement('option');o.value=opt.value;o.textContent=opt.label;input.append(o);}
            if(field.value!==undefined)input.value=field.value;
          } else {input=document.createElement('input');input.type=field.type||'text';input.value=field.value??'';}
          input.id='fm-field-'+field.name;input.name=field.name;if(field.autocomplete)input.autocomplete=field.autocomplete;
          if(field.type==='password')input.autocomplete='new-password';
          wrap.append(label,input);
        }
        $('fm-dialog-fields').append(wrap);
      }
      $('fm-modal-backdrop').classList.add('open');
      const first=$('fm-dialog-fields').querySelector('input:not([type=checkbox]),textarea,select');if(first)first.focus();
    });
  }
  function submitDialog(){
    const data={};for(const el of $('fm-dialog-form').elements){if(!el.name)continue;data[el.name]=el.type==='checkbox'?el.checked:el.value;}
    if(state.dialogResolver){const resolve=state.dialogResolver;state.dialogResolver=null;$('fm-modal-backdrop').classList.remove('open');resolve(data);}
  }
  function closeDialog(value){if(state.dialogResolver){const resolve=state.dialogResolver;state.dialogResolver=null;$('fm-modal-backdrop').classList.remove('open');resolve(value);}}
  function validateName(name){
    const n=(name||'').trim();
    if(!n||n==='.'||n==='..')throw new Error('Adj meg érvényes nevet.');
    if(/[<>:"/\\|?*\x00-\x1F]/.test(n)||/[. ]$/.test(n))throw new Error('A név tiltott karaktert vagy lezáró pontot/szóközt tartalmaz.');
    if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(n))throw new Error('Ez a név Windows alatt nem használható.');
    if(n===META_FILE)throw new Error('Ez a név fenntartott.');
    return n;
  }
  async function entryExists(dir,name){try{await dir.getFileHandle(name);return 'file';}catch(e){if(e.name!=='TypeMismatchError'&&e.name!=='NotFoundError')throw e;}try{await dir.getDirectoryHandle(name);return 'directory';}catch(e){if(e.name==='TypeMismatchError')return 'directory';if(e.name==='NotFoundError')return null;throw e;}}
  async function removeEntry(dir,name){await dir.removeEntry(name,{recursive:true});}
  async function copyFileHandle(srcHandle,destDir,destName){
    const file=await srcHandle.getFile();const out=await destDir.getFileHandle(destName,{create:true});const writer=await out.createWritable();await writer.write(file);await writer.close();
  }
  async function copyDirectoryHandle(srcDir,destDir){
    for await(const [name,handle] of srcDir.entries()){
      if(handle.kind==='directory'){
        const child=await destDir.getDirectoryHandle(name,{create:true});await copyDirectoryHandle(handle,child);
      } else await copyFileHandle(handle,destDir,name);
    }
  }
  async function copyEntry(sourceHandle,kind,destParent,newName){
    if(kind==='file') await copyFileHandle(sourceHandle,destParent,newName);
    else {const target=await destParent.getDirectoryHandle(newName,{create:true});await copyDirectoryHandle(sourceHandle,target);}
  }
  function remapMetadata(oldPath,newPath){
    for(const key of ['folderColors','vaults']){
      const obj=state.meta[key],changes=[];
      for(const [p,v] of Object.entries(obj)) if(p===oldPath||p.startsWith(oldPath+'/')) changes.push([p,newPath+p.slice(oldPath.length)]);
      changes.forEach(([from,to])=>{obj[to]=obj[from];delete obj[from];});
    }
  }
  function removeMetadataTree(path){for(const key of ['folderColors','vaults'])for(const p of Object.keys(state.meta[key]))if(p===path||p.startsWith(path+'/'))delete state.meta[key][p];}
  async function uniqueFsName(dir,base,extension='') {
    let candidate=base+extension,suffix=2;
    while(await entryExists(dir,candidate))candidate=base+' ('+(suffix++)+')'+extension;
    return candidate;
  }
  async function newFolder(){
    if(isProtectedSystemPath(state.currentPath))throw new Error('A Recycle Bin rendszerkönyvtár nem módosítható.');
    const r=await showDialog('Új mappa',[{name:'name',label:'Mappa neve'},{name:'color',label:'Mappa színe',type:'color',value:'#d7aa4b'},{name:'protect',label:'Vault jelszavas védelem',type:'checkbox'},{name:'password',label:'Egyéni jelszó',type:'password'},{name:'password2',label:'Jelszó megerősítése',type:'password'}],'Létrehozás');
    if(!r)return;const entered=String(r.name||'').trim();const name=entered?validateName(entered):await uniqueFsName(state.currentDir,'No Name');if(await entryExists(state.currentDir,name))throw new Error('Ilyen nevű elem már létezik.');
    await state.currentDir.getDirectoryHandle(name,{create:true});const path=[...state.currentPath,name],key=pathKey(path);
    if(/^#[0-9a-f]{6}$/i.test(r.color))state.meta.folderColors[key]=r.color;
    if(r.protect){if(r.password!==r.password2)throw new Error('A két jelszó nem egyezik.');const salt=crypto.getRandomValues(new Uint8Array(16));state.meta.vaults[key]={salt:toBase64(salt),iterations:260000,hash:await passwordHash(String(r.password||''),salt)};}
    await saveMeta();await refreshAll();status('Mappa létrehozva: '+name);
    await recordActivity('folder-created',{name,path:'Content\\'+path.join('\\')});notifyUser('Mappa létrehozva',name,'success');
  }
  async function newFile(){
    if(isProtectedSystemPath(state.currentPath))throw new Error('A Recycle Bin rendszerkönyvtár nem módosítható.');
    const r=await showDialog('Új fájl',[{name:'name',label:'Fájlnév'}],'Létrehozás');if(!r)return;const entered=String(r.name||'').trim();const name=entered?validateName(entered):await uniqueFsName(state.currentDir,'No Name');if(await entryExists(state.currentDir,name))throw new Error('Ilyen nevű elem már létezik.');
    const handle=await state.currentDir.getFileHandle(name,{create:true});const w=await handle.createWritable();await w.write('');await w.close();state.selected={name,handle,kind:'file',parentKey:pathKey(state.currentPath),parentDir:state.currentDir,path:[...state.currentPath,name]};await refreshAll();status('Fájl létrehozva: '+name);
    await recordActivity('file-created',{name,path:'Content\\'+state.currentPath.concat(name).join('\\')});
    notifyUser('Fájl létrehozva',name,'success');
  }
  async function uploadFiles(fileList){
    if(isProtectedSystemPath(state.currentPath))throw new Error('A Recycle Bin rendszerkönyvtár nem módosítható.');
    if(!fileList||!fileList.length)return;let count=0;
    for(const file of fileList){const name=validateName(file.name);const kind=await entryExists(state.currentDir,name);if(kind){if(!confirm('A(z) "'+name+'" már létezik. A régi fájl a Lomtárba kerül, az új pedig a helyére másolódik. Folytatod?'))continue;if(kind!=='file')throw new Error('A cél egy mappa, nem írható felül fájllal.');
        const oldHandle=await state.currentDir.getFileHandle(name);await moveItemToRecycleBin({name,handle:oldHandle,kind:'file',parentDir:state.currentDir,parentKey:pathKey(state.currentPath),path:[...state.currentPath,name]});
      }
      const handle=await state.currentDir.getFileHandle(name,{create:true});const w=await handle.createWritable();await w.write(file);await w.close();count++;}
    state.selected=null;await refreshAll();status(count+' fájl importálva.');
    if(count){
      const inMtiImport=state.mtiJsonImportDir&&state.currentDir===state.mtiJsonImportDir;
      await recordActivity(inMtiImport?'mti-json-import':'files-imported',{count,folder:'Content\\'+state.currentPath.join('\\')});
      notifyUser(inMtiImport?'MTI JSON-import kész':'Fájlimport kész',count+' fájl sikeresen importálva.', 'success');
      if(inMtiImport)await reloadMtiFiles();
    }
  }
  async function importFolder(){
    if(isProtectedSystemPath(state.currentPath))throw new Error('A Recycle Bin rendszerkönyvtár nem módosítható.');
    if(window.showDirectoryPicker){
      const src=await window.showDirectoryPicker({mode:'read'});
      if(typeof src.isSameEntry==='function' && !state.contentRoot?.isWebosServerHandle && ((await src.isSameEntry(state.contentRoot)) || (state.packageRoot && await src.isSameEntry(state.packageRoot)) || (await src.isSameEntry(state.currentDir)))) throw new Error('A Content mappa vagy annak csomagmappája nem importálható önmagába.');
      if(typeof src.resolve==='function' && !state.contentRoot?.isWebosServerHandle && await src.resolve(state.currentDir)!==null) throw new Error('A kiválasztott forrásmappa tartalmazza a célmappát. Válassz egy másik mappát.');
      const name=validateName(src.name);const existing=await entryExists(state.currentDir,name);
      if(existing){if(!confirm('A(z) "'+name+'" már létezik. A régi elem a Lomtárba kerül, az új mappa pedig importálódik. Folytatod?'))return;
        const oldHandle=existing==='directory'?await state.currentDir.getDirectoryHandle(name):await state.currentDir.getFileHandle(name);
        await moveItemToRecycleBin({name,handle:oldHandle,kind:existing,parentDir:state.currentDir,parentKey:pathKey(state.currentPath),path:[...state.currentPath,name]});
      }
      const dest=await state.currentDir.getDirectoryHandle(name,{create:true});await copyDirectoryHandle(src,dest);state.selected=null;await refreshAll();status('Teljes mappa importálva: '+name);
      await recordActivity('folder-imported',{name,path:'Content\\'+[...state.currentPath,name].join('\\')});notifyUser('Mappaimport kész',name+' sikeresen importálva.','success');
    }else $('fm-folder-input').click();
  }
  async function importFolderFallback(files){
    if(isProtectedSystemPath(state.currentPath))throw new Error('A Recycle Bin rendszerkönyvtár nem módosítható.');
    if(!files||!files.length)return;let rootName='Importált mappa';
    const first=files[0].webkitRelativePath||files[0].name;rootName=first.split('/')[0];rootName=validateName(rootName);
    if(await entryExists(state.currentDir,rootName))throw new Error('Ilyen nevű mappa már létezik.');
    const root=await state.currentDir.getDirectoryHandle(rootName,{create:true});
    for(const file of files){const rel=(file.webkitRelativePath||file.name).split('/').slice(1);let dir=root;for(const part of rel.slice(0,-1))dir=await dir.getDirectoryHandle(validateName(part),{create:true});const name=validateName(rel.at(-1)||file.name);const h=await dir.getFileHandle(name,{create:true});const w=await h.createWritable();await w.write(file);await w.close();}
    await refreshAll();status('Mappa importálva: '+rootName);
    await recordActivity('folder-imported',{name:rootName,path:'Content\\'+[...state.currentPath,rootName].join('\\'),fallback:true});
    notifyUser('Mappaimport kész',rootName+' sikeresen importálva.','success');
  }
  async function currentSelectionPath(){if(!state.selected)throw new Error('Nincs kiválasztott elem.');return state.selected.path;}
  async function renameSelected(){
    if(!state.selected)return;const item=state.selected;const path=await currentSelectionPath();if(isProtectedSystemPath(path))throw new Error('A rendszer Recycle Bin mappája nem nevezhető át.');if(!(await ensureUnlocked(path)))return;
    const r=await showDialog('Átnevezés',[{name:'name',label:'Új név',value:item.name}],'Átnevezés');if(!r)return;const entered=String(r.name||'').trim();const name=entered?validateName(entered):await uniqueFsName(item.parentDir,'No Name');if(name===item.name)return;
    if(await entryExists(item.parentDir,name))throw new Error('Ilyen nevű elem már létezik.');
    await copyEntry(item.handle,item.kind,item.parentDir,name);await removeEntry(item.parentDir,item.name);
    if(item.kind==='directory'){remapMetadata(pathKey(path),pathKey([...path.slice(0,-1),name]));await saveMeta();}
    state.selected=null;await refreshAll();status('Átnevezve: '+name);
    await recordActivity('item-renamed',{from:item.name,to:name,oldPath:'Content\\'+path.join('\\'),newPath:'Content\\'+[...path.slice(0,-1),name].join('\\')});notifyUser('Elem átnevezve',item.name+' → '+name,'success');
  }
  async function collectFolderTargets(dir,parts,out,depth=0){
out.push({value:pathKey(parts),label:'Content'+(parts.length?'\\'+parts.join('\\'):'')});
    for(const e of (await getEntries(dir)).filter(x=>x.kind==='directory')){const next=[...parts,e.name],key=pathKey(next);if(isLocked(key))continue;const child=await dir.getDirectoryHandle(e.name);await collectFolderTargets(child,next,out,depth+1);}
  }
  async function moveSelected(){
    if(!state.selected)return;const item=state.selected;const sourcePath=item.path;if(isProtectedSystemPath(sourcePath))throw new Error('A rendszer Recycle Bin mappája nem helyezhető át.');if(!(await ensureUnlocked(sourcePath)))return;
    const targets=[];await collectFolderTargets(state.contentRoot,[],targets);
    const blocked=item.kind==='directory'?targets.filter(x=>x.value!==pathKey(sourcePath)&&!x.value.startsWith(pathKey(sourcePath)+'/')):targets;
    const r=await showDialog('Áthelyezés',[{name:'target',label:'Célmappa',type:'select',options:blocked.map(x=>({value:x.value,label:x.label})),value:pathKey(state.currentPath)}],'Áthelyezés');if(!r)return;
    const targetParts=r.target?r.target.split('/'):[];if(isProtectedSystemPath(targetParts))throw new Error('A Recycle Bin rendszerkönyvtár nem lehet áthelyezési cél.');if(item.kind==='directory'&&(pathKey(targetParts)===pathKey(sourcePath)||pathKey(targetParts).startsWith(pathKey(sourcePath)+'/')))throw new Error('A mappa nem helyezhető át saját magába vagy almappájába.');
    if(!(await ensureUnlocked(targetParts)))return;
    const targetDir=await resolveDir(targetParts);if(targetDir===item.parentDir&&targetParts.join('/')===state.currentPath.join('/'))return;
    if(await entryExists(targetDir,item.name))throw new Error('A célmappában már van ilyen nevű elem.');
    await copyEntry(item.handle,item.kind,targetDir,item.name);await removeEntry(item.parentDir,item.name);
    if(item.kind==='directory'){remapMetadata(pathKey(sourcePath),pathKey([...targetParts,item.name]));await saveMeta();}
    state.selected=null;await refreshAll();status('Elem áthelyezve.');
    await recordActivity('item-moved',{name:item.name,from:'Content\\'+sourcePath.join('\\'),to:'Content\\'+[...targetParts,item.name].join('\\')});notifyUser('Elem áthelyezve',item.name,'success');
  }
  async function changeColor(){
    if(!state.selected||state.selected.kind!=='directory')return;const path=state.selected.path;if(isProtectedSystemPath(path))throw new Error('A rendszerkönyvtár metaadatai nem módosíthatók.');if(!(await ensureUnlocked(path)))return;
    const r=await showDialog('Mappaszín',[{name:'color',label:'Választható mappaszín',type:'color',value:colorFor(path)}],'Mentés');if(!r)return;
    state.meta.folderColors[pathKey(path)]=r.color;await saveMeta();await refreshAll();status('Mappaszín módosítva.');
    await recordActivity('folder-color-changed',{path:'Content\\'+path.join('\\'),color:r.color});notifyUser('Mappaszín módosítva',state.selected?.name||path.at(-1),'success');
  }
  async function toggleVault(){
    if(!state.selected||state.selected.kind!=='directory')return;const path=state.selected.path;if(isProtectedSystemPath(path))throw new Error('A rendszerkönyvtár Vault-beállítása nem módosítható.');const key=pathKey(path),record=state.meta.vaults[key];
    if(record){if(isLocked(key)){if(!(await ensureUnlocked(path)))return;status('Vault feloldva.');await recordActivity('vault-unlocked',{path:'Content\\'+path.join('\\')});notifyUser('Vault feloldva',state.selected?.name||path.at(-1),'success');}else{state.unlocked.delete(key);status('Vault aktiválva.');await recordActivity('vault-locked',{path:'Content\\'+path.join('\\')});notifyUser('Vault zárolva',state.selected?.name||path.at(-1),'info');}await refreshAll();return;}
    const r=await showDialog('Vault',[{name:'password',label:'Egyéni jelszó',type:'password'},{name:'password2',label:'Jelszó megerősítése',type:'password'}],'Zárolás');if(!r)return;
    if(String(r.password||'')!==String(r.password2||''))throw new Error('A jelszavak nem egyeznek.');
    const salt=crypto.getRandomValues(new Uint8Array(16));state.meta.vaults[key]={salt:toBase64(salt),iterations:260000,hash:await passwordHash(r.password,salt)};await saveMeta();status('Vault bekapcsolva.');await refreshAll();
    await recordActivity('vault-enabled',{path:'Content\\'+path.join('\\')});notifyUser('Vault bekapcsolva',state.selected?.name||path.at(-1),'success');
  }
  async function deleteSelected(){
    if(!state.selected)return;const item=state.selected;const path=item.path;
    if(isProtectedSystemPath(path))throw new Error('A Content\\Recycle Bin rendszerkönyvtár nem törölhető.');
    if(!(await ensureUnlocked(path)))return;
    if(!confirm('A(z) „'+item.name+'” a Lomtárba kerül. Folytatod?'))return;
    await moveItemToRecycleBin(item);
    state.selected=null;await refreshAll();status('Elem áthelyezve a Lomtárba: '+item.name);
  }
  async function editSelected(){
    const item=state.selected;if(!item||item.kind!=='file'||!isTextFile(item.name))return;
    if(isProtectedSystemPath(item.path))throw new Error('A Recycle Bin rendszerkönyvtár nem szerkeszthető.');
    const file=await item.handle.getFile();if(file.size>2_000_000)throw new Error('A szerkesztő legfeljebb 2 MB-os szövegfájlt nyit meg.');
    const r=await showDialog('Szerkesztés – '+item.name,[{name:'content',label:'Fájl tartalma',type:'textarea',value:await file.text()}],'Mentés');if(!r)return;
    const w=await item.handle.createWritable();await w.write(r.content);await w.close();await refreshAll();status('Fájl mentve: '+item.name);
    await recordActivity('file-edited',{name:item.name,path:'Content\\'+item.path.join('\\')});notifyUser('Fájl mentve',item.name,'success');
  }
