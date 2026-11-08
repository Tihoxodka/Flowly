import {r2} from '../core/format.js';
import {hsaNow,isHSA} from './hsa.js';
import {state} from '../state.js';
/** A credit card or loan: its balance is owed @param {Account} a */
export const isDebt=a=>a&&(a.type==='credit'||a.type==='loan');
/** The account with this id @param {string} id @returns {Account|undefined} */
export const acct=id=>state.plan.accounts.find(a=>a.id===id);
/** An account's name, or — @param {string} id */
export const acctName=id=>acct(id)?.name||'—';
/** A cash account that earns interest @param {Account} a */
export const hasInt=a=>!isDebt(a)&&!['investment','retirement','hsa','property'].includes(a.type)&&+a.apy>0;
/** Monthly interest rate from the APY @param {Account} a */
export const rate=a=>Math.pow(1+(+a.apy||0)/100,1/12)-1;
/** This month's interest on the current balance @param {Account} a */
export const mInt=a=>r2((+a.bal||0)*rate(a));
/** What you have (a) and what you owe (d) across all accounts. An investment counts its buying power too. */
export function assetsDebts(){
  let a=0,d=0;
  state.plan.accounts.forEach(x=>{if(isDebt(x))d+=+x.bal||0;else a+=(isHSA(x)?hsaNow(x):(+x.bal||0))+(x.type==='investment'?(+x.cash||0):0)});
  return{a:r2(a),d:r2(d)};
}
/** Records this month's net worth snapshot (or the given month's) @param {string} [key] 'YYYY-MM' @param {string} [dt] its date */
export function snapNW(key,dt){const {a,d}=assetsDebts();(state.plan.nw=state.plan.nw||{})[key||state.TODAY.slice(0,7)]={a,d,dt:dt||state.TODAY}}
