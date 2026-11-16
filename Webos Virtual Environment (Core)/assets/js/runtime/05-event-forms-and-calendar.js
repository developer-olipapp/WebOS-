
  async function renderEventLogPage() {
    const folder=$('event-log-folder').value;
    $('event-log-new').disabled=!folder;
    const host=$('event-log-list');
    if(!folder){host.replaceChildren();$('event-log-count').textContent='0 esemény';return;}
    await renderEventEntries(host,folder,'event-log-count');
  }
  async function renderEventViewPage() {
    const folder=$('event-view-folder').value;
    const host=$('event-view-list');
    if(!folder){host.replaceChildren();$('event-view-count').textContent='0 esemény';return;}
    await renderEventEntries(host,folder,'event-view-count');
  }
  async function renderEventEntries(host,folder,countId) {
    host.replaceChildren();const records=await readEventRecords(folder);
    $(countId).textContent=`${records.length} esemény`;
    if(!records.length){const empty=document.createElement('div');empty.className='event-empty';empty.textContent='Ebben a célmappában még nincs naplózott esemény.';host.append(empty);return;}
    for(const record of records) {
      const row=document.createElement('button');row.type='button';row.className='event-row';
      const group=document.createElement('span');group.className='event-group-tag';group.textContent=record.group||'No data';
      const time=document.createElement('span');time.className='event-row-time';const parsedTime=parseEventSortValue(record.dateTime);const storedTime=record.time||((parsedTime&&parsedTime.hasTime)?parsedTime.time:'');time.textContent=storedTime?formatEventTimeLabel(storedTime):'';
      const nature=document.createElement('span');nature.className='event-row-nature';nature.textContent=record.nature||'No data';
      const open=document.createElement('span');open.className='event-row-open';open.textContent='Megnyitás ›';
      row.append(group,time,nature,open);row.addEventListener('click',()=>openEventDetail(record));host.append(row);
    }
  }
  function openEventEntryForm(folderName, editRecord=null) {
    if(!state.eventStudioDir){eventStatus('Előbb csatlakoztasd a Content mappát.');return;}
    const host=$('event-entry-host');host.replaceChildren();
    const backdrop=document.createElement('div');backdrop.className='event-entry-backdrop';
    const formId='webos-event-entry-form';
    backdrop.innerHTML=`<section class="event-entry-window" role="dialog" aria-modal="true" aria-label="${editRecord?'Esemény szerkesztése':'Esemény naplózása'}"><div class="event-entry-titlebar"><span>${editRecord?'✎':'＋'}</span><span>${editRecord?'Esemény szerkesztése':'Esemény naplózása'}</span><button class="event-action primary event-entry-submit-top" type="submit" form="${formId}">Mentés</button><button class="event-entry-close" type="button" aria-label="Bezárás">×</button></div><div class="event-entry-folder-note">CÉLMAPPA: <b class="event-entry-folder-name"></b></div><form id="${formId}" class="event-entry-form" autocomplete="off"><div class="event-form-grid"><label class="event-form-field event-meta-date">Dátum<input name="date" type="text" maxlength="10" placeholder="YYYY.MM.DD" autocomplete="off"></label><label class="event-form-field event-meta-time">Idő<input name="time" type="text" maxlength="8" placeholder="7:45 · 07:45 · 7.45 · 07.45" autocomplete="off"></label><label class="event-form-field event-meta-group">Csoport<select name="group"><option value="">Válassz csoportot…</option><option>Közélet</option><option>Kultúra</option><option>Gazdaság</option><option>Világ</option></select></label><label class="event-form-field event-meta-place">Hely<input name="place" type="text" maxlength="500" placeholder="Az esemény helyszíne (opcionális)"></label><label class="event-form-field event-meta-nature">Esemény jellege<input name="nature" type="text" maxlength="220" placeholder="Az esemény rövid megnevezése"></label><label class="event-form-field event-meta-description">Esemény leírása<textarea name="description" placeholder="Az esemény részletes leírása…"></textarea></label><label class="event-form-field event-meta-contact">Kontakt<textarea name="contact" placeholder="Kapcsolódó személyek, szervezetek vagy elérhetőségek…"></textarea></label></div><div class="event-entry-actions"><span class="event-entry-folder-hint">${editRecord?'A módosítás az eredeti JSON-fájlba mentődik.':'A dátum alapértelmezésben a célmappa dátuma. Minden mező opcionális.'}</span><span class="event-entry-message" aria-live="polite"></span></div></form></section>`;
    backdrop.querySelector('.event-entry-folder-name').textContent=folderName;
    backdrop.querySelector('.event-entry-close').addEventListener('click',()=>backdrop.remove());
    const form=backdrop.querySelector('form');
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const submit=backdrop.querySelector('.event-entry-submit-top');
      const message=backdrop.querySelector('.event-entry-message');
      submit.disabled=true;message.textContent='';
      try { await saveEventForm(backdrop,folderName,editRecord); }
      catch(error) { console.warn('Esemény mentése visszautasítva:',error);message.textContent=error&&error.message?error.message:'A mentés nem sikerült.';eventStatus(message.textContent); }
      finally { if(submit.isConnected)submit.disabled=false; }
    });
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)backdrop.remove();});
    host.append(backdrop);
    bringAppToFront(backdrop);
    const valueOf=(name)=>form.elements.namedItem(name);
    if(editRecord){
      valueOf('date').value=editRecord.date||'';
      valueOf('time').value=editRecord.time?String(editRecord.time).replace('.',':'):'';
      valueOf('group').value=editRecord.group||'';
      valueOf('place').value=editRecord.place||'';
      valueOf('nature').value=editRecord.nature||'';
      valueOf('description').value=editRecord.description||'';
      valueOf('contact').value=editRecord.contact||'';
    }else{
      valueOf('date').value=parseEventFolderDate(folderName)?folderName:'';
    }
    valueOf('date').focus();
  }
  function parseEventDate(value) {
    const raw=String(value||'').trim();
    if(!raw)return null;
    const m=/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(raw);
    if(!m)throw new Error('A dátum formátuma YYYY.MM.DD legyen.');
    const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
    const date=new Date(year,month-1,day);
    if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)throw new Error('A megadott dátum nem érvényes.');
    return {date,normalized:`${String(year).padStart(4,'0')}.${String(month).padStart(2,'0')}.${String(day).padStart(2,'0')}`};
  }
  function parseEventTime(value) {
    const raw=String(value||'').trim();
    if(!raw)return null;
    // Elfogadott alakok: 7:45, 07:45, 7.45, 07.45; a szóköz sem számít.
    const m=/^(\d{1,2})\s*([:.])\s*(\d{2})$/.exec(raw);
    if(!m)throw new Error('Az idő formátuma például 7:45, 07:45, 7.45 vagy 07.45 legyen.');
    const hour=Number(m[1]),minute=Number(m[3]);
    if(hour>23||minute>59)throw new Error('A megadott idő nem érvényes. Az óra 0–23, a perc 00–59 lehet.');
    return {hour,minute,normalized:`${String(hour).padStart(2,'0')}.${String(minute).padStart(2,'0')}`,display:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`};
  }
  function formatEventTimeLabel(value) {
    const parsed=parseEventTime(value);
    if(parsed)return parsed.display;
    const raw=String(value||'').trim();
    const m=/^(\d{1,2})[.:](\d{2})$/.exec(raw);
    return m?`${String(Number(m[1])).padStart(2,'0')}:${m[2]}`:raw;
  }
  function safeEventFilePart(value) {
    const source=String(value||'').trim();
    const titled=source?source.split(/\s+/).filter(Boolean).map(word=>word.charAt(0).toLocaleUpperCase('hu-HU')+word.slice(1)).join(' '):'No Value';
    return titled.replace(/[<>:"/\\|?*\x00-\x1F]/g,'-').replace(/[. ]+$/g,'').slice(0,150).trim()||'No Value';
  }
  async function uniqueEventFileName(folder,base) {
    let candidate=base+'.json',suffix=2;
    while(await entryExists(folder,candidate)) {candidate=base+` (${suffix})`+'.json';suffix++;}
    return candidate;
  }
  async function saveEventForm(backdrop,folderName,editRecord=null) {
    const form=backdrop.querySelector('form');
    const data=Object.fromEntries(new FormData(form).entries());
    const parsedDate=parseEventDate(data.date);
    const parsedTime=parseEventTime(data.time);
    const date=parsedDate?parsedDate.normalized:'';
    const time=parsedTime?parsedTime.normalized:'';
    const dateTime=date?(date+(time?' '+time:'')):'';
    const group=EVENT_GROUPS.includes(String(data.group||''))?String(data.group):'';
    const nature=String(data.nature||'').trim();
    const folder=await getEventFolderHandle(folderName);
    const now=new Date().toISOString();
    const payload={format:'AERO-BASE-EVENT',version:3,id:editRecord?.id||(crypto.randomUUID?crypto.randomUUID():'event-'+Date.now()),folder:folderName,date,time,dateTime,group,place:String(data.place||'').trim(),nature,description:String(data.description||'').trim(),contact:String(data.contact||'').trim(),createdAt:editRecord?.createdAt||now,updatedAt:editRecord?now:null};
    let fileName,handle;
    if(editRecord){
      fileName=editRecord.fileName;
      if(!fileName)throw new Error('Az eredeti eseményfájl neve nem található.');
      handle=await folder.getFileHandle(fileName);
    }else{
      const datePart=date||'No Date',timePart=time?'_'+time:'';
      const base=`${datePart}${timePart}_${safeEventFilePart(nature)}`;
      fileName=await uniqueEventFileName(folder,base);
      handle=await folder.getFileHandle(fileName,{create:true});
    }
    const writer=await handle.createWritable();
    try{await writer.write(JSON.stringify(payload,null,2));await writer.close();}catch(error){try{await writer.abort();}catch(_){}throw error;}
    backdrop.remove();
    await reloadEventFolders();
    if($('event-log-folder').value===folderName)await renderEventLogPage();
    if($('event-view-folder').value===folderName)await renderEventViewPage();
    if(state.contentRoot&&$('fm-window').classList.contains('open'))await refreshAll();
    eventStatus((editRecord?'Esemény módosítva: ':'Esemény mentve: ')+'Content\\Event\\Event Json\\'+folderName+'\\'+fileName);
    await recordActivity(editRecord?'event-updated':'event-saved',{nature,folder:folderName,fileName,path:'Content\\Event\\Event Json\\'+folderName+'\\'+fileName});
    notifyUser(editRecord?'Esemény módosítva':'Új esemény rögzítve',nature+' · '+folderName,'success');
    if(!editRecord)openEventEntryForm(folderName);
  }
  function openEventDetail(record) {
    const backdrop=document.createElement('div');backdrop.className='event-detail-backdrop';
    const panel=document.createElement('section');panel.className='event-detail-window';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
    const title=document.createElement('div');title.className='event-detail-titlebar';title.innerHTML='<span>▤</span><span>Esemény részletei</span>';
    const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Bezárás');close.addEventListener('click',()=>backdrop.remove());title.append(close);
    const body=document.createElement('div');body.className='event-detail-body';
    const parsedDetailDateTime=parseEventSortValue(record.dateTime)||{};
    const detailDate=record.date||parsedDetailDateTime.dateKey||'';
    const detailTime=record.time?formatEventTimeLabel(record.time):(parsedDetailDateTime.hasTime?formatEventTimeLabel(parsedDetailDateTime.time):'');
    const fields=[['Dátum',detailDate],['Idő',detailTime],['Csoport',record.group],['Hely',record.place],['Esemény jellege',record.nature],['Esemény leírása',record.description],['Kontakt',record.contact],['Fájlnév',record.fileName],['Célmappa','Content\\Event\\Event Json\\'+record.folder]];
    for(const [labelText,value] of fields){
      const row=document.createElement('div');row.className='event-detail-row';
      const label=document.createElement('div');label.className='event-detail-label';label.textContent=labelText;
      const content=document.createElement('div');content.className='event-detail-value';content.textContent=value||'No data';
      const copy=document.createElement('button');copy.type='button';copy.className='event-copy-button';copy.textContent='Másolás';copy.disabled=!value;copy.addEventListener('click',()=>copyEventText(String(value),copy));
      row.append(label,content,copy);body.append(row);
    }
    const footer=document.createElement('div');footer.className='event-detail-footer';
    const edit=document.createElement('button');edit.type='button';edit.className='event-action primary';edit.textContent='✎ Szerkesztés';edit.addEventListener('click',()=>{backdrop.remove();openEventEntryForm(record.folder,record);});
    const copyAll=document.createElement('button');copyAll.type='button';copyAll.className='event-action';copyAll.textContent='Teljes esemény másolása';
    copyAll.addEventListener('click',()=>copyEventText(fields.map(([k,v])=>k+': '+(v||'')).join('\\n'),copyAll));
    footer.append(edit,copyAll);panel.append(title,body,footer);backdrop.append(panel);
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)backdrop.remove();});document.body.append(backdrop);bringAppToFront(backdrop);
  }
  async function copyEventText(value,button) {
    if(!value)return;let copied=false;
    try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(value);copied=true;}}catch(error){console.warn('Clipboard API nem érhető el:',error);}
    if(!copied){const area=document.createElement('textarea');area.value=value;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();try{copied=document.execCommand('copy');}catch(_){}area.remove();}
    if(button){const old=button.textContent;button.textContent=copied?'Másolva':'Nem sikerült';setTimeout(()=>{if(button.isConnected)button.textContent=old;},1300);}
  }
  function openEventCalendar() {
    const current=validateCalendarMonthFromInput()||new Date();eventCalendarMonth=new Date(current.getFullYear(),current.getMonth(),1);
    renderEventCalendar();$('event-calendar-backdrop').style.display='flex';$('event-calendar-backdrop').setAttribute('aria-hidden','false');bringAppToFront($('event-calendar-backdrop'));
  }
  function validateCalendarMonthFromInput() {
    const raw=$('event-folder-date').value.trim();if(!raw)return null;
    const date=parseEventFolderDate(raw.replace(/\.$/,''));return date;
  }
  function closeEventCalendar() {$('event-calendar-backdrop').style.display='none';$('event-calendar-backdrop').setAttribute('aria-hidden','true');}
  function shiftEventCalendarMonth(amount) {eventCalendarMonth=new Date(eventCalendarMonth.getFullYear(),eventCalendarMonth.getMonth()+amount,1);renderEventCalendar();}
  function renderEventCalendar() {
    const monthNames=['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'];
    $('event-calendar-month').textContent=eventCalendarMonth.getFullYear()+'. '+monthNames[eventCalendarMonth.getMonth()];
    const host=$('event-calendar-grid');host.replaceChildren();
    const first=new Date(eventCalendarMonth.getFullYear(),eventCalendarMonth.getMonth(),1);
    const mondayOffset=(first.getDay()+6)%7;
    const start=new Date(first.getFullYear(),first.getMonth(),1-mondayOffset);
    const today=new Date();today.setHours(0,0,0,0);
    for(let i=0;i<42;i++){
      const day=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);const key=eventDateKey(day);
      const button=document.createElement('button');button.type='button';button.className='event-calendar-day';button.textContent=String(day.getDate());
      if(day.getMonth()!==eventCalendarMonth.getMonth())button.classList.add('other');
      if(day.getTime()===today.getTime())button.classList.add('today');
      button.addEventListener('click',()=>{$('event-folder-date').value=key;closeEventCalendar();$('event-folder-date').focus();});host.append(button);
    }
  }
  function eventDateKey(date) {return `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`;}
