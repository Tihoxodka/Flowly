import {monthIndex} from '../core/dates.js';
import {T,TN,mon} from '../core/i18n.js';
import {isDebt} from './accounts.js';
import {state} from '../state.js';
/** When a debt is paid off at its current payment, in words @param {Account} a */
export function payoff(a){
  const B=+a.bal||0,P=+a.min||0,r=(+a.apr||0)/1200;
  if(B<=0)return T('Paid off');if(P<=0)return T('Add a payment');
  let n;if(r===0)n=B/P;else{if(P<=B*r)return T('Payment ≤ interest');n=-Math.log(1-r*B/P)/Math.log(1+r)}
  n=Math.ceil(n);const i=Math.max(state.now.getFullYear()*12+state.now.getMonth(),loanStart(a)-1)+n;
  return T('{payments}, done {month} {y}',{payments:`${n} ${TN(n,'payment','payments')}`,month:mon(i%12),y:Math.floor(i/12)});
}
const loanStart=a=>{const b=state.plan.bills.find(b=>b.to===a.id);return b?monthIndex(b.date):state.now.getFullYear()*12+state.now.getMonth()+1};

/**
 * Pays down the debts that cost interest, month by month: minimums first, then the extra to one debt at a time.
 * @param {number} extra paid on top of the minimums each month
 * @param {string} strat 'avalanche' (highest rate first) or 'snowball' (smallest balance first)
 * @param {boolean} roll a paid-off debt's payment rolls to the next one
 * @returns {Payoff|null} null with no such debts
 */
export function sim(extra,strat,roll){
  const cm=state.now.getFullYear()*12+state.now.getMonth()+1;
  const ds=state.plan.accounts.filter(a=>isDebt(a)&&+a.bal>0&&+a.min>0&&(a.type==='loan'||+a.apr>0))
    .map(a=>({id:a.id,name:a.name,bal:+a.bal,apr:+a.apr||0,min:+a.min,start:a.type==='loan'?Math.max(cm,loanStart(a)):cm}));
  if(!ds.length)return null;
  const base=Math.min(...ds.map(d=>d.start)),done=/** @type {Record<string,number>} */({});let interest=0,n=0,freed=0;
  while(ds.some(d=>d.bal>0.005)&&n<600){
    const m=base+n;n++;let pool=extra+(roll?freed:0);
    ds.forEach(d=>{
      if(d.bal<=0.005||m<d.start)return;
      const i=d.bal*d.apr/1200;d.bal+=i;interest+=i;
      const p=Math.min(d.bal,d.min);d.bal-=p;pool+=roll?d.min-p:0;
    });
    const act=ds.filter(d=>d.bal>0.005&&m>=d.start).sort(strat==='snowball'?(a,b)=>a.bal-b.bal:(a,b)=>b.apr-a.apr||a.bal-b.bal);
    for(const d of act){if(pool<=0)break;const p=Math.min(pool,d.bal);d.bal-=p;pool-=p}
    ds.forEach(d=>{if(d.bal<=0.005&&done[d.id]==null){done[d.id]=m;freed+=d.min}});
  }
  return{done,interest,last:Math.max(...Object.values(done))};
}
