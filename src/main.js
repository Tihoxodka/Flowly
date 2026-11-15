import {newDay} from './core/dates.js';
import {LANG_NAMES,T} from './core/i18n.js';
import {$} from './core/util.js';
import './events.js';
import {restore} from './data/backup.js';
import {blank,upgrade} from './data/clean.js';
import {DESK} from './ai/caps.js';
import {S,allMonths,ensureTx,flushAll,folderDb,lget,moveOldKeys,okMsg,pull,pullAll,sRead,savePlan,status} from './data/storage.js';
import {state} from './state.js';
import {chrome,loadTheme} from './ui/chrome.js';
import {VIEWS,render} from './ui/render.js';
loadTheme();
$('#rf').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)restore(f)};
addEventListener('visibilitychange',()=>{if(document.hidden)flushAll();else if(newDay())render()});
/* a new day while the app is open: due dates, warnings and "today" move on */
addEventListener('focus',()=>{if(newDay())render();pullAll()});
setInterval(()=>{if(newDay())render()},60000);
addEventListener('pagehide',flushAll);
(async()=>{
  try{
    if(window.claude&&claude.use){
      const [db,user]=await Promise.all([claude.use('db'),claude.use('user')]);
      const id=user&&await user.id();
      if(db&&id){S.db=db;S.uid=id}
    }
  }catch(e){}
  /* the Mac app with a shared folder chosen: save there too, and merge in what another Mac saves */
  try{
    const f=DESK?.sync,dir=f&&await f.dir();
    $('#share').hidden=!f;
    if(dir){S.db=folderDb(f);S.uid='shared';S.sync=dir;S.changed=render;f.onChange(pull)}
  }catch(e){}
  {const ui=lget('ui'),sys=(navigator.language||'').toLowerCase().startsWith('ru')?'ru':'en';state.LANG=LANG_NAMES.some(x=>x[0]===ui?.lang)?ui.lang:sys}
  chrome();
  if(S.db)$('#savenote').dataset.t=S.sync?'Changes save automatically to the shared folder and to this device.':'Changes save automatically to your account and to this device.';
  moveOldKeys();
  try{state.plan=Object.assign(blank(),await sRead('plan')||{})}
  catch(e){S.locked=true;state.plan=blank();status(T('Load failed: reload before editing'),'bad')}
  if(!S.locked)status(okMsg());
  if(upgrade(state.plan))savePlan();
  const ui=lget('ui');if(ui&&VIEWS[ui.tab]&&ui.tab!=='kickoff')state.tab=ui.tab;
  if(state.plan.kickoff&&!state.plan.kickDone&&state.plan.accounts.length)state.tab='kickoff';
  render();
  /* every month, so each one is merged with the folder's copy, saved there if it's missing, and kept up to date */
  if(S.sync)allMonths().then(ms=>ms.forEach(ensureTx));
})();
