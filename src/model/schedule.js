import {NOSPEND} from '../core/constants.js';
import {addDays,monthIndex} from '../core/dates.js';
import {f2,r2} from '../core/format.js';
import {T,TN,dl,mon,ord} from '../core/i18n.js';
import {pad} from '../core/util.js';
import {savePlan} from '../data/storage.js';
import {acct,hasInt,isDebt,mInt} from './accounts.js';
import {isHSA} from './hsa.js';
import {state} from '../state.js';
import {toast} from '../ui/toast.js';
/** The kickoff day ('' before there is one): budgets and projections start there */
export const kickoffDay=()=>state.plan.kickoff||'';
/** The first day that counts: the kickoff day if it's still ahead, else today */
export const startDay=()=>kickoffDay()>state.TODAY?kickoffDay():state.TODAY;

/**
 * The dates an income, bill or other schedule falls on in one month, as 'YYYY-MM-DD', sorted.
 * @param {{date:string,freq:string,day2?:number,dom?:number,end?:string}} it date: the first date; dom: a fixed day of the month
 * @param {number} y @param {number} m month, 0-11
 */
export function occ(it,y,m){
  if(!it.date)return[];
  const [ay,am,ad0]=it.date.split('-').map(Number),ad=+it.dom||ad0;
  const dim=new Date(y,m+1,0).getDate(),i=y*12+m,ai=ay*12+am-1,f=it.freq,o=[];
  const k=d=>`${y}-${pad(m+1)}-${pad(d)}`,c=d=>Math.min(Math.max(1,d),dim);
  if(f==='weekly'||f==='biweekly'){
    const st=f==='weekly'?7:14,a=Date.UTC(ay,am-1,ad);
    for(let d=1;d<=dim;d++){const diff=(Date.UTC(y,m,d)-a)/864e5;if(diff>=0&&diff%st===0)o.push(k(d))}
  }else if(i>=ai){
    if(f==='once'){if(i===ai)o.push(k(ad))}
    else if(f==='monthly')o.push(k(c(ad)));
    else if(f==='semi'){o.push(k(c(ad)));o.push(k(c(+it.day2||15)))}
    else if(f==='quarterly'){if((i-ai)%3===0)o.push(k(c(ad)))}
    else if(f==='semiannual'){if((i-ai)%6===0)o.push(k(c(ad)))}
    else if(f==='yearly'){if((i-ai)%12===0)o.push(k(c(ad)))}
  }
  return [...new Set(o)].sort().filter(d=>d>=it.date&&(!it.end||d<=it.end));
}
const SCHED_TEXT={monthly:'Monthly on the {d}',semi:'Twice a month, the {d} and {d2}',biweekly:'Every 2 weeks from {date}',weekly:'Weekly from {date}',
  quarterly:'Every 3 months from {date}',semiannual:'Every 6 months from {date}',yearly:'Yearly on {date}',once:'Once on {date}, {y}'};
/** A schedule in words: "Monthly on the 25th, until Jun 2029" @param {{date:string,freq:string,day2?:number,end?:string}} i */
export function sched(i){
  const [y,m,d]=(i.date||'').split('-').map(Number);if(!d)return'';
  const d2=+i.day2||15,v={date:dl(i.date),y,d:ord(d),n:d,d2:ord(d2),n2:d2},s=SCHED_TEXT[i.freq];
  const starts=i.date>state.TODAY&&i.freq!=='once'?T('Starts {date}, {y}. ',v):'';
  const until=i.end?T(', until {month} {y}',{month:mon(+i.end.slice(5,7)-1),y:i.end.slice(0,4)}):'';
  return starts+(s?T(s,v):'')+until;
}
/** A credit card whose statement is paid from one of your accounts @param {Account} a */
export const cardPay=a=>a.type==='credit'&&!!a.payfrom;
/** A card's payment schedule in words @param {Account} a */
export function cardSched(a){
  if(!+a.dueDay)return T('Set the due day');
  return[T('Due the {d} every month',{d:ord(+a.dueDay),n:+a.dueDay}),
    +a.lead?T('usually paid {days} early',{days:`${+a.lead} ${TN(+a.lead,'day','days')}`}):'',
    +a.typ>0?T('about {amt} after this statement',{amt:f2(+a.typ)}):T('later months estimated from charges')].filter(Boolean).join(', ');
}
/* due dates are fixed by the account's due day; pay dates float */
/** A card's next due date on or after from ('' with no due day) @param {Account} a @param {string} from */
export function nextDue(a,from){
  const dd=+a.dueDay;if(!dd)return'';
  let y=+from.slice(0,4),m=+from.slice(5,7)-1;
  for(let i=0;i<3;i++){
    const dim=new Date(y,m+1,0).getDate(),iso=`${y}-${pad(m+1)}-${pad(Math.min(dd,dim))}`;if(iso>=from)return iso;
    m++;if(m>11){m=0;y++}
  }
  return'';
}
/** The card or loan a payment goes to, whose pay date can move @param {Ev} e */
const payAcct=e=>e.card?acct(e.card):(e.t==='out'&&!e.contrib&&acct(e.to)&&isDebt(acct(e.to))?acct(e.to):null);
/** The usual pay date: the due date less the account's lead days @param {Ev} e @param {Account} a */
const defPay=(e,a)=>addDays(e.due,-(+a.lead||0));
/** The dividend event of 'div-<account id>' @param {string} id */
export const divItem=id=>{const a=acct(id.slice(4));return a?{name:T('{name} dividend',{name:a.name}),amt:+a.divAmt||0}:null};
/** The interest event of 'int-<account id>' @param {string} id */
export const intItem=id=>{const a=acct(id.slice(4));return a?{name:T('{name} interest',{name:a.name}),amt:mInt(a)}:null};
/** A card's payment estimated from last month's bills and logged spending on it @param {Account} a @param {number} y @param {number} m */
function cardEst(a,y,m){
  const py=m?y:y-1,pm=m?m-1:11,pk=`${py}-${pad(pm+1)}`;
  let t=0;
  state.plan.bills.forEach(b=>{if(b.acct===a.id&&!b.planned)occ(b,py,pm).forEach(d=>t+=+(state.plan.actual?.[`out:${b.id}:${d}`]??b.amt)||0)});
  (state.tx[pk]?.items||[]).forEach(x=>{if(x.acct===a.id&&x.amt<0&&!NOSPEND.includes(x.cat))t-=x.amt});
  return r2(t);
}
/**
 * One event: an income, bill or other item on a date, with its actual amount if one was recorded.
 * @param {'in'|'out'|'save'} t @param {{id:string,name:string,amt?:number,variable?:boolean,acct?:string,cat?:string,to?:string}} it
 * @param {string} d the date @param {object} [x] more fields
 * @returns {Ev}
 */
function mkEv(t,it,d,x){
  const key=`${t}:${it.id}:${d}`,act=state.plan.actual||{},has=act[key]!=null;
  return{t,id:it.id,name:it.name,amt:has?+act[key]:(+it.amt||0),est:+it.amt||0,variable:!!it.variable,hasActual:has,
    date:d,acct:it.acct,cat:it.cat,to:it.to,key,...x};
}
/** Card statement payments: the current statement, then the typical payment or an estimate @param {number} y @param {number} m */
function cardPayments(y,m){
  const o=[],i=y*12+m;
  state.plan.accounts.forEach(a=>{
    if(!cardPay(a))return;
    const base={id:'c-'+a.id,name:T('{name} payment',{name:a.name}),acct:a.payfrom};
    if(!a.duedate||!+a.dueDay)return;
    const ai=monthIndex(a.duedate);
    if(i===ai&&+a.stmt>0)o.push(mkEv('out',{...base,amt:a.stmt},a.duedate,{card:a.id}));
    else if(i>ai){
      const amt=+a.typ>0?+a.typ:cardEst(a,y,m);
      const x={card:a.id,guess:!(+a.typ>0)};
      if(amt>0)occ({freq:'monthly',date:a.duedate,dom:+a.dueDay},y,m).forEach(d=>o.push(mkEv('out',{...base,amt,variable:true},d,x)));
    }
  });
  return o;
}
/** Interest on savings and dividends from investments @param {number} y @param {number} m */
function passiveIncome(y,m){
  const o=[];
  state.plan.accounts.forEach(a=>{
    if(!hasInt(a))return;
    const it={id:'int-'+a.id,name:T('{name} interest',{name:a.name}),amt:mInt(a),acct:a.id,variable:true};
    occ({freq:'monthly',date:'2000-01-'+pad(Math.min(31,+a.intday||31))},y,m).forEach(d=>o.push(mkEv('in',it,d,{interest:true,passive:true})));
  });
  state.plan.accounts.forEach(a=>{
    if(!(a.type==='investment'&&+a.divAmt>0&&a.divDate))return;
    const it={id:'div-'+a.id,name:T('{name} dividend',{name:a.name}),amt:a.divAmt,acct:a.id,variable:true};
    const x={dividend:true,passive:true,mode:a.divMode==='reinvest'?'reinvest':'cash'};
    occ({freq:a.divFreq||'quarterly',date:a.divDate},y,m).forEach(d=>o.push(mkEv('in',it,d,x)));
  });
  return o;
}
/** Contributions to retirement accounts and HSAs: yours (from an account or payroll) and your employer's @param {number} y @param {number} m */
function contributions(y,m){
  const o=[];
  state.plan.accounts.forEach(a=>{
    if(!['retirement','hsa'].includes(a.type)||!a.cdate||!(+a.contrib>0||+a.match>0))return;
    const hsa=isHSA(a),name=T('{name} contribution',{name:a.name});
    occ({freq:a.cfreq||'biweekly',date:a.cdate,day2:a.cday2},y,m).forEach(d=>{
      if(+a.contrib>0)o.push(a.cfrom?mkEv('out',{id:'k-'+a.id,name,amt:a.contrib,acct:a.cfrom,cat:'Savings'},d,{to:a.id,contrib:true,hsa})
        :mkEv('save',{id:'k-'+a.id,name,amt:a.contrib,acct:a.id},d,{contrib:true,hsa}));
      const er=T(hsa?'{name} employer contribution':'{name} employer match',{name:a.name});
      if(+a.match>0)o.push(mkEv('save',{id:'m-'+a.id,name:er,amt:a.match,acct:a.id},d,{contrib:true,hsa}));
    });
  });
  return o;
}
/**
 * Every event in one month by due date: income, bills, and from this month on card payments, interest, dividends and
 * contributions. Payments to a card or loan move to their pay date (e.pay, with e.due the due date).
 * @param {number} y @param {number} m month, 0-11 @returns {Ev[]}
 */
export function build(y,m){
  const o=[],ci=state.now.getFullYear()*12+state.now.getMonth(),i=y*12+m;
  state.plan.income.forEach(n=>occ(n,y,m).forEach(d=>o.push(mkEv('in',n,d))));
  state.plan.bills.forEach(b=>{if(b.planned&&!state.plan.showPlanned)return;occ(b,y,m).forEach(d=>o.push(mkEv('out',b,d,{planned:!!b.planned,bill:true})))});
  if(i>=ci)o.push(...cardPayments(y,m),...passiveIncome(y,m),...contributions(y,m));
  o.forEach(e=>{
    const a=payAcct(e);if(!a)return;
    e.pay=true;e.due=e.date;e.payAcct=a.id;
    const ov=state.plan.payOn?.[e.key];e.date=ov||defPay(e,a);e.moved=!!ov;
  });
  return o;
}
/**
 * The events dated in one month, money in first on each day. A payment due next month can be paid this month, so the
 * months around it are built too. Before the kickoff nothing counts, unless raw.
 * @param {number} y @param {number} m @param {boolean} [raw] include events before the kickoff
 */
export function evs(y,m,raw){
  const k=kickoffDay(),key=`${y}-${pad(m+1)}`,o=[];
  for(let j=-1;j<=1;j++){
    const i=y*12+m+j;
    build(Math.floor(i/12),((i%12)+12)%12).forEach(e=>{if(e.date.slice(0,7)===key&&(j===0||e.pay))o.push(e)});
  }
  return o.filter(e=>raw||!k||e.date>=k).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.t==='in'?-1:1);
}
/* variable bills: once a bill is issued (some days before it's due) ask for the amount due.
   An amount due is stored like an actual amount but doesn't mark the bill paid */
export const ISSUE_DAYS=21;
/** When a variable bill should be out: its issue days before the due date @param {Item} b @param {string} due */
export const issuedOn=(b,due)=>addDays(due,-(+b.issue>0?+b.issue:ISSUE_DAYS));
/** A bill's dates between from and to @param {Item} b @param {string} from @param {string} to */
function billOccs(b,from,to){
  const o=[];
  for(let i=monthIndex(from);i<=monthIndex(to);i++)occ(b,Math.floor(i/12),i%12).forEach(d=>{if(d>=from&&d<=to)o.push(d)});
  return o;
}
/** @param {Item} b @param {string} d */
export const billKey=(b,d)=>`out:${b.id}:${d}`;
/* bills that should be out by now (or went unpaid in the last two weeks) with no amount entered */
export function billsToEnter(){
  const k=kickoffDay(),out=[];
  state.plan.bills.forEach(b=>{
    if(!b.variable||(b.planned&&!state.plan.showPlanned))return;
    billOccs(b,addDays(state.TODAY,-14),addDays(state.TODAY,62)).forEach(d=>{
      const key=billKey(b,d);
      if((k&&d<k)||state.plan.done[key]||state.plan.actual?.[key]!=null||issuedOn(b,d)>state.TODAY)return;
      out.push({b,due:d,key});
    });
  });
  return out.sort((x,y)=>x.due<y.due?-1:1);
}
/* the next bill still to pay, for the Bills tab */
export const nextBill=b=>billOccs(b,addDays(state.TODAY,-14),addDays(state.TODAY,400)).find(d=>!state.plan.done[billKey(b,d)])||'';
/** Saves (or clears) the amount due of a variable bill; false if it isn't a number @param {string} k @param {string} v */
export function setDue(k,v){
  v=String(v??'').trim();
  if(v==='')delete state.plan.actual[k];
  else{const n=parseFloat(v);if(isNaN(n))return false;state.plan.actual[k]=r2(Math.abs(n))}
  savePlan();return true;
}
/** "Rent: $1,650 due Nov 19" after an amount due is entered @param {string} k the bill's event key */
export function dueToast(k){
  const [,id,d]=k.split(':'),b=state.plan.bills.find(x=>x.id===id),v=state.plan.actual?.[k];
  if(b&&v!=null)toast(T('{name}: {amt} due {date}',{name:b.name,amt:f2(v),date:dl(d)}));
}
/** What a goal needs each month to reach its target by its date @param {Goal} g */
export function goalNeed(g){
  const rem=Math.max(0,(+g.target||0)-(+g.saved||0));if(!g.date||rem<=0)return 0;
  return rem/Math.max(1,monthIndex(g.date)-(state.now.getFullYear()*12+state.now.getMonth()));
}
/** Moves (or resets) the pay date of one card or loan payment @param {string} key @param {string} v */
export function setPay(key,v){
  (state.plan.payOn=state.plan.payOn||{});
  if(v)state.plan.payOn[key]=v;else delete state.plan.payOn[key];
  savePlan();
}
