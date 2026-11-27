import {NOSPEND} from '../core/constants.js';
import {monthKeyOf} from '../core/dates.js';
import {f2} from '../core/format.js';
import {T,TN,cn,dl} from '../core/i18n.js';
import {html,options} from '../core/html.js';
import {$,dict} from '../core/util.js';
import {acctName} from '../model/accounts.js';
import {hsaPaid} from '../model/hsa.js';
import {evs} from '../model/schedule.js';
import {catList,isBudgetOut,logged,tagList} from '../model/spending.js';
import {state} from '../state.js';
import {qaHtml} from './quicklog.js';
import {pill} from './shared.js';
/** This month's transactions that match the search and filters, newest first */
function txFiltered(){
  const items=(state.tx[monthKeyOf(state.view)]||{items:[]}).items,q=state.fq.toLowerCase();
  return items.filter(t=>(!q||t.desc.toLowerCase().includes(q))&&(!state.fcat||t.cat===state.fcat)&&(!state.ftag||t.tag===state.ftag))
    .sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
}
/** This month's bills checked off as paid that match the filters (bills have no tag) */
function billsPaid(){
  if(state.ftag)return[];
  const q=state.fq.toLowerCase();
  return evs(state.view.y,state.view.m).filter(e=>isBudgetOut(e)&&state.plan.done[e.key]&&(!q||e.name.toLowerCase().includes(q))&&(!state.fcat||(e.cat||'Other')===state.fcat));
}
/** "5 purchases, $120 spent" for the rows shown */
export function txSum(){
  const l=txFiltered().filter(t=>!NOSPEND.includes(t.cat)),sp=-l.reduce((s,t)=>s+t.amt,0),h=-l.filter(hsaPaid).reduce((s,t)=>s+t.amt,0);
  const b=billsPaid(),bs=b.reduce((s,e)=>s+e.amt,0);
  return T('{n}, {amt} spent',{n:`${l.length} ${TN(l.length,'purchase','purchases')}`,amt:f2(sp)})+(h?T(', {amt} of it from your HSA',{amt:f2(h)}):'')+
    (b.length?T('; {n} paid, {amt}',{n:`${b.length} ${TN(b.length,'bill','bills')}`,amt:f2(bs)}):'');
}
/* Each row shows its category as a button; the dropdown is built only when it's clicked. A dropdown in every row
   meant thousands of options to lay out, which made a full month slow to show. */
/** @param {Tx} t */
const catBtn=t=>html`<button class="btn sm tcat" type="button" data-act="tcatpick" data-id="${t.id}" aria-label="${
  T('Category: {name}. Change it',{name:cn(t.cat)})}">${cn(t.cat)}</button>`;
/** Turns a row's category button into the dropdown @param {HTMLElement} b the button @param {string} id the transaction */
export function catPick(b,id){
  const m=monthKeyOf(state.view),t=state.tx[m]?.items.find(x=>x.id===id);if(!t)return;
  const cl=catList(),cats=cl.includes(t.cat)?cl:[...cl,t.cat];
  const s=document.createElement('select');
  s.dataset.act='tcat';s.dataset.id=id;s.setAttribute('aria-label',T('Category'));s.style.width='auto';
  s.innerHTML=String(html`${options(cats.map(c=>[c,cn(c)]),t.cat)}`);
  b.replaceWith(s);s.focus();
  try{s.showPicker()}catch(e){}
  /* leaving it (changed or not) turns it back into a button showing the category */
  s.addEventListener('blur',()=>{if(s.isConnected){s.insertAdjacentHTML('afterend',String(catBtn(t)));s.remove()}});
}
/** @param {Tx} t */
const txRow=t=>html`<tr><td>${dl(t.date)}</td><td>${t.desc}${t.tag?html`<span class="pill tag">${t.tag}</span>`:''}</td><td>${catBtn(t)}</td><td>${
  acctName(t.acct)}</td><td class="num ${t.amt>0?'pos':''}">${f2(t.amt)}</td><td class="act"><button class="btn sm" data-act="tedit" data-id="${
  t.id}">${T('Edit')}</button> <button class="btn sm ghost danger" data-act="tdel" data-id="${t.id}" aria-label="${T('Delete')}">×</button></td></tr>`;
/** A paid bill: shown, but edited on the Overview tab @param {Ev} e */
const billRow=e=>html`<tr><td>${dl(e.date)}</td><td>${e.name}${pill(T('bill'))}</td><td>${cn(e.cat||'Other')}</td><td>${
  acctName(e.acct)}</td><td class="num">${f2(-e.amt)}</td><td></td></tr>`;
/** The rows of this month's transactions and paid bills that match the filters, newest first */
export function txRows(){
  const l=[...txFiltered().map(t=>({date:t.date,row:txRow(t)})),...billsPaid().map(e=>({date:e.date,row:billRow(e)}))].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  if(!l.length)return html`<tr><td colspan="6" class="muted">${
    T(state.fq||state.fcat||state.ftag?'Nothing logged matches these filters.':'Nothing logged this month yet.')}</td></tr>`;
  return html`${l.map(x=>x.row)}`;
}
/** The search box and the category and tag filters @param {string[]} tags */
const filters=tags=>html`<div class="row"><input class="grow" id="q" placeholder="${T('Search merchant')}" value="${state.fq}" aria-label="${
  T('Search')}"><select id="fc" style="width:auto" aria-label="${T('Category filter')}"><option value="">${T('All categories')}</option>${
  options(catList().map(c=>[c,cn(c)]),state.fcat)}</select><select id="ft" style="width:auto" aria-label="${T('Tag filter')}"><option value="">${
  T('All tags')}</option>${tags.map(c=>html`<option${c===state.ftag?' selected':''}>${c}</option>`)}</select></div>`;
/** The Spending tab */
export function vSpend(){
  const L=logged(monthKeyOf(state.view)),byTag=dict();L.items.forEach(t=>{if(t.tag)byTag[t.tag]=(byTag[t.tag]||0)-t.amt});
  const tagged=Object.keys(byTag).length?html`<p class="muted small">${T('Tagged this month:')} ${
    Object.entries(byTag).map(([k,v])=>`${k} ${f2(v)}`).join(' · ')}</p>`:'';
  return html`<div class="sec" style="margin-top:18px">${qaHtml()}</div>
  <div class="row"><button class="btn" data-act="timport">${T('Import statement')}</button><button class="btn" data-act="trules">${
    T('Category rules')}</button><button class="btn ghost" data-act="tadd">${T('Add with more detail')}</button></div>
  ${tagged}
  ${filters(tagList())}
  <p id="txs" class="muted">${txSum()}</p>
  <div class="scroll"><table><thead><tr><th>${T('Date')}</th><th>${T('Merchant')}</th><th>${T('Category')}</th><th>${T('Account')}</th><th class="num">${
    T('Amount')}</th><th></th></tr></thead><tbody id="txb">${txRows()}</tbody></table></div>`;
}
/** Filtering redraws only the rows and the total, so typing in the search box keeps its focus */
export function wireSpend(){
  const up=()=>{$('#txb').innerHTML=txRows();$('#txs').textContent=txSum()};
  $('#q').oninput=e=>{state.fq=e.target.value;up()};
  $('#fc').onchange=e=>{state.fcat=e.target.value;up()};
  $('#ft').onchange=e=>{state.ftag=e.target.value;up()};
}
