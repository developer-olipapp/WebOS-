



  // EVENT STUDIO — every dated target folder contains event JSON files.
  const EVENT_GROUPS = ['Közélet','Kultúra','Gazdaság','Világ'];
  let eventFolders = [];
  let eventCalendarMonth = new Date(new Date().getFullYear(),new Date().getMonth(),1);
  let eventStudioCloseTimer = 0;
  function eventStatus(message) { $('event-status').textContent = message; }
  async function runEventSafe(fn) {
    try { await fn(); }
    catch (error) { console.error(error); eventStatus(error && error.message ? error.message : 'Event Studio műveleti hiba'); await reportOperationFailure('Event Studio',error); }
  }
  function openEventStudio() {
    const win=$('event-studio-window');
    win.classList.remove('closing','app-minimized');
    registerTask('event-studio','◷ Event Studio',()=>{if(win.classList.contains('app-minimized'))restoreEventStudio();else minimizeEventStudio();});
    bringAppToFront(win);
    void win.offsetWidth;win.classList.add('open');setTaskActive('event-studio',true);
    $('event-disconnected').hidden=!!state.eventStudioDir;
    if(state.eventStudioDir) runEventSafe(reloadEventFolders);
  }
  function minimizeEventStudio() {
    const win=$('event-studio-window');if(!win.classList.contains('open'))return;
    win.classList.add('app-minimized');setTaskActive('event-studio',false);
  }
  function restoreEventStudio() {
    const win=$('event-studio-window');win.classList.remove('app-minimized');bringAppToFront(win);setTaskActive('event-studio',true);
  }
  function closeEventStudio() {
    const win=$('event-studio-window');if(!win.classList.contains('open')&&!win.classList.contains('closing'))return;
    win.classList.remove('open');win.classList.add('closing');setTaskActive('event-studio',false);
    window.clearTimeout(eventStudioCloseTimer);
    eventStudioCloseTimer=window.setTimeout(()=>{win.classList.remove('closing','app-minimized');removeTask('event-studio');},240);
  }
  function showEventPage(page) {
    const pages={home:'event-home-page',log:'event-log-page',view:'event-view-page',folders:'event-folders-page'};
    if(!pages[page])page='home';
    Object.entries(pages).forEach(([key,id])=>$(id).hidden=key!==page);
    $('event-back').hidden=page==='home';
    $('event-toolbar-title').textContent=({home:'Eseménykezelő',log:'Esemény naplózása',view:'Napló megtekintése',folders:'Mappaszerkezet kezelése'})[page];
    if(page==='log') runEventSafe(async()=>{await reloadEventFolders();populateEventFolderSelect('event-log-folder');await renderEventLogPage();});
    if(page==='view') runEventSafe(async()=>{await reloadEventFolders();populateEventFolderSelect('event-view-folder');await renderEventViewPage();});
    if(page==='folders') runEventSafe(async()=>{await reloadEventFolders();renderEventFolderList();});
  }
  function parseEventFolderDate(name) {
    const m=/^(\d{4})\.(\d{2})\.(\d{2})$/.exec(String(name||''));if(!m)return null;
    const date=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
    if(date.getFullYear()!==Number(m[1])||date.getMonth()!==Number(m[2])-1||date.getDate()!==Number(m[3]))return null;
    date.setHours(0,0,0,0);return date;
  }
  // Mappák: a valódi YYYY.MM.DD dátumok mindig növekvő naptári sorrendben,
  // ettől eltérő nevű mappák pedig a lista végén, név szerint következnek.
  function compareEventFolderNames(a,b) {
    const da=parseEventFolderDate(a),db=parseEventFolderDate(b);
    if(da&&db)return da.getTime()-db.getTime();
    if(da)return -1;
    if(db)return 1;
    return String(a).localeCompare(String(b),'hu',{numeric:true,sensitivity:'base'});
  }
  async function reloadEventFolders() {
    if(!state.contentRoot||!state.eventStudioDir) {
      eventFolders=[];$('event-disconnected').hidden=false;
      populateEventFolderSelect('event-log-folder');populateEventFolderSelect('event-view-folder');populateExportFolderSelect();renderEventFolderList();
      eventStatus('Nincs csatlakoztatva: Content\\Event\\Event Json');return;
    }
    const found=[];
    for await(const [name,handle] of state.eventStudioDir.entries()) {
      if(handle.kind!=='directory')continue;
      found.push({name,handle});
    }
    found.sort((a,b)=>compareEventFolderNames(a.name,b.name));eventFolders=found;
    $('event-disconnected').hidden=true;
    populateEventFolderSelect('event-log-folder');populateEventFolderSelect('event-view-folder');populateExportFolderSelect();renderEventFolderList();
    eventStatus(`${eventFolders.length} célmappa · Content\\Event\\Event Json`);
  }
  function populateEventFolderSelect(id) {
    const select=$(id);if(!select)return;
    const previous=select.value;
    select.replaceChildren();
    const first=document.createElement('option');first.value='';first.textContent='Válassz célmappát…';select.append(first);
    for(const folder of eventFolders){const option=document.createElement('option');option.value=folder.name;option.textContent=folder.name;select.append(option);}
    if(eventFolders.some(x=>x.name===previous))select.value=previous;
  }
  function renderEventFolderList() {
    const host=$('event-folder-list');if(!host)return;host.replaceChildren();
    $('event-folder-count').textContent=`${eventFolders.length} mappa`;
    if(!eventFolders.length){const empty=document.createElement('div');empty.className='event-empty';empty.textContent='Még nincs célmappa. Adj meg egy dátumot vagy egy tetszőleges mappanevet; dátum nélküli mappák a lista végére kerülnek.';host.append(empty);return;}
    for(const folder of eventFolders){const row=document.createElement('div');row.className='event-folder-chip';row.textContent=folder.name;host.append(row);}
  }
  function validateEventFolderName(raw) {
    const value=String(raw||'').trim();
    // Ha dátumként van megadva, csak létező YYYY.MM.DD napot fogadunk el.
    // Más, biztonságos mappanevek (például 'abcd') is megengedettek;
    // ezek automatikusan a dátummappák után kerülnek.
    if(!value)return 'No Name';
    if(/^\d{4}\.\d{2}\.\d{2}$/.test(value)&&!parseEventFolderDate(value)) {
      throw new Error('A megadott dátum nem létező naptári nap. Használd a YYYY.MM.DD formátumot.');
    }
    return validateName(value);
  }
  async function createEventFolder() {
    if(!state.eventStudioDir)throw new Error('Előbb csatlakoztasd az WEBOS Content mappáját.');
    let folderName=validateEventFolderName($('event-folder-date').value);
    if(folderName==='No Name') {
      let suffix=2;
      while(await entryExists(state.eventStudioDir,folderName))folderName='No Name ('+(suffix++)+')';
    }
    if(await entryExists(state.eventStudioDir,folderName))throw new Error('Ilyen nevű célmappa már létezik: '+folderName);
    await state.eventStudioDir.getDirectoryHandle(folderName,{create:true});
    $('event-folder-date').value='';
    await reloadEventFolders();
    if(state.contentRoot&&$('fm-window').classList.contains('open'))await refreshAll();
    eventStatus('Célmappa létrehozva: Content\\Event\\Event Json\\'+folderName);
    await recordActivity('event-folder-created',{name:folderName,path:'Content\\Event\\Event Json\\'+folderName});
    notifyUser('Eseménymappa létrehozva',folderName,'success');
  }
  async function getEventFolderHandle(folderName) {
    if(!state.eventStudioDir)throw new Error('Az Event Studio tárhely nincs csatlakoztatva.');
    return await state.eventStudioDir.getDirectoryHandle(folderName);
  }
  async function readEventRecords(folderName) {
    if(!folderName)return [];
    const folder=await getEventFolderHandle(folderName),records=[];let unreadable=0;
    for await(const [fileName,handle] of folder.entries()) {
      if(handle.kind!=='file'||!fileName.toLowerCase().endsWith('.json'))continue;
      try {
        const file=await handle.getFile();if(file.size>2*1024*1024){unreadable++;continue;}
        const data=JSON.parse(await file.text());
        if(!data||data.format!=='AERO-BASE-EVENT'||typeof data.nature!=='string')continue;
        const legacyDateTime=String(data.dateTime||'');
        const legacyParts=parseEventSortValue(legacyDateTime);
        const eventDate=String(data.date||((legacyParts&&legacyParts.dateKey)||''));
        const eventTime=String(data.time||((legacyParts&&legacyParts.hasTime)?legacyParts.time:''));
        const normalizedDateTime=eventDate?(eventDate+(eventTime?' '+eventTime:'')):legacyDateTime;
        records.push({id:data.id||fileName,folder:folderName,fileName,handle,date:eventDate,time:eventTime,dateTime:normalizedDateTime,group:String(data.group||''),place:String(data.place||data.location||''),nature:String(data.nature||''),description:String(data.description||''),contact:String(data.contact||''),createdAt:data.createdAt||'',updatedAt:data.updatedAt||null});
      } catch(error){unreadable++;console.warn('Nem olvasható eseményfájl:',fileName,error);}
    }
    records.sort(compareEventRecords);
    if(unreadable)eventStatus(`${unreadable} eseményfájl nem volt olvasható · ${folderName}`);
    return records;
  }
  function eventGroupRank(group) {
    const index=EVENT_GROUPS.indexOf(String(group||'').trim());
    return index<0?EVENT_GROUPS.length:index;
  }
  function parseEventSortValue(value) {
    const raw=String(value||'').trim();
    if(!raw)return null;
    const m=/^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{1,2})[.:](\d{2}))?$/.exec(raw);
    if(!m)return null;
    const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
    const hour=m[4]===undefined?null:Number(m[4]),minute=m[5]===undefined?0:Number(m[5]);
    const date=new Date(year,month-1,day);
    if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return null;
    if(hour!==null&&(hour<0||hour>23||minute<0||minute>59))return null;
    // 0 = teljes dátum + idő; 1 = csak dátum; null = üres/érvénytelen, ezért a végére kerül.
    return {hasTime:hour!==null,dayValue:Date.UTC(year,month-1,day),minuteOfDay:hour===null?0:hour*60+minute,dateKey:m[1]+'.'+m[2]+'.'+m[3],time:hour===null?'':String(hour).padStart(2,'0')+'.'+String(minute).padStart(2,'0')};
  }
  function compareEventDateTimes(a,b) {
    const pa=parseEventSortValue(a),pb=parseEventSortValue(b);
    if(pa&&pb) {
      // Először naptári nap szerint; ugyanazon a napon az idő nélküli
      // bejegyzés kerül a csoport végére.
      if(pa.dayValue!==pb.dayValue)return pa.dayValue-pb.dayValue;
      if(pa.hasTime!==pb.hasTime)return pa.hasTime?-1:1;
      if(pa.hasTime&&pa.minuteOfDay!==pb.minuteOfDay)return pa.minuteOfDay-pb.minuteOfDay;
      return String(a||'').localeCompare(String(b||''),'hu',{numeric:true,sensitivity:'base'});
    }
    if(pa)return -1;
    if(pb)return 1;
    return String(a||'').localeCompare(String(b||''),'hu',{numeric:true,sensitivity:'base'});
  }
  function compareEventRecords(a,b) {
    const groupDiff=eventGroupRank(a.group)-eventGroupRank(b.group);
    if(groupDiff)return groupDiff;
    const dateDiff=compareEventDateTimes(a.dateTime,b.dateTime);
    if(dateDiff)return dateDiff;
    return String(a.fileName||'').localeCompare(String(b.fileName||''),'hu',{numeric:true,sensitivity:'base'});
  }
  async function sortEventFilesForFileManager(entries) {
    const decorated=await Promise.all(entries.map(async item=>{
      if(item.kind!=='file'||!item.name.toLowerCase().endsWith('.json'))return {item,isEvent:false,record:null};
      try {
        const file=await item.handle.getFile();
        const data=JSON.parse(await file.text());
        if(data&&data.format==='AERO-BASE-EVENT') {
          const legacy=String(data.dateTime||'');
          const parsedLegacy=parseEventSortValue(legacy);
          const date=String(data.date||((parsedLegacy&&parsedLegacy.dateKey)||''));
          const time=String(data.time||((parsedLegacy&&parsedLegacy.hasTime)?parsedLegacy.time:''));
          const dateTime=date?(date+(time?' '+time:'')):legacy;
          return {item,isEvent:true,record:{group:String(data.group||''),dateTime,fileName:item.name}};
        }
      } catch(error) { console.warn('Event Studio fájlsorrend: nem olvasható JSON',item.name,error); }
      return {item,isEvent:false,record:null};
    }));
    decorated.sort((a,b)=>{
      if(a.item.kind!==b.item.kind)return a.item.kind==='directory'?-1:1;
      if(a.isEvent&&b.isEvent)return compareEventRecords(a.record,b.record);
      if(a.isEvent!==b.isEvent)return a.isEvent?-1:1;
      return a.item.name.localeCompare(b.item.name,'hu',{numeric:true,sensitivity:'base'});
    });
    return decorated.map(x=>x.item);
  }
