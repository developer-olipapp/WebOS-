
  function refreshDockTaskIndicators(){
    document.querySelectorAll('#dock-apps [data-launch-app],#dock-apps #dock-search,#dock-apps #dock-settings,.tray [data-launch-app]').forEach(button=>button.classList.remove('is-running','is-front'));
    const summary=new Map();
    for(const [id,record] of taskItems){const dockId=dockIdForTask(id);const item=summary.get(dockId)||{running:false,active:false};item.running=true;item.active=item.active||!!record.active;summary.set(dockId,item);}
    for(const [dockId,item] of summary){
      const button=[...document.querySelectorAll('#dock-apps [data-launch-app],#dock-apps #dock-search,#dock-apps #dock-settings,.tray [data-launch-app]')].find(el=>(el.dataset.launchApp||el.id.replace(/^dock-/,'').replace('settings','settings'))===dockId||(dockId==='global-search'&&el.id==='dock-search')||(dockId==='settings'&&el.id==='dock-settings'));
      if(button){button.classList.toggle('is-running',item.running);button.classList.toggle('is-front',item.active);}
    }
  }
  function registerTask(id,label,activate){taskItems.set(id,{label,activate,active:false});refreshDockTaskIndicators();return null;}
  function setTaskActive(id,active){const item=taskItems.get(id);if(!item)return;if(active)taskItems.forEach(record=>record.active=false);item.active=!!active;refreshDockTaskIndicators();}
  function removeTask(id){taskItems.delete(id);refreshDockTaskIndicators();}
  function setActiveTask(active){setTaskActive('file-manager',active);}
  window.AERO_DOCK_TASKS={register:registerTask,setActive:setTaskActive,remove:removeTask};
  function updateClock(){const d=new Date();$('clock').textContent=d.toLocaleTimeString('hu-HU',{hour:'2-digit',minute:'2-digit'});const dateNode=$('clock-date');if(dateNode)dateNode.textContent=d.toLocaleDateString('hu-HU',{year:'numeric',month:'2-digit',day:'2-digit'});}
  updateClock();setInterval(updateClock,1000);
