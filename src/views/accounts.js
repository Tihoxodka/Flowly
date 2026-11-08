import {FREQS,PER,TYPES} from '../core/constants.js';
import {addDays} from '../core/dates.js';
import {f0,f2} from '../core/format.js';
import {html} from '../core/html.js';
import {T,dl,mon,ord,wdl} from '../core/i18n.js';
import {acctName,assetsDebts,hasInt,isDebt,mInt} from '../model/accounts.js';
import {payoff} from '../model/debt.js';
import {hsaNow,hsaSpent,hsaYear,isHSA} from '../model/hsa.js';
import {sched} from '../model/schedule.js';
import {state} from '../state.js';
import {project} from '../ui/render.js';
import {delBtn,editBtn,table} from './shared.js';

/** @typedef {{end:Record<string,number>|null, endH?:Record<string,number>}} Ends balances at the end of the month shown (none before the start) */

/** @param {string} label */
const th=label=>html`<th>${T(label)}</th>`;
/** a header for a column of numbers @param {string} label */
const thNum=label=>html`<th class="num">${T(label)}</th>`;
/** @param {Ends} p */
const thEnd=p=>p.end?html`<th class="num">${T('End of {month}',{month:mon(state.view.m)})}</th>`:'';
/** @param {Account} a @param {Ends} p */
const endCell=(a,p)=>p.end?html`<td class="num ${p.end[a.id]<0&&!isDebt(a)?'neg':''}">${f0(p.end[a.id])}</td>`:'';
/** @param {Account} a @param {Ends} p */
const endPlain=(a,p)=>p.end?html`<td class="num">${f0(p.end[a.id])}</td>`:'';
/** @param {Account} a */
const balCell=a=>html`<td class="num"><input class="mini" type="number" step="any" value="${+a.bal||0}" data-act="bal" data-id="${a.id}" aria-label="${
  T('Balance of {name}',{name:a.name})}"><div class="since">${a.upd?dl(a.upd):''}</div></td>`;
/** @param {Account} a */
const btns=a=>html`<td class="act">${editBtn('accounts',a.id)} ${delBtn('accounts',a.id)}</td>`;
/** @param {string} title @param {unknown} head @param {unknown} rows @param {unknown} [after] */
const section=(title,head,rows,after='')=>html`<div class="sec"><h2>${T(title)}</h2>${table(head,rows)}${after}</div>`;

/** Your and your employer's contributions to a retirement account or HSA @param {Account} a */
function contribCell(a){
  const you=+a.contrib||0,er=+a.match||0;
  if(!(you>0||er>0))return'—';
  const from=a.cfrom?T('from {name}',{name:acctName(a.cfrom)}):T('payroll');
  return html`${you>0?T('You {amt} ({from})',{amt:f2(you),from}):''}${you>0&&er>0?', ':''}${
    er>0?T('employer {amt}',{amt:f2(er)}):''}<div class="muted" style="font-size:13px">${
    sched({freq:a.cfreq,date:a.cdate,day2:a.cday2})}</div>`;
}
/** @param {Account} a */
const perYear=a=>{const n=PER[a.cfreq||'biweekly']||0,both=(+a.contrib||0)+(+a.match||0);return both>0?f0(both*n):'—'};

/** @param {Account[]} list @param {Ends} p */
function cashSection(list,p){
  const intTot=list.filter(hasInt).reduce((s,a)=>s+mInt(a),0);
  const apy=a=>html`<input class="mini" style="width:76px" type="number" step="any" min="0" value="${+a.apy||''}" placeholder="0" data-act="apy" data-id="${
    a.id}" aria-label="${T('APY of {name}',{name:a.name})}">`;
  const row=a=>html`<tr><td>${a.name}</td><td>${T(TYPES.find(t=>t[0]===a.type)?.[1]||'')}</td>${balCell(a)}<td class="num">${apy(a)}</td><td class="num">${
    hasInt(a)?f2(mInt(a)):'—'}</td>${endCell(a,p)}${btns(a)}</tr>`;
  const note=intTot?html`<p class="muted small">${T('Estimated interest: {amt} a month, about {year} a year.',{amt:f2(intTot),year:f0(intTot*12)})}</p>`:'';
  return section('Cash accounts',[th('Name'),th('Type'),thNum('Balance'),thNum('APY %'),thNum('Interest a month'),thEnd(p),th('')],list.map(row),note);
}
/** @param {Account[]} list @param {Ends} p */
function investSection(list,p){
  const cash=a=>html`<input class="mini" type="number" step="any" value="${+a.cash||0}" data-act="cash" data-id="${a.id}" aria-label="${
    T('Buying power of {name}',{name:a.name})}">`;
  const divs=a=>+a.divAmt>0?html`${f2(+a.divAmt)}, ${T(FREQS.find(f=>f[0]===(a.divFreq||'quarterly'))?.[1]||'').toLowerCase()}, ${
    T(a.divMode==='reinvest'?'reinvested':'to buying power')}`:'—';
  const ends=a=>p.end?html`<td class="num">${T('{amt} invested',{amt:f0(p.endH[a.id])})}<br>${T('{amt} cash',{amt:f0(p.end[a.id])})}</td>`:'';
  const row=a=>html`<tr><td>${a.name}</td>${balCell(a)}<td class="num">${cash(a)}</td><td class="num">${f0((+a.bal||0)+(+a.cash||0))}</td><td>${
    divs(a)}</td>${ends(a)}${btns(a)}</tr>`;
  return section('Investments',[th('Name'),thNum('Invested'),thNum('Buying power'),thNum('Total'),th('Dividends'),thEnd(p),th('')],list.map(row));
}
/** @param {Account[]} list @param {Ends} p */
function retireSection(list,p){
  const row=a=>html`<tr><td>${a.name}</td>${balCell(a)}<td>${contribCell(a)}</td><td class="num">${perYear(a)}</td>${endPlain(a,p)}${btns(a)}</tr>`;
  return section('Retirement',[th('Name'),thNum('Balance'),th('Contributions'),thNum('Per year'),thEnd(p),th('')],list.map(row));
}
/** this year's HSA contributions against the IRS limit @param {Account} a */
function hsaLimitCell(a){
  const Y=hsaYear(a),over=Y.total>Y.limit;
  const left=over?T('{amt} over the {year} limit',{amt:f0(Y.total-Y.limit),year:Y.limitYear}):T('{amt} room left',{amt:f0(Y.limit-Y.total)});
  return html`<td class="num ${over?'neg':''}">${T('{amt} of {limit}',{amt:f0(Y.total),limit:f0(Y.limit)})}<div class="since ${over?'neg':''}">${left}${
    Y.so?'':T('. Add what’s gone in so far this year with Edit')}</div></td>`;
}
/** @param {Account[]} list @param {Ends} p */
function hsaSection(list,p){
  const avail=a=>{
    const sp=hsaSpent(a);
    return html`${f2(hsaNow(a))}<div class="since">${sp?T('{amt} on the card since {date}',{amt:f2(sp),date:dl(a.upd)}):T('no card purchases since')}</div>`;
  };
  const row=a=>html`<tr><td>${a.name}</td>${balCell(a)}<td class="num">${avail(a)}</td>
    <td>${contribCell(a)}</td>
    <td class="num">${perYear(a)}</td>
    ${hsaLimitCell(a)}
    ${endPlain(a,p)}${btns(a)}</tr>`;
  const note=html`
  <p class="muted small">${T('Pay with the HSA card by choosing the HSA under Paid with when you log spending. Those purchases lower the HSA’s available balance and aren’t counted against your spending money. When you type a new balance from your HSA provider, purchases logged before then count as already in it. The yearly limit covers your money and your employer’s together.')}</p>`;
  const head=[th('Name'),thNum('Balance'),thNum('Available now'),th('Contributions'),thNum('Per year'),thNum('This year vs limit'),thEnd(p),th('')];
  return section('Health savings (HSA)',head,list.map(row),note);
}
/** @param {Account[]} list */
function propSection(list){
  const row=a=>html`<tr><td>${a.name}</td>${balCell(a)}${btns(a)}</tr>`;
  return section('Vehicles and property',[th('Name'),thNum('Value'),th('')],list.map(row));
}
/** a card statement's pay date, which can move @param {Account} a */
function cardPayOn(a){
  if(!a.duedate||!+a.stmt)return'—';
  const key=`out:c-${a.id}:${a.duedate}`,moved=state.plan.payOn?.[key],v=moved||addDays(a.duedate,-(+a.lead||0));
  return html`<input class="mid" type="date" value="${v}" data-act="payon" data-key="${key}" aria-label="${
    T('Pay date for {name}',{name:a.name})}"><div class="since ${
    v>a.duedate?'neg':''}">${T(v>a.duedate?'after the due date':moved?'moved':'default')}</div>`;
}
/** @param {Account[]} list @param {Ends} p */
function cardSection(list,p){
  const limit=a=>{const L=+a.limit||0,B=+a.bal||0;return html`<td class="num">${L?f0(L):'—'}</td><td class="num">${L?Math.round(B/L*100)+'%':'—'}</td>`};
  const stmt=a=>html`<input class="mini" type="number" step="any" min="0" value="${+a.stmt||''}" placeholder="0" data-act="stmt" data-id="${
    a.id}" aria-label="${
    T('Statement balance of {name}',{name:a.name})}">`;
  const due=a=>html`${a.duedate?wdl(a.duedate):'—'}<div class="since">${+a.dueDay?T('every {d}',{d:ord(+a.dueDay),n:+a.dueDay}):T('set a due day')}</div>`;
  const typ=a=>html`<input class="mini" type="number" step="any" min="0" value="${+a.typ||''}" placeholder="${T('auto')}" data-act="typ" data-id="${
    a.id}" aria-label="${
    T('Typical monthly payment of {name}',{name:a.name})}">`;
  const newStmt=a=>html`<td class="act"><button class="btn sm" data-act="nextstmt" data-id="${a.id}">${T('New statement')}</button></td>`;
  const row=a=>html`<tr><td>${a.name}</td>${balCell(a)}${limit(a)}<td class="num">${stmt(a)}</td><td>${due(a)}</td><td>${cardPayOn(a)}</td><td class="num">${
    typ(a)}</td><td>${acctName(a.payfrom)}</td>${endCell(a,p)}${newStmt(a)}${btns(a)}</tr>`;
  const note=html`<p class="muted small">${
    T('Due dates follow each card’s fixed due day. The pay date defaults to the due date, or earlier if you set a usual lead time, and you can move any single payment. The statement is scheduled on its pay date. Later months use your typical payment, or an estimate from bills and logged spending on the card when that’s blank.')}</p>`;
  const head=[th('Name'),thNum('Owed now'),thNum('Limit'),thNum('Used'),thNum('Statement'),th('Due'),th('Pay on'),thNum('Typical monthly'),th('Pays from'),
    thEnd(p),th(''),th('')];
  return section('Credit cards',head,list.map(row),note);
}
/** @param {Account[]} list @param {Ends} p */
function loanSection(list,p){
  const row=a=>html`<tr><td>${a.name}${a.note?html`<div class="muted small">${a.note}</div>`:''}</td>${balCell(a)}<td class="num">${
    +a.apr?(+a.apr)+'%':'—'}</td><td class="num">${+a.min?f2(+a.min):'—'}</td><td>${payoff(a)}</td>${endCell(a,p)}${btns(a)}</tr>`;
  return section('Loans',[th('Name'),thNum('Owed'),html`<th class="num">APR</th>`,thNum('Payment'),th('Payoff'),thEnd(p),th('')],list.map(row));
}
/** The Accounts tab: net worth, then each kind of account */
export function vAccounts(){
  const p=project(),A=state.plan.accounts,{a:AS,d:DB}=assetsDebts();
  const of=(fn,...types)=>{const l=A.filter(a=>types.includes(a.type));return l.length?fn(l,p):''};
  return html`<div class="row" style="margin-top:16px"><button class="btn pri" data-act="add" data-kind="accounts">${
    T('Add account')}</button><button class="btn" data-act="xfer">${
    T('Transfer between accounts')}</button><span class="muted small">${T('Editing a balance records a net worth snapshot for the month.')}</span></div>
  <div class="eq"><div class="t"><small>${T('Assets')}</small><b>${f0(AS)}</b></div><span class="op">−</span><div class="t"><small>${T('Debts')}</small><b>${
    f0(DB)}</b></div><span class="op">=</span><div class="t free"><small>${T('Net worth')}</small><b class="${AS-DB<0?'neg':''}">${f0(AS-DB)}</b></div></div>
  ${of(cashSection,'checking','savings','cash')}
  ${of(investSection,'investment')}
  ${of(retireSection,'retirement')}
  ${A.some(isHSA)?hsaSection(A.filter(isHSA),p):''}
  ${of(propSection,'property')}
  ${of(cardSection,'credit')}
  ${of(loanSection,'loan')}`;
}
