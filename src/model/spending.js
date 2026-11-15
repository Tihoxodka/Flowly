import {NOSPEND,RESERVED} from '../core/constants.js';
import {catKey} from '../core/i18n.js';
import {dict} from '../core/util.js';
import {ensureTx,savePlan,saveTx} from '../data/storage.js';
import {acct} from './accounts.js';
import {hsaPaid,isHSA} from './hsa.js';
import {evs,kickoffDay} from './schedule.js';
import {state} from '../state.js';
/** The category for a merchant: what it had last time, else the first matching rule @param {string} desc @param {number} amt */
export function catFor(desc,amt){
  const d=String(desc).toLowerCase(),mm=state.plan.merch?.[d];if(mm)return mm.cat;
  for(const l of (state.plan.rules||'').split('\n')){
    const i=l.lastIndexOf('=');if(i<1)continue;
    const k=l.slice(0,i).trim().toLowerCase(),c=l.slice(i+1).trim();
    if(k&&c&&d.includes(k))return catKey(c);
  }
  return amt>0?'Income':'Uncategorized';
}
/** Every category: the plan's, then the reserved ones */
export const catList=()=>[...new Set([...state.plan.cats.map(c=>c.name),...RESERVED])];
/** Every tag used, on transactions or remembered merchants, sorted */
export function tagList(){
  const s=new Set();
  Object.values(state.tx).forEach(m=>m.items.forEach(t=>t.tag&&s.add(t.tag)));
  Object.values(state.plan.merch||{}).forEach(v=>v.tag&&s.add(v.tag));
  return[...s].sort();
}
/** Logs a transaction in its month (loading the month first) @param {Tx} t */
export async function addTx(t){if(!t.at)t.at=Date.now();const nm=t.date.slice(0,7);await ensureTx(nm);state.tx[nm].items.push(t);saveTx(nm)}
/** Remembers a purchase's merchant: its category, tag and account come back next time @param {Tx} t */
export function learn(t){
  if(!(t.amt<0&&t.cat&&!NOSPEND.includes(t.cat)))return;
  (state.plan.merch=state.plan.merch||dict())[t.desc.toLowerCase()]={desc:t.desc,cat:t.cat,tag:t.tag||'',acct:t.acct||''};
  savePlan();
}
/** A bill that counts against spending money (not a card payment or paid from an HSA) @param {Ev} e */
export const isBudgetOut=e=>e.t==='out'&&!e.card&&!isHSA(acct(e.acct));
/** A month's logged spending (after the kickoff, without HSA purchases): the items, totals by category and the total @param {string} m */
export function logged(m){
  const k=kickoffDay(),items=(state.tx[m]||{items:[]}).items.filter(t=>!NOSPEND.includes(t.cat)&&!hsaPaid(t)&&!(k&&m===k.slice(0,7)&&t.date<k));
  const by=dict();items.forEach(t=>{by[t.cat]=(by[t.cat]||0)-t.amt});return{items,by,total:Object.values(by).reduce((s,v)=>s+v,0)};
}
/** @typedef {{m:string,by:Record<string,number>,tags:Record<string,number>,n:number,total:number,all:Record<string,number>,allTotal:number}} MonthSpend */
/**
 * What a month's spending is made of so far, biggest first: logged purchases up to today, and when all, the month's
 * bills that are checked off as paid (a bill that is only due doesn't count).
 * @param {string} m @param {Set<string>} [off] ids of accounts left out ('' is anything with no account) @param {boolean} [all]
 * @returns {{name:string,date:string,amt:number,cat:string,tag:string}[]}
 */
export function spendItems(m,off=new Set(),all=false){
  const on=id=>!off.has(acct(id)?id:'');
  const o=(state.tx[m]?.items||[]).filter(t=>!NOSPEND.includes(t.cat)&&on(t.acct)&&t.date<=state.TODAY).map(t=>({name:t.desc,date:t.date,amt:-t.amt,cat:t.cat,tag:t.tag||''}));
  if(all)evs(+m.slice(0,4),+m.slice(5)-1).forEach(e=>{if(isBudgetOut(e)&&on(e.acct)&&state.plan.done[e.key])o.push({name:e.name,date:e.date,amt:e.amt,cat:e.cat||'Other',tag:''})});
  return o.sort((a,b)=>b.amt-a.amt);
}
/** One month for Trends: logged spending by category and tag, and the same with the month's bills added (all) @param {string} m @param {Set<string>} [off] @returns {MonthSpend} */
export function monthSpend(m,off){
  const sum=o=>Object.values(o).reduce((s,v)=>s+v,0),tot=(items,k)=>{const o=dict();items.forEach(t=>{if(t[k])o[t[k]]=(o[t[k]]||0)+t.amt});return o};
  const L=spendItems(m,off),by=tot(L,'cat'),all=tot(spendItems(m,off,true),'cat');
  return{m,by,tags:tot(L,'tag'),n:L.length,total:sum(by),all,allTotal:sum(all)};
}
