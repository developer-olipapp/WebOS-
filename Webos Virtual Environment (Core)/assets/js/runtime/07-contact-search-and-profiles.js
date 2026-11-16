
  function centerExtraWindow(win, width, height) {
    const vw = Math.max(320,window.innerWidth || document.documentElement.clientWidth);
    const vh = Math.max(240,window.innerHeight || document.documentElement.clientHeight);
    const taskbar = document.querySelector('.taskbar');
    const workHeight = Math.max(180,vh-(taskbar ? taskbar.getBoundingClientRect().height : 32));
    win.style.left='50%';
    win.style.top=(workHeight/2)+'px';
    win.style.width=Math.max(1,Math.min(width,vw-20))+'px';
    win.style.height=Math.max(1,Math.min(height,workHeight-12))+'px';
    win.style.transform='translate(-50%,-50%)';
  }
  function renderSearcherResults() {
    const host=$('searcher-results');
    if(!host) return;
    host.replaceChildren();
    if(!state.contactDir) {
      $('searcher-count').textContent='—';
      const note=document.createElement('div');note.className='searcher-empty';
      note.textContent='A kontaktok eléréséhez előbb nyisd meg a Contact Managert, és csatlakoztasd az WEBOS főmappáját.';
      host.append(note);return;
    }
    const query=normalizeContactName($('searcher-query').value);
    const matches=contactRecords.filter(record=>!query || normalizeContactName(record.name).includes(query))
      .sort((a,b)=>a.name.localeCompare(b.name,'hu',{sensitivity:'base'}));
    $('searcher-count').textContent=`${matches.length} találat`;
    for(const record of matches) {
      const button=document.createElement('button');
      button.type='button';button.className='searcher-name';button.textContent=record.name||'No data';
      button.addEventListener('click',()=>openContactProfile(record));
      host.append(button);
    }
    if(!matches.length) {
      const note=document.createElement('div');note.className='searcher-empty';
      note.textContent=query?'Nincs ilyen nevű kontakt.':'Még nincs rögzített kontakt.';
      host.append(note);
    }
  }
  function formatContactDate(value) {
    if(!value) return 'Nincs adat';
    const date=new Date(value);
    return Number.isNaN(date.getTime())?String(value):date.toLocaleString('hu-HU',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  }
  async function copyContactValue(value,statusNode) {
    if(!value) return;
    let copied=false;
    try {
      if(navigator.clipboard && typeof navigator.clipboard.writeText==='function') {
        await navigator.clipboard.writeText(String(value));copied=true;
      }
    } catch(error) { console.warn('Clipboard API nem érhető el, tartalék másolás indul.',error); }
    if(!copied) {
      const area=document.createElement('textarea');area.value=String(value);
      area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';area.style.left='-9999px';
      document.body.append(area);area.select();
      try { copied=document.execCommand('copy'); } catch(_) { copied=false; }
      area.remove();
    }
    if(statusNode) statusNode.textContent=copied?'Vágólapra másolva.':'A böngésző nem engedélyezte a másolást.';
  }
  function loadPersonPhoto(image,fallback) {
    const extensions=['png','jpg','jpeg','webp','gif','bmp'];
    let index=0;
    const tryNext=()=>{
      if(index>=extensions.length){image.style.display='none';fallback.style.display='flex';return;}
      const extension=extensions[index++];
      image.onload=()=>{image.style.display='block';fallback.style.display='none';};
      image.onerror=tryNext;
      image.src='./person.'+extension;
    };
    tryNext();
  }
  function openContactProfile(record) {
    const sequence=++profileWindowSequence;
    const taskId='contact-profile-'+sequence;
    const win=document.createElement('section');
    win.className='profile-window';win.setAttribute('role','dialog');win.setAttribute('aria-label','Kontakt adatlap');
    win.dataset.taskId=taskId;
    const titlebar=document.createElement('div');titlebar.className='profile-titlebar';
    const title=document.createElement('span');title.className='profile-title-text';title.textContent='Kontakt adatlap — '+record.name;
    const minimize=document.createElement('button');minimize.type='button';minimize.textContent='_';minimize.setAttribute('aria-label','Kis méret');
    const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Bezárás');
    titlebar.append(title,minimize,close);

    const hero=document.createElement('div');hero.className='profile-hero';
    const photoWrap=document.createElement('div');photoWrap.className='profile-photo-wrap';
    const photo=document.createElement('img');photo.className='profile-photo';photo.alt='Profilkép';
    const fallback=document.createElement('div');fallback.className='profile-photo-fallback';fallback.textContent=record.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toLocaleUpperCase('hu-HU');
    photoWrap.append(photo,fallback);
    const heroCopy=document.createElement('div');heroCopy.className='profile-hero-copy';
    const kicker=document.createElement('div');kicker.className='profile-kicker';kicker.textContent='WEBOS · CONTACT PROFILE';
    const personName=document.createElement('div');personName.className='profile-person-name';personName.textContent=record.name;
    heroCopy.append(kicker,personName);hero.append(photoWrap,heroCopy);

    const details=document.createElement('div');details.className='profile-details';
    const storagePath='Content\\Contact\\'+record.fileName;
    const fields=[
      ['Név',record.name,true],['Titulus',record.title,true],['Telefonszám',record.phone,true],['Email cím',record.email,true],
      ['Létrehozva',formatContactDate(record.createdAt),false],['Módosítva',formatContactDate(record.updatedAt),false],['Tárolási hely',storagePath,false]
    ];
    for(const [labelText,value,copyable] of fields) {
      const row=document.createElement('div');row.className='profile-data-row';
      const label=document.createElement('div');label.className='profile-data-label';label.textContent=labelText;
      const content=document.createElement('div');content.className='profile-data-value';content.textContent=value || 'Nincs megadva';
      row.append(label,content);
      if(copyable) {
        const copy=document.createElement('button');copy.type='button';copy.className='profile-copy';copy.textContent='Másolás';
        copy.disabled=!value;copy.addEventListener('click',()=>copyContactValue(value,status));
        row.append(copy);
      } else {
        const spacer=document.createElement('span');spacer.setAttribute('aria-hidden','true');row.append(spacer);
      }
      details.append(row);
    }
    const status=document.createElement('div');status.className='profile-status';status.textContent='Kontakt adatlap';
    win.append(titlebar,hero,details,status);
    document.body.append(win);
    centerExtraWindow(win,650,690);
    bringAppToFront(win);
    loadPersonPhoto(photo,fallback);
    registerTask(taskId,'▤ '+record.name,()=>{
      if(win.classList.contains('app-minimized')) {win.classList.remove('app-minimized');setTaskActive(taskId,true);}
      else {win.classList.add('app-minimized');setTaskActive(taskId,false);}
    });
    setTaskActive(taskId,true);
    minimize.addEventListener('click',()=>{win.classList.add('app-minimized');setTaskActive(taskId,false);});
    close.addEventListener('click',()=>{win.remove();removeTask(taskId);profileWindows.delete(taskId);});
    profileWindows.set(taskId,win);
  }

  window.addEventListener('resize',()=>{
    const win=$('contact-window');
    if (win.classList.contains('open') || win.classList.contains('closing')) positionContactWindow();
    const mti=$('mti-converter-window');if(mti&&(mti.classList.contains('open')||mti.classList.contains('closing'))){mti.style.left='50%';mti.style.top='calc((100vh - 32px)/2)';}
    profileWindows.forEach(profile=>{if(!profile.classList.contains('app-minimized'))centerExtraWindow(profile,650,690);});
  });

  // Dock activity manager: running apps never create extra Dock icons.
  // The original application button receives a small red running underline.
  const taskHost=$('task-list');
  const taskItems=new Map();
  if(taskHost){taskHost.replaceChildren();taskHost.setAttribute('aria-hidden','true');}
  const dockIdForTask=id=>{
    if(String(id).startsWith('contact-profile-'))return 'contact-manager';
    const map={'file-manager':'file-manager','contact-manager':'contact-manager','event-studio':'event-studio','converter':'converter','mti-converter':'converter','export-management':'event-studio','global-search':'global-search','settings':'settings','recycle-bin':'recycle-bin'};
    return map[id]||id;
  };
