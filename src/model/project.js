import {NOSPEND} from '../core/constants.js';
import {monthIndex,monthKeyOf} from '../core/dates.js';
import {r2} from '../core/format.js';
import {acct,isDebt,rate} from './accounts.js';
import {bizBefore} from './holidays.js';
import {afterBal,hsaNow,isHSA} from './hsa.js';
import {kickoffDay,startDay,evs} from './schedule.js';
import {state} from '../state.js';
/* how an event moves one account's balance */
function applyEv(bal,hold,e){
  const a=acct(e.acct);
  if(a&&e.dividend&&e.mode==='reinvest')hold[a.id]+=e.amt;
  else if(a){bal[a.id]+=(e.t==='out'?-1:1)*e.amt*(isDebt(a)?-1:1);e.after=bal[a.id];e.debt=isDebt(a)}
  if(e.card&&bal[e.card]!=null)bal[e.card]-=e.amt;
  const t=acct(e.to);
  if(t&&bal[t.id]!=null){if(isDebt(t)){const int=bal[t.id]*(+t.apr||0)/1200;bal[t.id]=Math.max(0,bal[t.id]-(e.amt-int))}else bal[t.id]+=e.amt}
}
/** Projects account balances through the month shown: each event's balance after, end-of-month balances, and the transfers needed to stay above zero @returns {{list:Ev[],end:Record<string,number>|null,endH?:Record<string,number>,tips:Tip[]}} */
export function projectNow(){
  const vi=state.view.y*12+state.view.m,s0=startDay(),ti=monthIndex(s0),cur=evs(state.view.y,state.view.m);
  if(vi<ti)return{list:cur,end:null,tips:[]};
  const bal={},hold={},inj={},tips=[];let end=null,endH=null;
  state.plan.accounts.forEach(a=>{const inv=a.type==='investment';bal[a.id]=inv?(+a.cash||0):isHSA(a)?hsaNow(a):isCash(a)?cashNow(a):(+a.bal||0);if(inv)hold[a.id]=+a.bal||0});
  for(let i=ti;i<=vi+1;i++){
    const list=i===vi?cur:evs(Math.floor(i/12),i%12);
    list.forEach(e=>{
      if(e.date<s0||state.plan.done[e.key])return;
      const a=acct(e.acct);
      if(e.interest&&!e.hasActual&&a)e.amt=e.est=r2(bal[a.id]*rate(a));
      applyEv(bal,hold,e);
      if(a&&!isDebt(a)&&e.t==='out'){
        const b=bal[a.id]+(inj[a.id]||0);
        if(b<0){const need=Math.ceil(-b-1e-9),d0=bizBefore(e.date,3);inj[a.id]=(inj[a.id]||0)+need;e.short=need;
          tips.push({acct:a.id,amount:need,date:e.date,name:e.name,key:e.key,late:d0<state.TODAY,deadline:d0<state.TODAY?state.TODAY:d0})}
      }
    });
    {const dim=new Date(Math.floor(i/12),i%12+1,0).getDate(),fr=i===ti?Math.max(0,(dim-(+s0.slice(8,10)))/dim):1;
      state.plan.accounts.forEach(a=>{if((a.type==='retirement'||isHSA(a))&&+a.ret>0)bal[a.id]*=Math.pow(1+a.ret/100,fr/12)})}
    if(i===vi){end={...bal};endH={...hold}}
  }
  const m=monthKeyOf(state.view);
  return{list:cur,end,endH,tips:tips.filter(t=>t.date.slice(0,7)===m||t.deadline.slice(0,7)===m)};
}
/* balance change for one account from the scheduled items in the months from..to that pass keep(e) */
function schedDelta(a,from,to,keep){
  const items=[];let d=0,dc=0;
  for(let i=monthIndex(from);i<=monthIndex(to);i++)evs(Math.floor(i/12),i%12,true).forEach(e=>{
    if(!keep(e))return;
    let x=0,c=0;
    if(e.acct===a.id){if(e.dividend){if(e.mode==='reinvest')x=e.amt;else c=e.amt}else x=(e.t==='out'?-1:1)*e.amt*(isDebt(a)?-1:1)}
    if(e.card===a.id)x-=e.amt;
    if(e.to===a.id)x+=isDebt(a)?-(e.amt-(+a.bal||0)*(+a.apr||0)/1200):e.amt;
    if(x||c){items.push({e,x:x||c});d+=x;dc+=c}
  });
  return{items,d:r2(d),dc:r2(dc)};
}
/* balance change for one account from scheduled items after its last update and before kickoff */
export function sinceKick(a){
  const k=kickoffDay(),from=a.upd||'';if(!k||!from||from>=k)return{items:[],d:0,dc:0};
  return schedDelta(a,from,k,e=>e.date>from&&e.date<k&&!state.plan.done[e.key]);
}
/** Checking, savings or cash @param {Account} a */
export const isCash=a=>['checking','savings','cash'].includes(a?.type);
/** What a cash account holds now: its recorded balance, plus the scheduled items checked off and the spending logged since.
 * Logged income, bill payments and transfers are left out: scheduled items and transfers already move the balance. @param {Account} a */
export function cashNow(a){
  const from=a.upd||'';if(!from)return +a.bal||0;
  let s=schedDelta(a,from,state.TODAY,e=>e.date>from&&!!state.plan.done[e.key]).d;
  Object.values(state.tx).forEach(m=>m.items.forEach(t=>{if(afterBal(a,t)&&!NOSPEND.includes(t.cat))s+=t.amt}));
  return r2((+a.bal||0)+s);
}
