import {FREQS,NOSPEND,PER} from '../core/constants.js';
import {monthIndex} from '../core/dates.js';
import {CURRENCIES,f2} from '../core/format.js';
import {cn,dl,monl,wdl} from '../core/i18n.js';
import {dict,pad,sum} from '../core/util.js';
import {acct,acctName} from '../model/accounts.js';
import {isHSA} from '../model/hsa.js';
import {kickoffDay,goalNeed} from '../model/schedule.js';
import {isBudgetOut,logged} from '../model/spending.js';
import {state} from '../state.js';
import {project} from '../ui/render.js';
/* The app does the math and hands the AI a plain summary; the AI only explains it. The summary stays in English. */

/** "November 2026" from "2026-11" @param {string} m */
const lab=m=>`${monl(+m.slice(5)-1)} ${m.slice(0,4)}`;
/** a month's purchases and refunds (no bill payments, transfers or income) @param {string} m */
const spent=m=>(state.tx[m]?.items||[]).filter(t=>!NOSPEND.includes(t.cat));
/** a month's spending by category @param {string} m */
const byCat=m=>{const b=dict();spent(m).forEach(t=>b[t.cat]=(b[t.cat]||0)-t.amt);return b};
/** a month's spending by merchant: how many purchases and how much @param {string} m */
const byMerchant=m=>{const o=dict();spent(m).filter(t=>t.amt<0).forEach(t=>{const k=t.desc.trim();(o[k]=o[k]||{n:0,t:0}).n++;o[k].t-=t.amt});return o};
/* the same merchant is spelled differently across statements (store numbers, cities), so match on its first words */
const mkey=k=>k.toLowerCase().replace(/[^a-z& ]+/g,' ').split(/\s+/).filter(w=>w.length>1).slice(0,2).join(' ')||k.toLowerCase();

/** This month's plan: income, bills, goals and what's left @param {string} cur */
function planFacts(cur){
  const {list}=project(),inc=sum(list.filter(e=>e.t==='in'&&(!e.passive||state.plan.interestIn))),bo=sum(list.filter(isBudgetOut));
  const gl=state.plan.goals.reduce((x,g)=>x+goalNeed(g),0),L=logged(cur);
  return`\nTHIS MONTH'S PLAN\nIncome ${f2(inc)}. Bills ${f2(bo)}. Set aside for goals ${f2(gl)}. Spending money ${f2(inc-bo-gl)}. `
    +`Logged spending so far ${f2(L.total)}. Left to spend ${f2(inc-bo-gl-L.total)}.`;
}
/** This month by category against the average of the months before it @param {string[]} ms @param {string} cur */
function vsAverage(ms,cur){
  const prev=ms.slice(2,5).filter(m=>spent(m).length),now_=byCat(cur),cats=new Set([...Object.keys(now_),...prev.flatMap(m=>Object.keys(byCat(m)))]);
  if(!prev.length)return[];
  return[`\nTHIS MONTH VS THE ${prev.length}-MONTH AVERAGE BEFORE IT`,...[...cats].map(c=>{
    const a=prev.reduce((x,m)=>x+(byCat(m)[c]||0),0)/prev.length,v=now_[c]||0;
    return`${cn(c)}: ${f2(v)} this month, average ${f2(a)}, difference ${v-a>=0?'+':'−'}${f2(Math.abs(v-a))}`;
  })];
}
/** Each budget: bills and logged spending against it @param {string} cur */
function budgetFacts(cur){
  const L=logged(cur),bills=dict();project().list.filter(isBudgetOut).forEach(e=>bills[e.cat||'Other']=(bills[e.cat||'Other']||0)+e.amt);
  const bud=state.plan.cats.filter(c=>+c.budget>0);
  if(!bud.length)return[];
  return[`\nBUDGETS THIS MONTH`,...bud.map(c=>{
    const b=bills[c.name]||0,l=L.by[c.name]||0,u=l+b;
    return`${cn(c.name)}: budget ${f2(+c.budget)}, used ${f2(u)} (bills ${f2(b)}, logged ${f2(l)}), ${
      u>c.budget?'over by '+f2(u-c.budget):f2(c.budget-u)+' left'}`;
  })];
}
/** Merchants seen in 3 or more of the months: subscriptions or habits @param {string[]} ms */
function repeatMerchants(ms){
  const seen=dict();
  ms.forEach(m=>{
    const here=dict();
    Object.entries(byMerchant(m)).forEach(([k,v])=>{const x=mkey(k);(here[x]=here[x]||{name:k,t:0,n:0}).t+=v.t;here[x].n+=v.n});
    Object.entries(here).forEach(([x,v])=>{(seen[x]=seen[x]||{name:v.name,months:0,amts:[]}).months++;seen[x].amts.push(v.t/v.n)});
  });
  const rec=Object.values(seen).filter(x=>x.months>=3).sort((x,y)=>y.months-x.months);
  if(!rec.length)return[];
  return[`\nMERCHANTS CHARGED IN 3 OR MORE OF THE LAST 6 MONTHS (possible subscriptions or habits)`,
    ...rec.slice(0,15).map(x=>`${x.name}: ${x.months} months, typically ${f2([...x.amts].sort((p,q)=>p-q)[x.amts.length>>1])}`)];
}
/** @param {Item} b */
function billFact(b){
  const freq=(FREQS.find(f=>f[0]===b.freq)?.[1]||'').toLowerCase(),monthly=f2((+b.amt||0)*(PER[b.freq]||12)/12);
  return`${b.name}: ${b.variable?'about ':''}${f2(+b.amt||0)}, ${freq}, about ${monthly} a month, category ${cn(b.cat||'Other')}${
    isHSA(acct(b.acct))?', paid from the HSA':''}`;
}
/** @param {Tx} t */
const purchaseFact=t=>`${dl(t.date)} · ${t.desc} · ${cn(t.cat)} · ${t.amt<0?f2(-t.amt):'refund '+f2(t.amt)}${t.acct?' · '+acctName(t.acct):''}${
  t.tag?' · tag '+t.tag:''}`;
/** The facts the AI answers from: the month shown and the 5 before it */
export function spendingFacts(){
  const end=state.view.y*12+state.view.m,ms=[];for(let i=end-5;i<=end;i++)ms.push(`${Math.floor(i/12)}-${pad(i%12+1)}`);
  const cur=ms[5],out=[],code=state.plan.currency||'USD';
  out.push(`Today is ${wdl(state.TODAY)}, ${state.TODAY.slice(0,4)}. "This month" means ${lab(cur)}. All amounts are in ${
    CURRENCIES.find(c=>c[0]===code)?.[1]||state.plan.currency} (${code}).`);
  if(!(kickoffDay()&&end<monthIndex(kickoffDay())))out.push(planFacts(cur));
  out.push(`\nLOGGED SPENDING BY MONTH (purchases only; bills aren't in these)`);
  ms.forEach(m=>{
    const b=byCat(m),t=Object.values(b).reduce((x,v)=>x+v,0),n=spent(m).length;
    out.push(`${lab(m)}: ${f2(t)} across ${n} purchases${n?'. '+Object.entries(b).sort((x,y)=>y[1]-x[1]).map(([k,v])=>`${cn(k)} ${f2(v)}`).join(', '):''}`);
  });
  out.push(...vsAverage(ms,cur),...budgetFacts(cur));
  const top=Object.entries(byMerchant(cur)).sort((x,y)=>y[1].t-x[1].t).slice(0,10);
  if(top.length)out.push(`\nTOP MERCHANTS THIS MONTH`,...top.map(([k,v])=>`${k}: ${f2(v.t)} over ${v.n} purchase${v.n>1?'s':''}`));
  out.push(...repeatMerchants(ms));
  if(state.plan.bills.length)out.push(`\nSCHEDULED BILLS`,...state.plan.bills.filter(b=>!b.planned).map(billFact));
  const tags=dict();ms.forEach(m=>spent(m).forEach(t=>{if(t.tag)tags[t.tag]=(tags[t.tag]||0)-t.amt}));
  if(Object.keys(tags).length)out.push(`\nTAGGED SPENDING, LAST 6 MONTHS\n`+Object.entries(tags).map(([k,v])=>`${k}: ${f2(v)}`).join('\n'));
  const items=[...spent(cur)].sort((a,b)=>a.date<b.date?1:-1).slice(0,120);
  if(items.length)out.push(`\nTHIS MONTH'S PURCHASES, NEWEST FIRST`,...items.map(purchaseFact));
  return out.join('\n');
}
/* the rules for answering; the facts follow them */
const ASK_RULES='You help someone understand their own spending inside a budgeting app called Flowly. Answer from the facts below only. '
  +'The app has already done the math, so quote its numbers rather than calculating new totals, and if the facts don\'t answer the question, say what\'s missing. '
  +'Keep it short: a sentence or two, then up to 5 bullet points when they help. '
  +'Practical budgeting suggestions are fine; don\'t recommend investments or financial products.\n\nFACTS\n';
/* the AI's instructions stay in English; it answers in the reader's language */
export const askRules=()=>ASK_RULES.replace('\n\nFACTS\n',(state.LANG==='ru'?' Always answer in Russian.':'')+'\n\nFACTS\n');
