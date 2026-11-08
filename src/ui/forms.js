import {FREQS,TYPES} from '../core/constants.js';
import {addDays,monthKeyOf} from '../core/dates.js';
import {CURRENCIES,NUMFMTS,f0,f2,r2} from '../core/format.js';
import {LANG_NAMES,T,cn,dl,tOpts,wdl} from '../core/i18n.js';
import {uid} from '../core/util.js';
import {savePlan,saveTx} from '../data/storage.js';
import {acct,acctName,isDebt,snapNW} from '../model/accounts.js';
import {HOLIDAYS} from '../model/holidays.js';
import {isHSA} from '../model/hsa.js';
import {ISSUE_DAYS,startDay,nextDue} from '../model/schedule.js';
import {addTx,catFor,catList,learn,tagList} from '../model/spending.js';
import {XFROM,XTO,moveMoney,xAvail} from '../model/transfers.js';
import {state} from '../state.js';
import {setLang} from './chrome.js';
import {ask,openForm} from './dialog.js';
import {render} from './render.js';
import {toast} from './toast.js';
/** [id, name] choices of every account, after "none" */
export const acctOpts=()=>[['',T('— none —')],...state.plan.accounts.map(a=>[a.id,a.name])];
/** [id, name] choices of accounts of these types, after a "none" choice @param {string[]} types */
const acctsOf=(types,none=T('— none —'))=>[['',none],...state.plan.accounts.filter(a=>types.includes(a.type)).map(a=>[a.id,a.name])];
/** accounts you can pay with */
export const spendOpts=()=>acctsOf(['checking','savings','cash','credit','hsa']);
const debtOpts=()=>[['',T('— none —')],...state.plan.accounts.filter(isDebt).map(a=>[a.id,a.name])];
const freqF=dateLabel=>[
  {k:'freq',l:'How often',t:'select',opts:tOpts(FREQS)},
  {k:'date',l:dateLabel,t:'date',req:1,help:'Any date on the schedule. It sets the day of the month, or the weekday for weekly and every-2-weeks.'},
  {k:'day2',l:'Second day of the month',t:'number',show:o=>o.freq==='semi',ph:'15'}
];
/** what an income estimate means */
export const CONF={floor:'Floor (I expect at least this)',avg:'Average (a typical payout)',target:'Target (what I’m aiming for)'};
const assetOpts=()=>[['',T('— none —')],...state.plan.accounts.filter(a=>!isDebt(a)&&!['retirement','hsa','property'].includes(a.type)).map(a=>[a.id,a.name])];
const noInt=['credit','loan','investment','retirement','hsa','property'];
const CONTRIB=o=>o.type==='retirement'||o.type==='hsa';
/** The plan's lists (income, bills, accounts, goals): each one's name, new item and form fields */
export const KINDS={
  income:{label:'income source',def:()=>({freq:'monthly',date:startDay(),conf:'avg'}),fields:()=>[
    {k:'name',l:'Source',req:1,ph:'Paycheck'},
    {k:'variable',l:'The amount varies (commission, bonus, tips)',t:'checkbox'},
    {k:'amt',l:'Amount per deposit (your estimate if it varies)',t:'number',req:1},
    {k:'conf',l:'What this estimate means',t:'select',opts:tOpts(Object.entries(CONF)),show:o=>o.variable},
    {k:'basis',l:'Basis or notes (optional)',ph:'Average of my last 4 quarters',show:o=>o.variable},
    ...freqF('First or next deposit date'),
    {k:'acct',l:'Deposit into',t:'select',opts:assetOpts()}]},
  bills:{label:'bill',def:()=>({freq:'monthly',date:startDay(),cat:state.plan.cats[0]?.name||'Other'}),fields:()=>[
    {k:'name',l:'Bill',req:1,ph:'Rent'},
    {k:'variable',l:'The amount varies (utilities, usage-based)',t:'checkbox'},
    {k:'amt',l:'Amount (your estimate if it varies)',t:'number',req:1},
    {k:'basis',l:'Notes (optional)',ph:'Average of the last 6 bills',show:o=>o.variable},
    {k:'issue',l:'Usually issued this many days before it’s due',t:'number',show:o=>o.variable,ph:String(ISSUE_DAYS),help:'Once each bill should be out, the Overview asks for the amount due. You can also enter it anytime on the Bills tab.'},
    ...freqF('First or next due date'),
    {k:'end',l:'Last payment date (optional)',t:'date',show:o=>o.freq!=='once',help:'For loans that end, like a car payment.'},
    {k:'acct',l:'Pay from',t:'select',opts:acctOpts(),help:'Pick a card if the bill is charged to it. It then shows up in that card’s next payment.'},
    {k:'to',l:'Pays down a loan (optional)',t:'select',opts:debtOpts(),help:'Each payment lowers that balance by the principal part.'},
    {k:'cat',l:'Category',t:'select',opts:state.plan.cats.map(c=>[c.name,cn(c.name)])},
    {k:'auto',l:'Autopay is on',t:'checkbox'},
    {k:'planned',l:'Planned (what-if): keep out of totals until I include planned bills',t:'checkbox'}]},
  accounts:{label:'account',def:()=>({type:'checking',divFreq:'quarterly',divMode:'cash',cfreq:'biweekly',cover:'self'}),fields:()=>[
    {k:'name',l:'Account name',req:1,ph:'Checking'},{k:'type',l:'Type',t:'select',opts:tOpts(TYPES)},
    {k:'bal',l:'Current balance (value for investments and property, amount owed for cards and loans)',t:'number',req:1},
    {k:'cash',l:'Buying power (cash sitting in the account)',t:'number',show:o=>o.type==='investment'},
    {k:'divAmt',l:'Expected dividend per payment',t:'number',show:o=>o.type==='investment',help:'Optional. An estimate is fine; enter the real amount when it pays.'},
    {k:'divFreq',l:'How often dividends pay',t:'select',show:o=>o.type==='investment'&&o.divAmt>0,
      opts:tOpts([['monthly','Monthly'],['quarterly','Every 3 months'],['semiannual','Every 6 months'],['yearly','Yearly']])},
    {k:'divDate',l:'Next dividend date',t:'date',req:1,show:o=>o.type==='investment'&&o.divAmt>0},
    {k:'divMode',l:'When a dividend pays',t:'select',show:o=>o.type==='investment'&&o.divAmt>0,
      opts:tOpts([['cash','Goes to buying power (cash)'],['reinvest','Auto-reinvested']])},
    {k:'contrib',l:'Your contribution per payment',t:'number',show:o=>CONTRIB(o),help:'Payroll deductions come out before your paycheck reaches the bank, so they are not counted as spending.'},
    {k:'match',l:'Employer match or contribution per payment',t:'number',show:o=>CONTRIB(o)},
    {k:'cfreq',l:'How often contributions are made',t:'select',opts:tOpts(FREQS),show:o=>CONTRIB(o)&&(o.contrib>0||o.match>0)},
    {k:'cdate',l:'Next contribution date',t:'date',req:1,show:o=>CONTRIB(o)&&(o.contrib>0||o.match>0)},
    {k:'cday2',l:'Second day of the month',t:'number',show:o=>CONTRIB(o)&&(o.contrib>0||o.match>0)&&o.cfreq==='semi',ph:'15'},
    {k:'cfrom',l:'Your contribution is paid from',t:'select',show:o=>CONTRIB(o)&&o.contrib>0,
      opts:acctsOf(['checking','savings','cash'],T('Payroll deduction (not from a bank account)'))},
    {k:'ret',l:'Expected annual return % (optional)',t:'number',show:o=>CONTRIB(o),help:'Only used for the projected balance.'},
    {k:'cover',l:'HSA coverage',t:'select',opts:tOpts([['self','Just me (self-only)'],['family','Family']]),show:o=>o.type==='hsa',help:'Sets the yearly IRS contribution limit. You and your employer share it.'},
    {k:'age55',l:'I’m 55 or older (adds the catch-up amount to the limit)',t:'checkbox',show:o=>o.type==='hsa'},
    {k:'ytd',l:'Contributed so far this year, you and employer (optional)',t:'number',show:o=>o.type==='hsa',help:'Used to check this year’s total against the limit.'},
    {k:'apy',l:'Interest rate (APY %)',t:'number',show:o=>!noInt.includes(o.type)},
    {k:'intday',l:'Day interest is credited',t:'number',show:o=>!noInt.includes(o.type)&&o.apy>0,ph:'Blank means the last day of the month'},
    {k:'limit',l:'Credit limit (optional)',t:'number',show:o=>o.type==='credit'},
    {k:'dueDay',l:'Due day of the month (fixed)',t:'number',req:o=>o.type==='credit',show:o=>o.type==='credit',ph:'14',help:'Set it once. Change it only if the card issuer moves your due date.'},
    {k:'stmt',l:'Current statement balance',t:'number',show:o=>o.type==='credit',help:'The statement due on the next due day. Use 0 if it is already paid. When the next one posts, use New statement on the Accounts tab.'},
    {k:'typ',l:'Typical monthly payment (optional)',t:'number',show:o=>o.type==='credit',help:'Used for months after that due date. Blank means it is estimated from bills and logged spending charged to this card.'},
    {k:'payfrom',l:'Pay the statement from',t:'select',opts:assetOpts(),show:o=>o.type==='credit'},
    {k:'apr',l:'Interest rate (APR %)',t:'number',show:o=>o.type==='loan'||o.type==='credit',help:'For cards, only matters if you carry a balance.'},
    {k:'min',l:'Monthly payment (minimum for cards)',t:'number',show:o=>o.type==='loan'||o.type==='credit'},
    {k:'lead',l:'Usually pay this many days before the due date',t:'number',show:o=>o.type==='loan'||o.type==='credit',ph:'0',help:'Sets the default pay date. You can move any single payment to another day.'},
    {k:'note',l:'Note (optional)'}]},
  goals:{label:'goal',def:()=>({kind:'short',saved:0}),fields:()=>[
    {k:'name',l:'Goal',req:1,ph:'Vacation fund'},
    {k:'kind',l:'Horizon',t:'select',opts:tOpts([['short','Short term'],['long','Long term']])},
    {k:'target',l:'Target amount',t:'number',req:1},{k:'saved',l:'Saved so far',t:'number'},
    {k:'date',l:'Target date (optional)',t:'date'},{k:'acct',l:'Kept in account (optional)',t:'select',opts:acctOpts()}]}
};
/** Adds or edits an item of a plan list @param {string} kind 'income', 'bills', 'accounts' or 'goals' @param {string} [id] */
export function edit(kind,id){
  const K=KINDS[kind],list=state.plan[kind],cur=id?list.find(x=>x.id===id):null;
  openForm(T(id?'Edit {what}':'Add {what}',{what:T(K.label)}),K.fields(),cur||K.def(),o=>{
    const was=cur?{bal:+cur.bal||0,ytd:+cur.ytd||0}:null;
    if(cur)Object.assign(cur,o);else list.push({id:uid(),...o});
    if(kind==='accounts'){
      const a=cur||list[list.length-1];
      /* an HSA balance date only moves when the balance does, so card purchases logged since stay counted */
      if(!isHSA(a)||!was||was.bal!==(+a.bal||0)){a.upd=state.TODAY;a.updAt=Date.now()}
      if(isHSA(a)&&(!was||was.ytd!==(+a.ytd||0)))a.ytdOn=state.TODAY;
      syncDue(a);snapNW();
    }
    savePlan();render();
  });
}
function syncDue(a){
  if(a.type!=='credit'||!+a.dueDay)return;
  a.dueDay=Math.min(31,Math.max(1,Math.round(+a.dueDay)));
  if(!a.duedate||a.duedate!==nextDue(a,a.duedate.slice(0,8)+'01'))a.duedate=nextDue(a,a.duedate&&a.duedate>=state.TODAY?a.duedate.slice(0,8)+'01':startDay());
}
/** Enters a card's new statement @param {string} id */
export function nextStmt(id){
  const a=acct(id);if(!a||!+a.dueDay)return;
  const nd=nextDue(a,addDays(a.duedate&&a.duedate>=startDay()?a.duedate:addDays(startDay(),-1),1));
  /** @type {Field[]} */
  const fields=[{k:'stmt',l:T('Statement balance, due {date}',{date:wdl(nd)}),t:'number',req:1},{k:'bal',l:'Owed now (optional)',t:'number',ph:String(+a.bal||0)}];
  openForm(T('New statement for {name}',{name:a.name}),fields,{},o=>{
    a.stmt=Math.max(0,r2(o.stmt));a.duedate=nd;if(o.bal)a.bal=r2(o.bal);a.upd=state.TODAY;
    snapNW();savePlan();render();
    toast(T('{name}: {amt} due {date}',{name:a.name,amt:f2(a.stmt),date:dl(nd)}));
  });
}
/** The transfer form, filled in from a tip when there is one @param {{from?:string,to?:string,amt?:number}} [pre] */
export function transfer(pre={}){
  const src=state.plan.accounts.filter(a=>XFROM.includes(a.type)),dst=state.plan.accounts.filter(a=>XTO.includes(a.type));
  if(!src.length||dst.length<2){toast(T('Add at least two accounts to move money between them.'));return}
  const to=acct(pre.to)&&XTO.includes(acct(pre.to).type)?pre.to:'';
  const from=acct(pre.from)&&XFROM.includes(acct(pre.from).type)?pre.from:(src.find(a=>a.id!==to)||src[0]).id;
  openForm('Transfer between accounts',[
    {k:'from',l:'From',t:'select',opts:src.map(a=>[a.id,`${a.name} · ${f0(xAvail(a))}`])},
    {k:'to',l:'To',t:'select',opts:dst.map(a=>[a.id,isDebt(a)?`${a.name} · ${T('owed {amt}',{amt:f0(+a.bal||0)})}`:`${a.name} · ${f0(xAvail(a))}`])},
    {k:'amt',l:'Amount',t:'number',req:1,help:'Both balances change now. A payment to a card or loan lowers what you owe.'}],
    {from,to:to||(dst.find(a=>a.id!==from)||dst[0]).id,amt:pre.amt||''},
    o=>{
      const undo=moveMoney(o.from,o.to,o.amt);if(!undo)return;
      snapNW();savePlan();render();
      toast(T('Moved {amt} from {from} to {to}',{amt:f2(o.amt),from:acctName(o.from),to:acctName(o.to)}),()=>{undo();snapNW();savePlan();render()});
    },
    o=>o.from===o.to?T('Pick two different accounts.'):!(o.amt>0)?T('Enter an amount above zero.'):'');
}
/** Deletes an item of a plan list, after asking @param {string} kind @param {string} id */
export function del(kind,id){
  const it=state.plan[kind].find(x=>x.id===id);if(!it)return;
  ask(T('Delete “{name}”?',{name:it.name}),T('Delete'),()=>{state.plan[kind]=state.plan[kind].filter(x=>x.id!==id);savePlan();render()});
}
/** @returns {Field[]} */
const txFields=()=>[
  {k:'date',l:'Date',t:'date',req:1},{k:'desc',l:'Merchant or description',req:1},
  {k:'kind',l:'Type',t:'select',opts:tOpts([['out','Money out'],['in','Money in']])},
  {k:'amt',l:'Amount',t:'number',req:1},
  {k:'cat',l:'Category',t:'select',opts:catList().map(c=>[c,cn(c)])},
  {k:'acct',l:'Account',t:'select',opts:acctOpts()},
  {k:'tag',l:'Tag (optional)',list:tagList(),help:'A label that cuts across categories, like alcohol or work.'}];
/** Adds a transaction, or edits one of the month shown @param {string} [id] */
export function editTx(id){
  const m=monthKeyOf(state.view),old=id?state.tx[m].items.find(t=>t.id===id):null;
  const v=old?{...old,kind:old.amt>0?'in':'out',amt:Math.abs(old.amt)}:{date:state.TODAY.slice(0,7)===m?state.TODAY:m+'-01',kind:'out',cat:'Uncategorized'};
  openForm(old?'Edit transaction':'Add transaction',txFields(),v,async o=>{
    const t={id:old?.id||uid(),date:o.date,desc:o.desc,amt:o.kind==='in'?Math.abs(o.amt):-Math.abs(o.amt),cat:o.cat,acct:o.acct,tag:o.tag,at:old?.at};
    if(old){state.tx[m].items=state.tx[m].items.filter(x=>x.id!==old.id);saveTx(m)}
    await addTx(t);learn(t);render();
  });
}
/** Edits the category rules */
export function editRules(){
  openForm('Category rules',[
    {k:'rules',l:'Rules',t:'textarea',help:'One per line: keyword = Category. Matching ignores case and the first match wins. Merchants you have logged before use their last category first. Use “Bill payment” for bills already tracked on the Bills tab, so they are not counted twice.'},
    {k:'reapply',l:'Also re-categorize uncategorized transactions in this month',t:'checkbox'}],
    {rules:state.plan.rules,reapply:true},o=>{
      state.plan.rules=o.rules;savePlan();
      if(o.reapply){
        const m=monthKeyOf(state.view);
        state.tx[m].items.forEach(t=>{if(t.cat==='Uncategorized'||(t.cat==='Income'&&t.amt>0))t.cat=catFor(t.desc,t.amt)});
        saveTx(m);
      }
      render();
    });
}
/* Settings: the language is this device's; currency and number format belong to the plan */
export function editSettings(){
  openForm('Settings',[
    {k:'lang',l:'Language',t:'select',opts:LANG_NAMES},
    {k:'currency',l:'Currency',t:'select',opts:CURRENCIES.map(([c,n])=>[c,`${c} — ${T(n)}`]),help:'Amounts aren’t converted: pick the currency your accounts and bills are in.'},
    {k:'numfmt',l:'Number format',t:'select',opts:tOpts(NUMFMTS)},
    {k:'holidays',l:'Bank holidays',t:'select',opts:tOpts(HOLIDAYS),help:'Used to count business days when the app tells you to move money before a payment.'}],
    {lang:state.LANG,currency:state.plan.currency||'USD',numfmt:state.plan.numfmt||'',holidays:state.plan.holidays||''},o=>{
      const money=o.currency!==(state.plan.currency||'USD')||o.numfmt!==(state.plan.numfmt||'');
      if(o.lang!==state.LANG)setLang(o.lang);
      if(money||o.holidays!==(state.plan.holidays||'')){state.plan.currency=o.currency;state.plan.numfmt=o.numfmt;state.plan.holidays=o.holidays;savePlan()}
      render();
      if(money)toast(T('Amounts now show as {amt}',{amt:f2(1234.5)}));
    });
}
/** Adds money to a goal (or takes it out) @param {string} id */
export function fundGoal(id){
  const g=state.plan.goals.find(x=>x.id===id);
  openForm(T('Add to “{name}”',{name:g.name}),[{k:'amt',l:'Amount to add (use a negative number to withdraw)',t:'number',req:1}],{},o=>{g.saved=(+g.saved||0)+o.amt;savePlan();render()});
}
