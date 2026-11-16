

  // System start entry. Content directories are initialized when storage access is granted.
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
      event.preventDefault();openGlobalSearch();
    }
    if(event.key==='Escape'&&$('pdf-preview-overlay')?.classList.contains('open'))closePdfPreview();
  });
  recordActivity('system-start',{build:33,interface:'Compact Aurora Dock',module:'WEBOS Converter'});

  restoreSavedFolder().catch(error=>console.warn('Content mappa visszaállítási hiba:',error));
