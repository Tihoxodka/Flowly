import {addDays,monthIndex} from '../core/dates.js';
import {f2,r2} from '../core/format.js';
import {html,raw} from '../core/html.js';
import {T,dl,wdl} from '../core/i18n.js';
import {$,$$} from '../core/util.js';
import {savePlan} from '../data/storage.js';
import {acct,acctName,snapNW} from '../model/accounts.js';
import {sinceKick} from '../model/project.js';
import {kickoffDay,startDay,evs,nextDue} from '../model/schedule.js';
import {state} from '../state.js';
import {render} from '../ui/render.js';
import {toast} from '../ui/toast.js';

/** The note on the Overview until the kickoff is done */
export function kickBanner(){
  if(state.plan.kickDone||!kickoffDay())return'';
  return html`<div class="kick"><div><h2 style="margin:0">${T('Kick off on {date}',{date:wdl(kickoffDay())})}</h2><p class="muted">${
    T('Confirm what each account holds at the start of that day. Your budget, projections and overdue checks start from there, so nothing before it skews the month.')
  }</p></div><button class="btn pri" data-act="kickoff">${T('Set starting point')}</button></div>`;
}
/** what changed an account's balance since its last update @param {{items:{e:Ev,x:number}[]}} s */
const sinceList=s=>s.items.length?s.items.map((x,i)=>html`${i?raw('<br>'):''}${x.e.name} ${x.x>0?'+':'−'}${f2(Math.abs(x.x))} (${dl(x.e.date)})`)
  :T('Nothing scheduled since');
/** the starting balance (and an investment's buying power) @param {Account} a @param {number} dc buying power change */
function startInputs(a,dc){
  const bal=html`<input class="mini" type="number" step="any" value="${+a.bal||0}" data-kb="${a.id}" aria-label="${
    T('Starting balance of {name}',{name:a.name})}">`;
  if(a.type!=='investment')return bal;
  return html`${bal}<div class="since" style="margin-top:4px">${T('buying power')}</div><input class="mini" type="number" step="any" value="${
    r2((+a.cash||0)+dc)}" data-kc="${a.id}" aria-label="${T('Buying power of {name}',{name:a.name})}">`;
}
/** a card's next statement, due day and pay date @param {Account} a @param {string} k the kickoff day */
function cardCells(a,k){
  const due=nextDue(a,k),key=`out:c-${a.id}:${due}`,def=due?addDays(due,-(+a.lead||0)):'';
  const stmt=html`<input class="mini" type="number" step="any" min="0" value="${a.duedate&&a.duedate>=k&&+a.stmt?+a.stmt:''}" placeholder="0" data-ks="${
    a.id}" aria-label="${T('Next statement balance of {name}',{name:a.name})}">`;
  const day=html`<input class="mini" style="width:70px" type="number" min="1" max="31" step="1" value="${+a.dueDay||''}" placeholder="${T('day')}" data-kdd="${
    a.id}" aria-label="${T('Due day of {name}',{name:a.name})}"><div class="since">${+a.dueDay?T('next due {date}',{date:dl(nextDue(a,k))}):''}</div>`;
  const pay=html`<input class="mid" type="date" value="${state.plan.payOn?.[key]||def}" data-kp="${a.id}" data-def="${def}" aria-label="${
    T('Pay date for {name}',{name:a.name})}">`;
  return html`<td class="num" data-l="${T('Next statement')}">${stmt}</td><td data-l="${T('Due day (fixed)')}">${day}</td><td data-l="${
    T('Pay on')}">${pay}</td>`;
}
/** @param {Account} a @param {string} k @param {boolean} cards */
function kickRow(a,k,cards){
  const s=sinceKick(a),est=r2((+a.bal||0)+s.d);
  const estimate=s.items.length?html`<button class="lnk" data-act="kest" data-id="${a.id}" data-v="${est}">${f2(est)}</button>`:'—';
  return html`<tr><td><b>${a.name}</b><div class="since">${sinceList(s)}</div></td>
    <td class="num" data-l="${T('Last recorded')}">${f2(+a.bal||0)}<div class="since">${a.upd?T('as of {date}',{date:dl(a.upd)}):''}</div></td>
    <td class="num" data-l="${T('Estimate now')}">${estimate}</td>
    <td class="num" data-l="${T('Starting balance')}">${startInputs(a,s.dc)}</td>
    ${cards?cardCells(a,k):''}<td></td></tr>`;
}
/** a group of accounts in the kickoff table @param {string} title @param {Account[]} list @param {string} k @param {boolean} [cards] */
const kickGroup=(title,list,k,cards=false)=>list.length?[html`<tr class="grp"><td colspan="${cards?7:5}">${
  title}</td></tr>`,list.map(a=>kickRow(a,k,cards))]:'';
/** @param {boolean} cards */
const kickHead=cards=>html`<thead><tr><th>${T('Account and what’s scheduled since the last update')}</th><th class="num">${
  T('Last recorded')}</th><th class="num">${
  T('Estimate now')}</th><th class="num">${T('Starting balance')}</th>${
  cards?html`<th class="num">${T('Next statement')}</th><th>${T('Due day')}</th><th>${T('Pay on')}</th>`:''}<th></th></tr></thead>`;
/** items dated on the kickoff day, to check off if the balances already include them @param {Ev[]} kd @param {string} k */
function kickDayItems(kd,k){
  if(!kd.length)return'';
  const row=e=>html`<tr><td style="width:40px"><input type="checkbox" data-act="kdone" data-key="${e.key}"${state.plan.done[e.key]?' checked':''} aria-label="${
    T('{name} already reflected',{name:e.name})}"></td><td>${e.name}</td><td>${acctName(e.acct)}</td><td class="num">${e.t==='out'?'−':'+'}${
      f2(e.amt)}</td></tr>`;
  return html`<h2 style="margin-top:22px">${T('Scheduled on {date}',{date:dl(k)})}</h2><p class="muted small">${
    T('These are in your first month’s budget. Check any that already came out of the balances above, so they aren’t subtracted twice.')
  }</p><div class="scroll"><table><tbody>${kd.map(row)}</tbody></table></div>`;
}
/** The kickoff page: the starting balance of every account on the day budgeting starts */
export function vKick(){
  const k=kickoffDay()||startDay(),kd=evs(monthIndex(k)/12|0,monthIndex(k)%12).filter(e=>e.date===k);
  const A=state.plan.accounts,of=types=>A.filter(a=>types.includes(a.type)),cards=of(['credit']);
  const cardTable=cards.length?html`<h2 style="margin-top:22px">${T('Credit cards')}</h2><p class="muted small">${
    T('Enter what you owe now, and the statement you’ll pay next with its due date. Use 0 for the statement if nothing is due.')
  }</p><div class="scroll"><table class="kt">${kickHead(true)}<tbody>${kickGroup(T('Cards'),cards,k,true)}</tbody></table></div>`:'';
  return html`<div class="sec"><h2>${T('Kickoff: set your starting point')}</h2>
  <p class="muted" style="max-width:70ch">${
    T('Starting mid-month mixed old and new money together. The kickoff draws a line: enter each balance as it stands at the start of the kickoff day, before anything dated that day posts. Everything earlier becomes history. Budgets, projections and overdue checks start from here.')}</p>
  <div class="row"><label for="kdate" class="muted">${T('Kickoff day')}</label><input id="kdate" type="date" class="mid" value="${
    k}" data-act="kdate"><button class="btn sm" data-act="kuse">${
    T('Use all estimates')}</button></div>
  <p class="muted small">${T('Estimates add what was scheduled between each account’s last update and the kickoff day. Anything off-schedule, like a down payment or a transfer, isn’t included, so type the real balance from your bank app when you can.')}</p>
  <div class="scroll"><table class="kt">${kickHead(false)}<tbody>${kickGroup(T('Cash accounts'),of(['checking','savings','cash']),k)}${
    kickGroup(T('Investments, retirement and HSA'),of(['investment','retirement','hsa','property']),k)}${
      kickGroup(T('Loans'),of(['loan']),k)}</tbody></table></div>
  ${cardTable}
  ${kickDayItems(kd,k)}
  <div class="row" style="margin-top:18px"><button class="btn pri" data-act="kgo">${
    T('Start budgeting from {date}',{date:dl(k)})}</button><button class="btn" data-tab="overview">${
    T('Not now')}</button></div></div>`;
}
/** Start budgeting from the kickoff day with the balances entered */
export function kickGo(){
  const k=$('#kdate').value;if(!k){toast(T('Pick a kickoff day'));return}
  const each=(attr,fn)=>$$(`[${attr}]`).forEach(fn);
  /* a card with a statement to pay needs a due day */
  const dueDayOf=id=>+$(`[data-kdd="${CSS.escape(id)}"]`).value;
  const miss=[...$$('[data-ks]')].filter(el=>parseFloat(el.value)>0&&!dueDayOf(el.dataset.ks)).map(el=>acctName(el.dataset.ks));
  if(miss.length){toast(T('Add a due day for {names}',{names:miss.join(', ')}));return}
  state.plan.kickoff=k;
  each('data-kb',el=>{const a=acct(el.dataset.kb);if(a&&el.value!==''){a.bal=r2(parseFloat(el.value)||0);a.upd=k;delete a.updAt}});
  each('data-kc',el=>{const a=acct(el.dataset.kc);if(a&&el.value!=='')a.cash=r2(parseFloat(el.value)||0)});
  each('data-ks',el=>{const a=acct(el.dataset.ks);if(a)a.stmt=Math.max(0,r2(parseFloat(el.value)||0))});
  each('data-kdd',el=>{
    const a=acct(el.dataset.kdd);if(!a)return;
    const d=Math.round(+el.value);if(d>=1&&d<=31){a.dueDay=d;a.duedate=nextDue(a,k)}
    const p=$(`[data-kp="${CSS.escape(a.id)}"]`),due=a.duedate,key=`out:c-${a.id}:${due}`,def=due?addDays(due,-(+a.lead||0)):'';
    /* a pay date someone changed is kept as a moved payment */
    if(!p||!due)return;
    if(p.value&&p.value!==p.dataset.def&&p.value!==def)state.plan.payOn=Object.assign(state.plan.payOn||{},{[key]:p.value});
    else if(state.plan.payOn)delete state.plan.payOn[key];
  });
  state.plan.kickDone=true;snapNW(k.slice(0,7),k);savePlan();
  state.view={y:+k.slice(0,4),m:+k.slice(5,7)-1};state.tab='overview';render();toast(T('Kickoff set for {date}',{date:dl(k)}));
}
