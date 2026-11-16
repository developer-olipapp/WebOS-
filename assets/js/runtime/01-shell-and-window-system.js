'use strict';
  const $ = id => document.getElementById(id);
  const META_FILE = '.aero-base-meta.json';
  const state = {
    packageRoot: null, packageRootIsContent: false, contentRoot: null, contactDir: null, eventRootDir: null, eventStudioDir: null, eventExportDir: null, eventWordExportDir: null, eventPdfExportDir: null, mtiCollectDir: null, mtiJsonImportDir: null, mtiExportDir: null, mtiWordExportDir: null, mtiPdfExportDir: null, recycleBinDir: null, musicDir: null, currentPath: [], currentDir: null,
    selected: null, expanded: new Set(['']), unlocked: new Set(), meta: {version:1,folderColors:{},vaults:{}},
    dialogResolver: null, busy: false
  };
  let appWindowZIndex = 10000;
  function bringAppToFront(win) {
    if(!win||!win.style)return;
    let highest=9999;
    document.querySelectorAll('.window,.aero-utility-window,.profile-window,.contact-search-overlay,.fm-modal-backdrop,.event-entry-backdrop,.event-detail-backdrop,.event-calendar-backdrop,.pdf-preview-overlay,.account-editor-backdrop').forEach(candidate=>{
      if(candidate===win||candidate.hidden||getComputedStyle(candidate).display==='none')return;
      const value=parseInt(getComputedStyle(candidate).zIndex,10);if(Number.isFinite(value))highest=Math.max(highest,value);
    });
    appWindowZIndex=Math.max(appWindowZIndex+1,highest+1);
    win.style.setProperty('z-index',String(appWindowZIndex),'important');
  }
  window.AERO_BRING_TO_FRONT=bringAppToFront;
  document.addEventListener('pointerdown',event=>{
    const win=event.target.closest('.window,.aero-utility-window,.profile-window,.contact-search-overlay,.fm-modal-backdrop,.event-entry-backdrop,.event-detail-backdrop,.event-calendar-backdrop,.pdf-preview-overlay,.account-editor-backdrop');
    if(win&&!win.hidden&&getComputedStyle(win).display!=='none')bringAppToFront(win);
  },true);

  const controls = {
    'fm-new-folder': newFolder, 'fm-upload': () => $('fm-file-input').click(),
    'fm-import-folder': importFolder, 'fm-edit': editSelected, 'fm-rename': renameSelected,
    'fm-move': moveSelected, 'fm-color': changeColor, 'fm-vault': toggleVault, 'fm-delete': deleteSelected
  };
  Object.entries(controls).forEach(([id, fn]) => $(id).addEventListener('click', () => runSafe(fn)));
  $('desktop-file-manager').addEventListener('dblclick', openManager);
  $('desktop-file-manager').addEventListener('click',()=>{$('desktop-file-manager').classList.add('selected');});
  $('desktop-contact').addEventListener('dblclick', openContact);
  $('desktop-contact').addEventListener('click',()=>{$('desktop-contact').classList.add('selected');});
  document.querySelectorAll('[data-launch-app]').forEach(button => button.addEventListener('click', () => {
    const app = button.dataset.launchApp;
    if (app === 'file-manager') openManager();
    if (app === 'contact-manager') openContact();
    if (app === 'event-studio') openEventStudio();
    if (app === 'mti-hu') launchMtiChrome();
    if (app === 'converter') openConverterHome();
    if (app === 'global-search') openGlobalSearch();
    if (app === 'recycle-bin') openRecycleBin();
    if (app === 'settings') window.AERO_SETTINGS?.open();
  }));
  $('contact-close').addEventListener('click', closeContact);
  $('contact-minimize').addEventListener('click', minimizeContact);
  $('searcher-query').addEventListener('input', renderSearcherResults);
  $('searcher-query').addEventListener('input', renderSearcherResults); const contactSearchPanel=$('contact-search-panel');document.body.append(contactSearchPanel);$('contact-search-toggle').addEventListener('click',()=>{contactSearchPanel.hidden=false;bringAppToFront(contactSearchPanel);renderSearcherResults();$('searcher-query').focus();});$('contact-search-close').addEventListener('click',()=>{contactSearchPanel.hidden=true;});contactSearchPanel.addEventListener('click',e=>{if(e.target===contactSearchPanel)contactSearchPanel.hidden=true;});
  $('event-close').addEventListener('click', closeEventStudio);
  $('event-minimize').addEventListener('click', minimizeEventStudio);
  $('event-back').addEventListener('click', () => showEventPage('home'));
  $('event-connect').addEventListener('click', () => runSafe(connectPackageFolder));
  document.querySelectorAll('[data-event-page]').forEach(button => button.addEventListener('click', () => showEventPage(button.dataset.eventPage)));
  $('event-log-folder').addEventListener('change', () => runEventSafe(renderEventLogPage));
  $('event-view-folder').addEventListener('change', () => runEventSafe(renderEventViewPage));
  $('event-log-new').addEventListener('click', () => { const folder = $('event-log-folder').value; if (folder) openEventEntryForm(folder); });
  $('event-create-folder').addEventListener('click', () => runEventSafe(createEventFolder));
  $('event-folder-date').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runEventSafe(createEventFolder); } });
  $('event-calendar-open').addEventListener('click', openEventCalendar);
  $('event-calendar-close').addEventListener('click', closeEventCalendar);
  $('event-calendar-backdrop').addEventListener('click', e => { if (e.target === $('event-calendar-backdrop')) closeEventCalendar(); });
  $('event-calendar-prev').addEventListener('click', () => shiftEventCalendarMonth(-1));
  $('event-calendar-next').addEventListener('click', () => shiftEventCalendarMonth(1));
  $('export-close').addEventListener('click', closeExportManagement);
  $('export-minimize').addEventListener('click', minimizeExportManagement);
  $('export-connect').addEventListener('click', () => runSafe(connectPackageFolder));
  $('export-folder-select').addEventListener('change', updateExportDestinationPreview);
  $('export-run').addEventListener('click', () => runExportSafe(() => exportSelectedEventFolder('pdf')));
  $('export-word').addEventListener('click', () => runExportSafe(() => exportSelectedEventFolder('docx')));
  $('server-gate-connect').addEventListener('click', connectFromServerGate);
  const serverGateSkip = $('server-gate-skip');
  if (serverGateSkip) serverGateSkip.addEventListener('click', finishServerGate);
  $('mti-close').addEventListener('click', closeMtiConverter);
  $('mti-minimize').addEventListener('click', minimizeMtiConverter);
  $('mti-refresh').addEventListener('click', () => runMtiSafe(reloadMtiFiles));
  $('mti-export-pdf').addEventListener('click', () => runMtiSafe(() => exportCurrentMtiDocument('pdf')));
  $('mti-export-docx').addEventListener('click', () => runMtiSafe(() => exportCurrentMtiDocument('docx')));
  $('mti-select-mode').addEventListener('click', toggleMtiSelectionMode);
  $('mti-delete-selected').addEventListener('click', () => runMtiSafe(deleteSelectedMtiRows));
  $('mti-connect').addEventListener('click', () => runSafe(connectPackageFolder));
  $('contact-new').addEventListener('click', newContact);
  $('contact-cancel').addEventListener('click', newContact);
  $('contact-save-top').addEventListener('click', ()=>$('contact-form').requestSubmit());
  $('contact-form').addEventListener('submit', e => { e.preventDefault(); runContactSafe(() => saveContact()); });
  $('contact-refresh').addEventListener('click', () => runContactSafe(reloadContacts));
  $('contact-connect').addEventListener('click', () => runContactSafe(connectOrResumeFolder));
  $('fm-close').addEventListener('click', closeManager);
  $('fm-minimize').addEventListener('click', minimizeManager);
  $('fm-preview').addEventListener('click', () => runSafe(async()=>{if(state.selected&&state.selected.kind==='file'&&/\.pdf$/i.test(state.selected.name))await openPdfPreview(state.selected.handle,state.selected.name);}));
  $('global-search-button').addEventListener('click', openGlobalSearch);
  $('global-search-close').addEventListener('click', closeGlobalSearch);
  $('global-search-minimize').addEventListener('click', minimizeGlobalSearch);
  $('global-search-query').addEventListener('input', scheduleGlobalSearch);
  $('global-search-scope').addEventListener('change', scheduleGlobalSearch);
  $('global-search-clear').addEventListener('click',()=>{$('global-search-query').value='';$('global-search-results').replaceChildren();$('global-search-status').textContent='Írj be legalább két karaktert a kereséshez.';$('global-search-query').focus();});
  $('converter-home-close').addEventListener('click',closeConverterHome);
  $('converter-home-minimize').addEventListener('click',()=>minimizeUtilityWindow('converter-home-window','converter'));
  document.querySelectorAll('[data-converter-mode]').forEach(button=>button.addEventListener('click',()=>selectConverterMode(button.dataset.converterMode)));
  $('export-mode-back').addEventListener('click',()=>{closeExportManagement();openConverterHome();});
  $('mti-mode-back').addEventListener('click',()=>{closeMtiConverter();openConverterHome();});
  $('recycle-bin-close').addEventListener('click', closeRecycleBin);
  $('recycle-bin-minimize').addEventListener('click', minimizeRecycleBin);
  $('recycle-bin-refresh').addEventListener('click',()=>renderRecycleBin());
  $('recycle-bin-empty').addEventListener('click',()=>emptyRecycleBin());
  $('pdf-preview-close').addEventListener('click', closePdfPreview);
  $('pdf-page-prev').addEventListener('click',()=>setPdfPreviewPage(pdfPreviewPage-1));
  $('pdf-page-next').addEventListener('click',()=>setPdfPreviewPage(pdfPreviewPage+1));
  $('pdf-page-input').addEventListener('change',()=>setPdfPreviewPage(Number($('pdf-page-input').value)||1));
  $('pdf-zoom-out').addEventListener('click',()=>setPdfPreviewZoom(pdfPreviewZoom-10));
  $('pdf-zoom-in').addEventListener('click',()=>setPdfPreviewZoom(pdfPreviewZoom+10));
  $('pdf-preview-external').addEventListener('click',()=>{if(pdfPreviewUrl)window.open(pdfPreviewUrl,'_blank','noopener');});
  $('fm-connect').addEventListener('click', () => runSafe(connectPackageFolder));
  $('fm-file-input').addEventListener('change', e => runSafe(() => uploadFiles(e.target.files)).finally(() => { e.target.value = ''; }));
  $('fm-folder-input').addEventListener('change', e => runSafe(() => importFolderFallback(e.target.files)).finally(() => { e.target.value = ''; }));
  $('fm-dialog-cancel').addEventListener('click', () => closeDialog(null));
  $('fm-dialog-form').addEventListener('submit', e => { e.preventDefault(); submitDialog(); });
function positionManager() {
    const win = $('fm-window');
    const viewportWidth = Math.max(320, window.innerWidth || document.documentElement.clientWidth);
    const viewportHeight = Math.max(240, window.innerHeight || document.documentElement.clientHeight);
    const taskbar = document.querySelector('.taskbar');
    const taskbarHeight = taskbar ? taskbar.getBoundingClientRect().height : 32;
    const workHeight = Math.max(180, viewportHeight - taskbarHeight);
    const width = Math.min(viewportWidth - 16, viewportWidth * 0.96, 1600);
    const height = Math.min(workHeight * 0.94, viewportHeight - 44, 1100);

    // A tálca feletti munkaterület középpontja. A transformot a CSS-animáció kezeli.
    win.style.setProperty('position', 'fixed', 'important');
    win.style.setProperty('left', '50%', 'important');
    win.style.setProperty('top', `${workHeight / 2}px`, 'important');
    win.style.setProperty('right', 'auto', 'important');
    win.style.setProperty('bottom', 'auto', 'important');
    win.style.setProperty('width', `${Math.max(1, width)}px`, 'important');
    win.style.setProperty('height', `${Math.max(1, height)}px`, 'important');
    win.style.setProperty('min-width', '0px', 'important');
    win.style.setProperty('min-height', '0px', 'important');
    win.style.setProperty('max-width', `${Math.max(1, viewportWidth - 16)}px`, 'important');
    win.style.setProperty('max-height', `${Math.max(1, viewportHeight - 44)}px`, 'important');
    win.style.setProperty('margin', '0px', 'important');
    win.style.setProperty('box-sizing', 'border-box', 'important');
    win.style.setProperty('resize', 'none', 'important');
    win.style.removeProperty('transform');
    win.style.setProperty('translate', 'none', 'important');
    win.style.setProperty('transform-origin', 'center center', 'important');
    win.style.setProperty('z-index', '9999', 'important');
  }
  function openManager() {
    const win=$('fm-window');
    win.classList.remove('closing','app-minimized');
    registerTask('file-manager','▣ File Manager',() => { if (win.classList.contains('app-minimized')) restoreManager(); else minimizeManager(); });
    positionManager();
    bringAppToFront(win);
    // Force the final geometry to be committed before the opening animation starts.
    void win.offsetWidth;
    win.classList.add('open');
    $('fm-empty').hidden=!!state.contentRoot;
    setActiveTask(true);
  }
  window.addEventListener('resize', () => {
    const win = $('fm-window');
    if (win.classList.contains('open') || win.classList.contains('closing')) positionManager();
  });
  let closeTimer = 0;
  function minimizeManager() {
    const win = $('fm-window');
    if (!win.classList.contains('open')) return;
    win.classList.add('app-minimized');
    setActiveTask(false);
  }
  function restoreManager() {
    const win = $('fm-window');
    win.classList.remove('app-minimized');
    positionManager();
    bringAppToFront(win);
    setActiveTask(true);
  }
  function closeManager() {
    const win = $('fm-window');
    if (!win.classList.contains('open') && !win.classList.contains('closing')) return;
    win.classList.remove('open');
    win.classList.add('closing');
    setActiveTask(false);
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      win.classList.remove('closing','app-minimized');
      removeTask('file-manager');
    }, 620);
  }
  function status(message) { $('fm-status-text').textContent = message; }
  function showError(error) {
    console.error(error);
    status(error && error.message ? error.message : 'Műveleti hiba');
  }
  async function runSafe(fn) {
    if (state.busy) return;
    try { state.busy = true; await fn(); }
    catch (error) { showError(error); await reportOperationFailure('File Manager',error); }
    finally { state.busy = false; }
  }
  function setButtons(enabled) {
    ['fm-new-folder','fm-upload','fm-import-folder'].forEach(id => $(id).disabled = !enabled);
    refreshSelectionButtons();
  }
  function refreshSelectionButtons() {
    const has = !!state.selected && !!state.contentRoot;
    const protectedSelection=has&&isProtectedSystemPath(state.selected.path);
    const protectedDirectory=isProtectedSystemPath(state.currentPath);
    ['fm-new-folder','fm-upload','fm-import-folder'].forEach(id=>$(id).disabled=!state.contentRoot||protectedDirectory);
    ['fm-rename','fm-move','fm-delete'].forEach(id => $(id).disabled = !has||protectedSelection);
    $('fm-preview').disabled = !(has && state.selected.kind === 'file' && /\.pdf$/i.test(state.selected.name));
    $('fm-color').disabled = !(has && state.selected.kind === 'directory'&&!protectedSelection);
    $('fm-vault').disabled = !(has && state.selected.kind === 'directory'&&!protectedSelection);
    $('fm-edit').disabled = !(has && !protectedSelection && state.selected.kind === 'file' && isTextFile(state.selected.name));
  }
