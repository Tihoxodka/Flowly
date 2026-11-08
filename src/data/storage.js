import {T} from '../core/i18n.js';
import {$,clone} from '../core/util.js';
import {cleanTx} from './clean.js';
import {state} from '../state.js';
/** Where data is saved: db and uid on claude.ai (null in the Mac app and the browser); locked after a failed load, so nothing overwrites it */
export const S={db:null,uid:null,locked:false};
/** Reads a saved value from this device @param {string} k */
export const lget=k=>{try{const v=localStorage.getItem('budgeter:'+k);return v?JSON.parse(v):null}catch(e){return null}};
/** Saves a value on this device; false if it couldn't @param {string} k @param {unknown} o */
export const lset=(k,o)=>{try{localStorage.setItem('budgeter:'+k,JSON.stringify(o));return true}catch(e){return false}};
const cpath=k=>`data/users/${S.uid}/${k}`;
const pend={},timers={},chain={};
/** The save status at the top of the page @param {string} t @param {string} [c] 'bad' for a problem */
export function status(t,c){const e=$('#st');e.textContent=t;e.className='st '+(c||'')}
/** What the save status says when everything is saved */
export const okMsg=()=>S.db?T('Saved to account and device'):T('Saved on this device');
/** Reads a saved document: the newer of this device's copy and the account's (which is then brought up to date) @param {string} k */
export async function sRead(k){
  const l=lget(k);let c=null;
  if(S.db){const s=await S.db.doc(cpath(k)).get();c=s.exists?clone(s.data()):null}
  if(l&&(!c||(l._ts||0)>(c._ts||0))){if(S.db){pend[k]=l;timers[k]=setTimeout(()=>flushKey(k),400)}return l}
  return c;
}
function flushKey(k){
  clearTimeout(timers[k]);const o=pend[k];if(!o||!S.db)return;delete pend[k];
  chain[k]=(chain[k]||Promise.resolve()).then(()=>S.db.doc(cpath(k)).set(o)).then(()=>{if(!Object.keys(pend).length)status(okMsg())},()=>{
    pend[k]=pend[k]||o;timers[k]=setTimeout(()=>flushKey(k),10000);status(T('Saved on this device, retrying account'),'bad');
  });
}
/** Sends every save still waiting to the account */
export const flushAll=()=>Object.keys(pend).forEach(flushKey);
function persist(k,get){
  if(S.locked)return;
  const o=clone(get());o._ts=Date.now();
  const ok=lset(k,o);
  if(!S.db){status(ok?okMsg():T('Could not save'),ok?'':'bad');return}
  pend[k]=o;status(T('Saving…'));clearTimeout(timers[k]);timers[k]=setTimeout(()=>flushKey(k),500);
}
/** Saves the plan */
export const savePlan=()=>persist('plan',()=>state.plan);
/** Saves one month of transactions @param {string} m 'YYYY-MM' */
export const saveTx=m=>persist('tx-'+m,()=>state.tx[m]);
/** Every month with saved transactions, on this device or in the account, sorted */
export async function allMonths(){
  const set=new Set(Object.keys(state.tx));
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('budgeter:tx-'))set.add(k.slice(12))}}catch(e){}
  if(S.db){try{(await S.db.collection('data/users/'+S.uid).get()).docs.forEach(d=>{if(d.id.startsWith('tx-'))set.add(d.id.slice(3))})}catch(e){}}
  return[...set].filter(m=>/^\d{4}-\d{2}$/.test(m)).sort();
}
/** Gives the person a file: through claude.ai's downloads, or a download link @param {string} filename @param {string} data @param {string} type */
export async function saveFile(filename,data,type){
  let dm=null;try{dm=window.claude?await claude.use('downloads'):null}catch(e){}
  if(dm)await dm.save({filename,data});
  else{
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
  }
}
/* older saves: Monthly planner kept data under planner: on this device and scheduled loans on the account */
export function moveOldKeys(){
  try{
    if(localStorage.getItem('budgeter:plan')||!localStorage.getItem('planner:plan'))return;
    const ks=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('planner:'))ks.push(k)}
    ks.forEach(k=>localStorage.setItem('budgeter:'+k.slice(8),localStorage.getItem(k)));
  }catch(e){}
}
/* Loads a month once. Callers at the same time share one read, so a transaction logged while the month is
   still loading can't be overwritten by the copy that finishes loading after it. */
const loadingTx={};
/** Loads a month of transactions into state.tx if it isn't there yet @param {string} m 'YYYY-MM' @returns {Promise<void>} */
export function ensureTx(m){
  if(state.tx[m])return Promise.resolve();
  return loadingTx[m]||(loadingTx[m]=sRead('tx-'+m).then(
    v=>{if(!state.tx[m])state.tx[m]=cleanTx(v,m)},
    ()=>{S.locked=true;if(!state.tx[m])state.tx[m]={items:[]};status(T('Load failed: reload before editing'),'bad')}
  ).finally(()=>{delete loadingTx[m]}));
}
