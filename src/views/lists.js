import {f2} from '../core/format.js';
import {html,TH} from '../core/html.js';
import {T,TN,cn,dl,monl} from '../core/i18n.js';
import {sum} from '../core/util.js';
import {acct,acctName} from '../model/accounts.js';
import {billKey,cardPay,cardSched,divItem,intItem,issuedOn,nextBill,sched} from '../model/schedule.js';
import {state} from '../state.js';
import {CONF,KINDS} from '../ui/forms.js';
import {project} from '../ui/render.js';
import {delBtn,editBtn,pill,table} from './shared.js';

/** Recorded actual amounts against their estimates, newest first @param {'in'|'out'} t */
function history(t){
  const itemOf=(tt,id)=>tt==='in'&&id.startsWith('int-')?intItem(id):tt==='in'&&id.startsWith('div-')?divItem(id)
    :(tt==='in'?state.plan.income:state.plan.bills).find(x=>x.id===id);
  const rows=Object.entries(state.plan.actual||{}).map(([k,v])=>{const [tt,id,d]=k.split(':');return{tt,d,v,it:itemOf(tt,id)}})
    .filter(r=>r.tt===t&&r.it).sort((a,b)=>a.d<b.d?1:-1).slice(0,12);
  if(!rows.length)return'';
  const row=r=>{
    const e=+r.it.amt||0,df=r.v-e;
    return html`<tr><td>${dl(r.d)}</td><td>${r.it.name}</td><td class="num">${f2(e)}</td><td class="num">${f2(r.v)}</td><td class="num ${
      df===0?'':(t==='in'?df>0:df<0)?'pos':'neg'}">${df>0?'+':''}${f2(df)}</td></tr>`;
  };
  const head=html`<th>${T('Date')}</th><th>${T(t==='in'?'Source':'Bill')}</th><th class="num">${T('Estimate')}</th><th class="num">${
    T('Actual')}</th><th class="num">${T('Difference')}</th>`;
  return html`<div class="sec"><h2>${T('Recorded amounts')}</h2>${table(head,rows.map(row))}</div>`;
}
/** A variable bill's next due date and the amount due, under its estimate @param {Item} i */
function dueInput(i){
  const d=nextBill(i);if(!d)return'';
  const k=billKey(i,d),v=state.plan.actual?.[k],out=issuedOn(i,d)<=state.TODAY;
  const when=v!=null?T(', billed'):out?T(', should be out'):T(', out around {date}',{date:dl(issuedOn(i,d))});
  return html`<div class="since" style="margin-top:6px">${T('Due {date}',{date:dl(d)})}${
    when}</div><input class="mini" type="number" step="any" min="0" inputmode="decimal" value="${
    v??''}" placeholder="${T('amount due')}" data-act="due" data-key="${k}" aria-label="${T('Amount due for {name}, due {date}',{name:i.name,date:dl(d)})}">`;
}
/** @param {'bills'|'income'} kind @param {Item} i */
function itemRow(kind,i){
  const isB=kind==='bills';
  const sub=[i.variable&&kind==='income'&&CONF[i.conf]?T(CONF[i.conf]):'',i.variable?i.basis:'',
    acct(i.to)?T('Pays down {name}',{name:acctName(i.to)}):''].filter(Boolean).join(', ');
  const name=html`${i.name}${i.planned?pill(T('planned')):''}${i.auto?pill(T('autopay')):''}${i.variable?pill(T('estimate')):''}${
    sub?html`<div class="muted" style="font-size:13px">${sub}</div>`:''}`;
  return html`<tr><td>${name}</td><td class="num">${i.variable?'~':''}${f2(+i.amt||0)}${isB&&i.variable?dueInput(i):''}</td><td>${sched(i)}</td><td>${
    acctName(i.acct)}</td>${isB?html`<td>${cn(i.cat||'')}</td>`:''}<td class="act">${editBtn(kind,i.id)} ${delBtn(kind,i.id)}</td></tr>`;
}
/** A card's statement payment, listed with the bills @param {Account} a */
const cardRow=a=>html`<tr><td>${T('{name} payment',{name:a.name})}${pill(T('card statement'))}<div class="muted" style="font-size:13px">${
  T('Change it on the Accounts tab.')}</div></td><td class="num">${+a.stmt>0?f2(+a.stmt):'—'}</td><td>${cardSched(a)}</td><td>${
  acctName(a.payfrom)}</td><td>${T('Card payment')}</td><td class="act">${editBtn('accounts',a.id)}</td></tr>`;
/** The Bills or Income tab @param {'bills'|'income'} kind */
export function vList(kind){
  const list=state.plan[kind],isB=kind==='bills',K=KINDS[kind];
  const ev=project().list.filter(e=>e.t===(isB?'out':'in')&&!e.passive&&!e.contrib),tot=sum(ev);
  const cards=isB?state.plan.accounts.filter(cardPay):[];
  const n=`${ev.length} ${isB?TN(ev.length,'payment','payments'):TN(ev.length,'deposit','deposits')}`;
  const total=TH(isB?'Due in {month}: {amt} across {n}':'Arriving in {month}: {amt} across {n}',{month:monl(state.view.m),amt:html`<b>${f2(tot)}</b>`,n});
  const head=html`<div class="row" style="margin-top:16px"><button class="btn pri" data-act="add" data-kind="${kind}">${
    T('Add {what}',{what:T(K.label)})}</button><span class="muted">${total}</span></div>`;
  if(!list.length&&!cards.length)return html`<div class="sec">${head}<div class="empty">${
    T(isB?'No bills yet. Add rent, subscriptions, loans and anything else with a due date.'
    :'No income yet. Add each paycheck or other deposit with its dates.')}</div></div>`;
  const rows=[[...list].sort((a,b)=>(a.planned?1:0)-(b.planned?1:0)).map(i=>itemRow(kind,i)),cards.map(cardRow)];
  const th=html`<th>${T(isB?'Bill':'Source')}</th><th class="num">${T('Amount')}</th><th>${T('Schedule')}</th><th>${
    T(isB?'Pays from':'Deposits into')}</th>${isB?html`<th>${T('Category')}</th>`:''}<th></th>`;
  return html`<div class="sec">${head}${table(th,rows)}</div>${history(isB?'out':'in')}`;
}
