import {T,TN} from '../core/i18n.js';
import {ISO_D,ISO_M,blank,cleanTx,upgrade} from './clean.js';
import {S,allMonths,ensureTx,saveFile,savePlan,saveTx} from './storage.js';
import {state} from '../state.js';
import {ask} from '../ui/dialog.js';
import {render} from '../ui/render.js';
import {toast} from '../ui/toast.js';
/** Downloads a backup file: the plan and every month of transactions */
export async function backup(){
  const months=await allMonths(),t={};
  for(const m of months){await ensureTx(m);t[m]={items:state.tx[m].items}}
  const data=JSON.stringify({app:'budgeter',version:2,exported:new Date().toISOString(),plan:state.plan,tx:t},null,1);
  try{
    await saveFile(`budgeter-backup-${state.TODAY}.json`,data,'application/json');
    toast(T('Backup ready: plan and {months} of spending',{months:`${months.length} ${TN(months.length,'month','months')}`}));
  }catch(e){toast(T('Backup was not saved'))}
}
/** Restores a backup file (or an old Monthly planner backup), after asking @param {File} file */
export function restore(file){
  const r=new FileReader();
  r.onload=()=>{
    let b;try{b=JSON.parse(String(r.result))}catch(e){toast(T('That file is not a valid backup'));return}
    const ok=b&&(b.app==='budgeter'||b.app==='monthly-planner')&&b.plan&&['income','bills','accounts'].every(k=>Array.isArray(b.plan[k]));
    if(!ok){toast(T('That file is not a Budgeter or Monthly planner backup'));return}
    if(S.locked){toast(T('Your data didn’t load. Reload the page, then restore.'));return}
    const bt=b.tx&&typeof b.tx==='object'?b.tx:{};
    const ms=Object.keys(bt).filter(m=>ISO_M.test(m)&&bt[m]&&Array.isArray(bt[m].items));
    const when=typeof b.exported==='string'&&ISO_D.test(b.exported.slice(0,10))?` (${b.exported.slice(0,10)})`:'';
    ask(T('Restore your plan and {months} of spending from this backup{when}?',{months:`${ms.length} ${TN(ms.length,'month','months')}`,when}),T('Restore'),()=>{
      state.plan=Object.assign(blank(),b.plan);upgrade(state.plan);savePlan();
      ms.forEach(m=>{state.tx[m]=cleanTx(bt[m],m);saveTx(m)});
      render();toast(T('Backup restored'));
    });
  };
  r.readAsText(file);
}
