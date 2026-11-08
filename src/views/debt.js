import {addDays} from '../core/dates.js';
import {f0,f2} from '../core/format.js';
import {html} from '../core/html.js';
import {T,TN,dl,mon,ord} from '../core/i18n.js';
import {sim} from '../model/debt.js';
import {state} from '../state.js';
import {card,pill} from './shared.js';

/** "Jun 2028" for a month index @param {number} i */
const monthLabel=i=>`${mon(i%12)} ${Math.floor(i/12)}`;
const owedOf=list=>list.reduce((s,a)=>s+(+a.bal||0),0);

/** Total owed, by kind, and card utilization @param {Account[]} cards @param {Account[]} loans */
function debtCards(cards,loans){
  const lc=cards.filter(a=>+a.limit>0),tl=lc.reduce((s,a)=>s+(+a.limit),0),to=owedOf(lc),util=tl?Math.round(to/tl*100):0;
  const utilCard=tl?html`<div class="card"><small>${T('Card utilization')}</small><b class="${util>30?'neg':''}">${util}%</b><small>${
    T('{amt} available of {limit}',{amt:f0(tl-to),limit:f0(tl)})}</small></div>`:'';
  return html`<div class="cards">${card(T('Total owed'),f0(owedOf([...cards,...loans])))}${card(T('Loans'),f0(owedOf(loans)))}${
    card(T('Cards'),f0(owedOf(cards)))}${utilCard}</div>`;
}
/** Extra each month and the strategy @param {number} extra @param {string} st */
function planInputs(extra,st){
  const opt=(v,label)=>html`<option value="${v}"${st===v?' selected':''}>${T(label)}</option>`;
  return html`<div class="row"><label for="dx" class="muted">${
    T('Extra each month')}</label><input id="dx" class="mini" type="number" min="0" step="25" value="${
    extra||''}" placeholder="0" data-act="extra"><label for="ds" class="muted">${T('Strategy')}</label><select id="ds" style="width:auto" data-act="strategy">${
    opt('avalanche','Avalanche: highest rate first')}${opt('snowball','Snowball: smallest balance first')}</select></div>`;
}
/** When each debt is paid off, with minimums only and with the plan @param {Payoff} p with the plan @param {Payoff|null} b minimums only */
function payoffTable(p,b){
  const row=a=>html`<tr><td>${a.name}</td><td class="num">${f2(+a.bal)}</td><td class="num">${(+a.apr||0)}%</td><td class="num">${f2(+a.min)}</td><td>${
    b&&b.done[a.id]!=null?monthLabel(b.done[a.id]):'—'}</td><td><b>${monthLabel(p.done[a.id])}</b></td></tr>`;
  return html`<div class="scroll" style="margin-top:12px"><table><thead><tr><th>${T('Debt')}</th><th class="num">${
    T('Owed')}</th><th class="num">APR</th><th class="num">${
    T('Payment')}</th><th>${T('Minimums only')}</th><th>${T('With your plan')}</th></tr></thead><tbody>${
    state.plan.accounts.filter(a=>p.done[a.id]!=null).map(row)}</tbody></table></div>`;
}
/** The payoff planner's result @param {number} extra @param {Payoff|null} p @param {Payoff|null} b */
function payoffResult(extra,p,b){
  if(!p)return html`<div class="empty">${T('No interest-bearing debt with a monthly payment. Add an APR and payment to a loan or card to plan a payoff.')}</div>`;
  const sooner=extra&&b?html`<small>${T('{months} sooner than minimums only',{months:`${b.last-p.last} ${TN(b.last-p.last,'month','months')}`})}</small>`:'';
  const saved=extra&&b?html`<small>${T('{amt} saved',{amt:f0(b.interest-p.interest)})}</small>`:'';
  return html`<div class="cards">${card(T('Debt-free'),monthLabel(p.last),sooner)}${card(T('Interest you’ll pay'),f0(p.interest),saved)}</div>
  ${payoffTable(p,b)}
  <p class="muted small">${T('Extra money goes to one debt at a time; when a debt is paid off, its payment rolls to the next. Cards you pay in full each month aren’t included, since they cost no interest.')}</p>`;
}
/** @param {Account} a */
function cardRow(a){
  const L=+a.limit||0,u=L?(+a.bal||0)/L*100:0;
  const used=L?html`<div class="bar${u>30?' over':''}" title="${Math.round(u)}%"><i style="width:${
    Math.min(100,u)}%"></i></div><span class="small muted">${Math.round(u)}%</span>`:'—';
  let paying=html`—`;
  if(a.duedate&&+a.stmt){const v=state.plan.payOn?.[`out:c-${a.id}:${a.duedate}`]||addDays(a.duedate,-(+a.lead||0));paying=html`<span class="${
    v>a.duedate?'neg':''}">${dl(v)}</span>`}
  return html`<tr><td>${a.name}${+a.apr>0?pill(`${a.apr}% APR`):''}</td><td class="num">${f2(+a.bal||0)}</td><td class="num">${L?f0(L):'—'}</td><td>${
    used}</td><td class="num">${
    +a.stmt?f2(+a.stmt):'—'}</td><td>${a.duedate?dl(a.duedate):'—'}<div class="since">${
      +a.dueDay?T('every {d}',{d:ord(+a.dueDay),n:+a.dueDay}):''}</div></td><td>${paying}</td></tr>`;
}
/** @param {Account[]} cards */
function cardsSection(cards){
  if(!cards.length)return'';
  return html`<div class="sec"><h2>${T('Cards')}</h2><div class="scroll"><table><thead><tr><th>${T('Card')}</th><th class="num">${
    T('Owed')}</th><th class="num">${
    T('Limit')}</th><th>${T('Used')}</th><th class="num">${T('Statement')}</th><th>${T('Due')}</th><th>${T('Paying')}</th></tr></thead><tbody>${
    cards.map(cardRow)}</tbody></table></div><p class="muted small">${T('Keeping each card under 30% of its limit helps your credit score.')}</p></div>`;
}
/** The Debt tab */
export function vDebt(){
  const cards=state.plan.accounts.filter(a=>a.type==='credit'),loans=state.plan.accounts.filter(a=>a.type==='loan');
  const extra=+state.plan.extra||0,st=state.plan.strategy||'avalanche',b=sim(0,st,false),p=sim(extra,st,true);
  return html`${debtCards(cards,loans)}
  <div class="sec"><h2>${T('Payoff planner')}</h2>
  ${planInputs(extra,st)}
  ${payoffResult(extra,p,b)}</div>
  ${cardsSection(cards)}`;
}
