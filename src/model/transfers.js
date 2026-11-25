import {r2} from '../core/format.js';
import {acct,isDebt} from './accounts.js';
import {hsaNow,isHSA} from './hsa.js';
import {state} from '../state.js';
/* Transfers between accounts.
   Money leaves a cash account, an investment's buying power or an HSA, and goes into one of those,
   a retirement account, or pays down a card or loan. Balances are what's there now, so a transfer
   changes both at once; each account's "as of" date stays, since nothing was re-read from the bank. */
export const XFROM=['checking','savings','cash','investment','hsa'],XTO=[...XFROM,'retirement','credit','loan'];
const xField=a=>a.type==='investment'?'cash':'bal';
/** What can be moved out of an account @param {Account} a */
export const xAvail=a=>a.type==='investment'?+a.cash||0:isHSA(a)?hsaNow(a):+a.bal||0;
/* moves amt between two accounts by id; returns a function that undoes it (.goal names the goal it grew), or null */
export function moveMoney(fromId,toId,amt){
  const from=acct(fromId),to=acct(toId);amt=r2(+amt);
  if(!from||!to||from===to||!(amt>0)||!XFROM.includes(from.type)||!XTO.includes(to.type))return null;
  /** @type {[()=>any,string,any][]} */
  const was=[];
  const set=(a,k,v)=>{const id=a.id;was.push([()=>acct(id),k,a[k]]);a[k]=r2(v)};
  set(from,xField(from),(+from[xField(from)]||0)-amt);
  if(isDebt(to)){
    set(to,'bal',Math.max(0,(+to.bal||0)-amt));
    /* paying a card early also pays its statement, so the scheduled payment shrinks */
    if(to.type==='credit'&&+to.stmt>0)set(to,'stmt',Math.max(0,+to.stmt-amt));
  }else set(to,xField(to),(+to[xField(to)]||0)+amt);
  /* money into an account a goal is kept in grows that goal: the soonest one not reached yet */
  const g=state.plan.goals.filter(x=>x.acct===to.id&&(+x.saved||0)<(+x.target||0)).sort((x,y)=>(x.date||'9999')<(y.date||'9999')?-1:1)[0];
  if(g){const id=g.id;was.push([()=>state.plan.goals.find(x=>x.id===id),'saved',g.saved]);g.saved=r2((+g.saved||0)+amt)}
  const undo=()=>was.reverse().forEach(([get,k,v])=>{const a=get();if(!a)return;if(v===undefined)delete a[k];else a[k]=v});
  return Object.assign(undo,{goal:g?.name||''});
}
/** Where the money for a transfer tip could come from: a cash account that has it, savings first, then the biggest @param {Tip} t */
export function srcFor(t){
  return state.plan.accounts.filter(a=>['checking','savings','cash'].includes(a.type)&&a.id!==t.acct&&(+a.bal||0)>=t.amount)
    .sort((x,y)=>Number(y.type==='savings')-Number(x.type==='savings')||(+y.bal||0)-(+x.bal||0))[0];
}
