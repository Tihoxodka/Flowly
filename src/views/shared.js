import {monthKeyOf} from '../core/dates.js';
import {f0,f2} from '../core/format.js';
import {html,raw,TH} from '../core/html.js';
import {T,cap,cn,dfmt,dl,wdl} from '../core/i18n.js';
import {dict,pad} from '../core/util.js';
import {saveFile} from '../data/storage.js';
import {acctName} from '../model/accounts.js';
import {holCal} from '../model/holidays.js';
import {kickoffDay,build} from '../model/schedule.js';
import {isBudgetOut,logged} from '../model/spending.js';
import {srcFor} from '../model/transfers.js';
import {state} from '../state.js';
import {toast} from '../ui/toast.js';

/** @param {string} kind plan list: 'bills', 'income', 'accounts' or 'goals' @param {string} id */
export const editBtn=(kind,id)=>html`<button class="btn sm" data-act="edit" data-kind="${kind}" data-id="${id}">${T('Edit')}</button>`;
/** @param {string} kind @param {string} id */
export const delBtn=(kind,id)=>html`<button class="btn sm ghost danger" data-act="del" data-kind="${kind}" data-id="${id}">${T('Delete')}</button>`;
/** a small label after a name @param {unknown} text */
export const pill=text=>html`<span class="pill">${text}</span>`;
/** a table that scrolls sideways on a phone @param {unknown} head the header cells @param {unknown} rows */
export const table=(head,rows)=>html`<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
/** a number with its label, in a .cards row @param {unknown} label @param {unknown} value @param {unknown} [extra] */
export const card=(label,value,extra='')=>html`<div class="card"><small>${label}</small><b>${value}</b>${extra}</div>`;

/** chips on one day of the calendar @param {string} iso @param {Ev[]} list @param {Tip[]} tips @param {Ev[]} dueMarks */
function calChips(iso,list,tips,dueMarks){
  const tipChip=t=>html`<span class="chip note" title="${T('Move {amt} into {acct}',{amt:f2(t.amount),acct:acctName(t.acct)})}">${
    T('Transfer {amt}',{amt:f0(t.amount)})}</span>`;
  const dueChip=e=>html`<span class="chip due" title="${T('{name} due {amt}, paying {date}',{name:acctName(e.payAcct),amt:f2(e.amt),date:dl(e.date)})}">${
    T('{name} due',{name:acctName(e.payAcct)})}</span>`;
  const evChip=e=>html`<span class="chip ${e.t}${state.plan.done[e.key]?' done':''}" title="${e.name} ${f2(e.amt)}">${e.name} ${
    e.variable&&!e.hasActual?'~':''}${f0(e.amt)}</span>`;
  return[tips.filter(t=>t.deadline===iso).map(tipChip),dueMarks.filter(e=>e.due===iso).map(dueChip),list.filter(e=>e.date===iso).map(evChip)];
}
/** The month calendar on the Overview @param {Ev[]} list @param {Tip[]} tips */
export function cal(list,tips){
  const {y,m}=state.view,k=kickoffDay();
  const dueMarks=build(y,m).filter(e=>e.pay&&e.due!==e.date&&(!k||e.due>=k));
  /* weeks start on Sunday in English and on Monday in Russian */
  const ws=state.LANG==='ru'?1:0,first=(new Date(y,m,1).getDay()-ws+7)%7,dim=new Date(y,m+1,0).getDate();
  const head=Array.from({length:7},(_,i)=>html`<div class="dow">${cap(dfmt({weekday:'short'}).format(new Date(2000,0,2+ws+i)))}</div>`);
  const days=Array.from({length:dim},(_,i)=>{
    const d=i+1,iso=`${monthKeyOf(state.view)}-${pad(d)}`,cls=iso===state.TODAY?'today':iso===k&&!state.plan.kickDone?'kday':'';
    return html`<div class="${cls}"><span class="day">${d}</span>${calChips(iso,list,tips,dueMarks)}</div>`;
  });
  return html`<div class="cal">${head}${raw('<div class="blank"></div>'.repeat(first))}${days}</div>`;
}

const GRIP=raw('<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><g fill="currentColor"><circle cx="2.5" cy="3" r="1.5"/>'
  +'<circle cx="7.5" cy="3" r="1.5"/><circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/><circle cx="2.5" cy="13" r="1.5"/>'
  +'<circle cx="7.5" cy="13" r="1.5"/></g></svg>');
/** the drag handle of a budget row @param {string} name */
const grip=name=>html`<button class="grip" type="button" data-cat="${name}" aria-label="${
  T('Move {name}. Drag, or use the up and down arrow keys',{name:cn(name)})}" title="${T('Drag to reorder')}">${GRIP}</button>`;
/** the budget input of a row @param {string} name @param {number} bud */
const budgetInput=(name,bud)=>html`<input class="mini" type="number" min="0" step="10" value="${bud||''}" placeholder="0" data-act="budget" data-cat="${
  name}" aria-label="${T('Budget for {name}',{name:cn(name)})}">`;
/** @param {string} name */
const catDel=name=>html`<button class="btn sm ghost" data-act="catdel" data-cat="${name}" aria-label="${T('Remove {name}',{name:cn(name)})}">×</button>`;
/** Budgets by category: bills and logged spending against each budget @param {Ev[]} list this month's events */
export function budget(list){
  const L=logged(monthKeyOf(state.view)),bills=dict();
  (list||[]).filter(isBudgetOut).forEach(e=>{const c=e.cat||'Other';bills[c]=(bills[c]||0)+e.amt});
  const known=state.plan.cats.map(c=>c.name),extra=[...new Set([...Object.keys(L.by),...Object.keys(bills)])].filter(k=>!known.includes(k));
  let tb=0,tbi=0,ts=0;
  const row=(name,bud,editable)=>{
    const s=L.by[name]||0,b=bills[name]||0,used=s+b;tb+=bud;tbi+=b;ts+=s;
    const pct=bud>0?Math.min(100,Math.max(0,used/bud*100)):0,over=bud>0&&used>bud+0.5;
    if(!editable&&!s&&!b)return'';
    return html`<tr${editable?html` data-cat="${name}"`:''}><td class="catn">${editable?grip(name):raw('<span class="grip-sp"></span>')}${
      cn(name)}</td><td class="num">${
      editable?budgetInput(name,bud):'—'}</td><td class="num">${b?f0(b):''}</td><td class="num">${s?f0(s):''}</td><td class="num ${over?'neg':''}">${
      bud>0?f0(bud-used):''}</td><td><div class="bar${over?' over':''}"><i style="width:${pct}%"></i></div></td><td class="act">${
        editable?catDel(name):''}</td></tr>`;
  };
  const rows=[state.plan.cats.map(c=>row(c.name,+c.budget||0,true)),extra.map(n=>row(n,0,false))];
  const head=html`<th>${T('Category')}</th><th class="num">${T('Monthly budget')}</th><th class="num">${T('Bills')}</th><th class="num">${
    T('Logged')}</th><th class="num">${T('Left')}</th><th></th><th></th>`;
  const total=html`<tr class="tot"><td>${T('Total')}</td><td class="num">${f0(tb)}</td><td class="num">${f0(tbi)}</td><td class="num">${
    f0(ts)}</td><td class="num">${tb>0?f0(tb-tbi-ts):''}</td><td></td><td></td></tr>`;
  return table(head,[rows,total]);
}
/** one "move money before a payment" warning @param {Tip} t @param {number} i its place in the list */
function tipHtml(t,i){
  const s=srcFor(t),v={amt:html`<b>${f0(t.amount)}</b>`,acct:html`<b>${acctName(t.acct)}</b>`,item:t.name,date:dl(t.date),by:html`<b>${wdl(t.deadline)}</b>`};
  const say=t.late?TH('Move {amt} into {acct} <b>now</b>, since {item} on {date} is less than 3 business days away.',v)
    :TH('Move {amt} into {acct} by {by}, 3 business days before {item} on {date}.',v);
  const btns=html`<button class="btn sm" data-act="xfer" data-i="${i}">${T('Record transfer')}</button><button class="btn sm" data-act="ics" data-i="${
    i}">${T('Add reminder to calendar')}</button>`;
  return html`<div class="tip"><span>${say}${s?' '+T('You could take it from {acct}.',{acct:s.name}):''}</span><div class="row" style="gap:6px;margin:0">${
    btns}</div></div>`;
}
/** Transfers needed to keep accounts from going below zero @param {Tip[]} tips */
export function tipsHtml(tips){
  if(!tips.length)return'';
  const note=holCal()==='se'?'Business days skip weekends and Swedish bank holidays. After you move the money, record it with Record transfer and this note clears.'
    :'Business days skip weekends and Federal Reserve holidays. After you move the money, record it with Record transfer and this note clears.';
  return html`<div class="alert${tips.some(t=>t.late)?' late':''}"><b>${tips.length===1?T('Transfer needed'):T('Transfers needed')}</b>${
    tips.map(tipHtml)}<p class="muted" style="font-size:13px;margin:8px 0 0">${T(note)}</p></div>`;
}
/** Saves calendar reminders (.ics) for transfer tips @param {Tip[]} sel */
export async function tipIcs(sel){
  const e2=t=>String(t).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
  const ev=sel.map(t=>{
    const d=t.deadline.replace(/-/g,''),s=srcFor(t);
    const what=T('{item} on {date} would overdraw {acct} by {amt}.',{item:t.name,date:dl(t.date),acct:acctName(t.acct),amt:f2(t.amount)});
    return['BEGIN:VEVENT',`UID:${(t.acct+'-'+t.key).replace(/[^\w-]/g,'-')}@budgeter`,`DTSTAMP:${stamp}`,`DTSTART:${d}T090000`,`DTEND:${d}T091500`,
      `SUMMARY:${e2(T('Transfer {amt} into {acct}',{amt:f2(t.amount),acct:acctName(t.acct)}))}`,
      `DESCRIPTION:${e2(what+(s?' '+T('Suggested source: {acct}.',{acct:s.name}):''))}`,
      'BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${e2(T('Transfer reminder'))}`,'TRIGGER:PT0S','END:VALARM','END:VEVENT'].join('\r\n');
  });
  const text=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Budgeter//EN','CALSCALE:GREGORIAN',...ev,'END:VCALENDAR'].join('\r\n')+'\r\n';
  try{
    await saveFile(sel.length===1?'transfer-reminder.ics':'transfer-reminders.ics',text,'text/calendar');
    toast(T('Reminder file ready. Open it to add it to your calendar.'));
  }catch(e){toast(T('Reminder was not saved'))}
}
/** the pay date of a card or loan payment, which can move @param {Ev} e */
export const payCell=e=>html`<input class="mid" type="date" value="${e.date}" data-act="payon" data-key="${e.key}" aria-label="${
  T('Pay date for {name}',{name:e.name})}"><div class="since ${e.date>e.due?'neg':''}">${
  e.date>e.due?T('after the due date, due {date}',{date:dl(e.due)}):T('due {date}',{date:dl(e.due)})}</div>`;
/** an amount; a variable one is an input for the actual amount @param {Ev} e */
export function amtCell(e){
  const sign=e.t==='out'?'−':'+';
  if(!e.variable)return html`${sign}${f2(e.amt)}`;
  const label=e.bill?'Amount due for {name}':'Actual amount for {name}';
  const note=e.hasActual?(e.bill?(state.plan.done[e.key]?'paid':'billed'):'actual'):e.guess?'estimate from charges':'estimate';
  return html`${sign} <input class="mini" type="number" step="any" min="0" value="${e.hasActual?e.amt:''}" placeholder="${Math.round(e.est)}" data-act="${
    e.bill?'due':'actual'}" data-key="${e.key}" aria-label="${T(label,{name:e.name})}"><div class="muted" style="font-size:12px">${T(note)}</div>`;
}
