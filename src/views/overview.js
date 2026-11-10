import {NOSPEND} from '../core/constants.js';
import {addDays,monthIndex,monthKeyOf} from '../core/dates.js';
import {f0,f2} from '../core/format.js';
import {html,TH} from '../core/html.js';
import {T,TN,dl,monl,wdl} from '../core/i18n.js';
import {sum} from '../core/util.js';
import {acct,acctName,isDebt} from '../model/accounts.js';
import {hsaPaid,isHSA} from '../model/hsa.js';
import {kickoffDay,startDay,billsToEnter,goalNeed,nextDue,occ} from '../model/schedule.js';
import {cashNow,isCash} from '../model/project.js';
import {isBudgetOut,logged} from '../model/spending.js';
import {state} from '../state.js';
import {project} from '../ui/render.js';
import {kickBanner} from './kickoff.js';
import {qaHtml} from './quicklog.js';
import {amtCell,budget,cal,card,payCell,pill,tipsHtml} from './shared.js';

/** A plan with nothing in it yet */
const emptyPlan=()=>html`<div class="sec"><h2>${T('Nothing here yet')}</h2><p class="muted">${
  T('Your saved plan loads here. If this stays empty, restore a backup below or add your accounts, income and bills.')}</p><div class="row"><button class="btn" data-act="settings">${
  T('Language and currency')}</button><button class="btn pri" data-tab="accounts">${T('Add accounts')}</button><button class="btn" data-tab="income">${
  T('Add income')}</button><button class="btn" data-tab="bills">${T('Add bills')}</button></div></div>`;
/** A month before the kickoff: only logged spending @param {string} k the kickoff day */
function beforeKickoff(k){
  const {y,m}=state.view,L=logged(monthKeyOf(state.view));
  return html`${kickBanner()}<div class="sec"><h2>${T('{month} is before your kickoff',{month:monl(m)})}</h2><p class="muted">${
    T('Only logged spending shows for months before {date}. Budgets and projections start at the kickoff.',{date:dl(k)})}</p>
    <div class="cards">${card(T('Logged spending'),f0(L.total))}${card(T('Transactions'),L.items.length)}${
      card(T('Per day'),f2(L.total/new Date(y,m+1,0).getDate()))}</div></div>
    <div class="sec"><h2>${T('Log spending')}</h2>${qaHtml()}</div><div class="sec"><h2>${T('Spending by category')}</h2>${budget([])}</div>`;
}
/** @typedef {{inc:number,out:number,goals:number,free:number,left:number,logged:number,daysLeft:number}} Totals */
/** Income − bills − goals = spending money, and what's left of it @param {Totals} t */
const equation=t=>html`<div class="eq">
    <div class="t"><small>${T('Income')}</small><b>${f0(t.inc)}</b></div><span class="op">−</span>
    <div class="t"><small>${T('Bills')}</small><b>${f0(t.out)}</b></div><span class="op">−</span>
    <div class="t"><small>${T('Goals')}</small><b>${f0(t.goals)}</b></div><span class="op">=</span>
    <div class="t free"><small>${T('Spending money')}</small><b class="${t.free<0?'neg':'pos'}">${f0(t.free)}</b></div></div>
  <div class="left"><span class="muted">${T('Logged so far')}</span><b>${f0(t.logged)}</b><span class="muted">${T('Left to spend')}</span><b class="${
    t.left<0?'neg':'pos'}">${
    f0(t.left)}</b>${t.daysLeft>0?html`<span class="muted">${TH('About {amt} a day for {days}',{amt:html`<b style="font-size:17px">${
    f0(Math.max(0,t.left)/t.daysLeft)}</b>`,days:`${t.daysLeft} ${TN(t.daysLeft,'day','days')}`})}</span>`:''}</div>`;
/** The switches and notes under the equation @param {Ev[]} list */
function notes(list){
  const {y,m}=state.view,mk=monthKeyOf(state.view);
  const planned=state.plan.showPlanned?0:state.plan.bills.filter(b=>b.planned).reduce((s,b)=>s+occ(b,y,m).length*(+b.amt||0),0);
  const cnt=e=>!e.passive||state.plan.interestIn,intr=sum(list.filter(e=>e.passive));
  const hsaOut=-(state.tx[mk]?.items||[]).filter(t=>hsaPaid(t)&&!NOSPEND.includes(t.cat)).reduce((s,t)=>s+t.amt,0);
  const hsaBills=sum(list.filter(e=>e.t==='out'&&!e.card&&isHSA(acct(e.acct))));
  const check=(act,on,label)=>html`<label class="chk"><input type="checkbox" data-act="${act}"${on?' checked':''}> ${T(label)}</label>`;
  /* each note shows when its amount isn't zero */
  const say=(amt,text,show=amt)=>show?html`<span>${T(text,{amt:f0(amt)})}</span>`:'';
  return html`<div class="note">${list.some(e=>e.passive)?check('intin',state.plan.interestIn,'Count interest and dividends as income'):''}${
    state.plan.bills.some(b=>b.planned)?check('planned',state.plan.showPlanned,'Include planned bills'):''}
    ${say(sum(list.filter(e=>e.card)),'Card payments this month total {amt}. They pay off earlier charges, so they’re on the calendar but not counted above.')}${
    say(planned,'Planned bills would add {amt}.')}${
    say(state.plan.interestIn?0:intr,'{amt} of interest and dividends expected, not counted.')}${
    say(sum(list.filter(e=>e.t==='in'&&e.variable&&!e.hasActual&&cnt(e))),'{amt} of income is an estimate. Enter the real amount below once it lands.')}${
    say(sum(list.filter(e=>e.contrib&&!e.hsa)),'{amt} goes into retirement this month, including employer money.')}${
    say(sum(list.filter(e=>e.contrib&&e.hsa)),'{amt} goes into your HSA this month, including employer money.')}${
    say(hsaOut+hsaBills,'{amt} paid from your HSA this month isn’t counted above, since it comes out of the HSA.',hsaOut||hsaBills)}</div>`;
}
/** What each checking, savings and cash account holds now, and their total */
function cashCards(){
  const A=state.plan.accounts.filter(isCash);if(!A.length)return'';
  const now=A.map(cashNow),total=now.reduce((s,v)=>s+v,0);
  const amt=n=>html`<span class="${n<0?'neg':''}">${f2(n)}</span>`;
  const since=(a,n)=>a.upd?html`<span class="since">${n===(+a.bal||0)?T('as of {date}',{date:dl(a.upd)}):
    T('{amt} on {date}',{amt:f2(+a.bal||0),date:dl(a.upd)})}</span>`:'';
  return html`<div class="sec"><h2>${T('In your accounts now')}</h2><div class="cards" style="margin:0">${A.map((a,i)=>card(a.name,amt(now[i]),since(a,now[i])))}${
    A.length>1?card(T('Total'),amt(total)):''}</div><p class="muted small">${
    T('The balance you entered, plus the items you checked off below and the spending you logged since then.')}</p></div>`;
}
/** Cards whose due date passed: time to enter the new statement */
function staleCards(){
  const stale=state.plan.accounts.filter(a=>a.type==='credit'&&+a.stmt>0&&a.duedate&&a.duedate<state.TODAY);
  if(!stale.length)return'';
  const tip=a=>html`<div class="tip"><span>${T('{name} was due {date}. Enter the next statement, due {next}.',{name:a.name,date:dl(a.duedate),
    next:dl(nextDue(a,addDays(a.duedate,1)))})}</span><button class="btn sm" data-act="nextstmt" data-id="${a.id}">${T('New statement')}</button></div>`;
  return html`<div class="alert"><b>${T('New statement?')}</b>${stale.map(tip)}</div>`;
}
/** Variable bills that should be out by now: enter the amount due */
function billsDue(){
  const bt=billsToEnter();
  if(!bt.length)return'';
  const tip=x=>{
    const late=x.due<state.TODAY;
    const text=T(late?'{name} should be out by now, and was due {date}. Enter the amount due.':'{name} should be out by now, due {date}. Enter the amount due.',
      {name:x.b.name,date:late?dl(x.due):wdl(x.due)});
    const input=html`<input class="mini" type="number" step="any" min="0" inputmode="decimal" placeholder="~${Math.round(+x.b.amt||0)}" data-act="due" data-key="${
      x.key}" aria-label="${T('Amount due for {name}, due {date}',{name:x.b.name,date:dl(x.due)})}">`;
    return html`<div class="tip"><span>${text}</span><span class="row" style="margin:0;flex-wrap:nowrap">${input}<button class="btn sm" data-act="duesave" data-key="${
      x.key}">${T('Save')}</button></span></div>`;
  };
  return html`<div class="alert"><b>${bt.length===1?T('A bill to enter'):T('Bills to enter')}</b>${
    bt.map(tip)}<p class="muted" style="font-size:13px;margin:8px 0 0">${
    T('The amount replaces the estimate for that month. Check the bill off below once it’s paid.')}</p></div>`;
}
/** the labels after an item's name @param {Ev} e */
const evPills=e=>[e.planned?pill(T('planned')):'',e.card?pill(T('card payment')):'',e.dividend?pill(T(e.mode==='reinvest'?'reinvested':'to buying power')):'',
  e.contrib?pill(e.hsa?'HSA':T('retirement')):'',!e.contrib&&e.t==='out'&&isHSA(acct(e.acct))?pill('HSA'):'',acct(e.to)&&isDebt(acct(e.to))?pill(T('loan')):''];
/** @param {Ev} e */
function evRow(e){
  const done=state.plan.done[e.key];
  const after=e.after==null?'':e.debt?T('owe {amt}',{amt:f0(e.after)}):f0(e.after);
  return html`<tr class="${done?'done':e.date<state.TODAY?'past':''}${e.short?' short':''}"><td><input type="checkbox" data-act="done" data-key="${e.key}"${
    done?' checked':''} aria-label="${T('Mark {name} done',{name:e.name})}"></td><td>${e.pay?payCell(e):dl(e.date)}</td><td>${e.name}${evPills(e)}</td><td>${
    acctName(e.acct)}</td><td class="num ${e.t==='in'?'pos':''}">${amtCell(e)}</td><td class="num ${e.after<0&&!e.debt?'neg':''}">${after}</td></tr>`;
}
/** Money in and out this month, with each account's balance after it @param {Ev[]} list */
function moneyInOut(list){
  if(!list.length)return html`<div class="empty">${T('Nothing scheduled this month.')}</div>`;
  return html`<div class="scroll"><table><thead><tr><th>${T('Done')}</th><th>${T('Date')}</th><th>${T('Item')}</th><th>${T('Account')}</th><th class="num">${
    T('Amount')}</th><th class="num">${T('Balance after')}</th></tr></thead><tbody>${list.map(evRow)}</tbody></table></div>
  <p class="muted" style="font-size:13px">${
    T('Balances start from your account balances and count unchecked items from {date} on. Check an item once it shows in the balance.',
    {date:dl(startDay())})}</p>`;
}
/** The Overview tab */
export function vOverview(){
  const P=state.plan;
  if(!P.income.length&&!P.bills.length&&!P.accounts.length)return emptyPlan();
  const k=kickoffDay(),vi=state.view.y*12+state.view.m;
  if(k&&vi<monthIndex(k))return beforeKickoff(k);
  const {list,tips}=project(),mk=monthKeyOf(state.view),today=state.TODAY;
  const inc=sum(list.filter(e=>e.t==='in'&&(!e.passive||P.interestIn))),out=sum(list.filter(isBudgetOut));
  const goals=P.goals.reduce((s,g)=>s+goalNeed(g),0),free=inc-out-goals,L=logged(mk),left=free-L.total;
  /* days left to spend in: the rest of this month, all of a later one (from the kickoff day, if it's later) or none of an earlier one */
  const dim=new Date(state.view.y,state.view.m+1,0).getDate(),firstDay=k&&mk===k.slice(0,7)&&k>today?+k.slice(8,10):1;
  const daysLeft=mk===today.slice(0,7)?dim-state.now.getDate()+1:(mk>today.slice(0,7)?dim-firstDay+1:0);
  return html`${kickBanner()}${equation({inc,out,goals,free,left,logged:L.total,daysLeft})}
  ${notes(list)}
  ${cashCards()}
  ${staleCards()}
  ${billsDue()}
  ${tipsHtml(tips)}
  <div class="sec"><h2>${T('Log spending')}</h2>${qaHtml()}</div>
  <div class="sec">${cal(list,tips)}</div>
  <div class="sec"><h2>${T('Money in and out')}</h2>${moneyInOut(list)}</div>
  <div class="sec"><h2>${T('Spending vs budget')}</h2>${budget(list)}<div class="row" style="margin-top:10px"><button class="btn sm" data-act="catadd">${
    T('Add category')}</button><span class="muted" style="font-size:13px">${
    T('Bills count toward their category by due date. Logged spending leaves out transfers and anything marked Bill payment.')}</span></div></div>`;
}
