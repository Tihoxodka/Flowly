import {monthIndex,monthKeyOf,monthKeyAt} from '../core/dates.js';
import {monl} from '../core/i18n.js';
import {$,$$} from '../core/util.js';
import {allMonths,ensureTx} from '../data/storage.js';
import {isHSA} from '../model/hsa.js';
import {projectNow} from '../model/project.js';
import {state} from '../state.js';
import {chrome} from './chrome.js';
import {vAccounts} from '../views/accounts.js';
import {wireAsk} from '../views/ask.js';
import {vDebt} from '../views/debt.js';
import {vGoals} from '../views/goals.js';
import {vKick} from '../views/kickoff.js';
import {vList} from '../views/lists.js';
import {vOverview} from '../views/overview.js';
import {wireQA} from '../views/quicklog.js';
import {vSpend,wireSpend} from '../views/spending.js';
import {vTrends,wireTips} from '../views/trends.js';
/** Each tab's view: returns the HTML for #main */
export const VIEWS={overview:vOverview,kickoff:vKick,spend:vSpend,income:()=>vList('income'),bills:()=>vList('bills'),
  accounts:vAccounts,debt:vDebt,trends:vTrends,goals:vGoals};
/* Keyboard focus survives a repaint: the focused control is found again by its id or data attributes. */
const FOCUS_ATTRS=['id','data-act','data-key','data-id','data-cat','data-kind','data-kb','data-kc','data-ks','data-kdd','data-kp','data-tab','data-askq'];
function focusSpot(){
  const el=/** @type {any} */(document.activeElement),main=$('#main');
  if(!el||!main.contains(el))return null;
  const sel=el.tagName+FOCUS_ATTRS.filter(a=>el.hasAttribute(a)).map(a=>`[${a}="${CSS.escape(el.getAttribute(a))}"]`).join('');
  let s=null,e=null;try{s=el.selectionStart;e=el.selectionEnd}catch(x){}
  return{sel,i:[...main.querySelectorAll(sel)].indexOf(el),s,e};
}
function refocus(spot){
  if(!spot)return;
  const all=$('#main').querySelectorAll(spot.sel),el=all[spot.i]||all[0];if(!el)return;
  el.focus({preventScroll:true});
  try{if(spot.s!=null)el.setSelectionRange(spot.s,spot.e)}catch(x){}
}
/* project() runs once per paint; every view in that paint shares the result */
let projMemo=null;
/** projectNow(), computed once per paint */
export function project(){return projMemo?(projMemo.p||(projMemo.p=projectNow())):projectNow()}
/** Draws the page from state: the month, the tabs and the open tab's view */
export function paint(){
  paintDue=false;
  chrome();
  $('#mlabel').textContent=`${monl(state.view.m)} ${state.view.y}`;
  $('#mnav').hidden=['goals','debt','kickoff'].includes(state.tab);
  $$('.tab').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.tab===state.tab)));
  const spot=focusSpot();
  projMemo={};
  try{$('#main').innerHTML=VIEWS[state.tab]()}finally{projMemo=null}
  refocus(spot);
  wireQA();wireTips();if(state.tab==='trends')wireAsk();
  if(state.tab==='spend')wireSpend();
}
/* After a field changes, repaint once focus has moved on (Tab or a click), so the repaint keeps it where the
   person was going. While a pointer is down, wait for it to come up so the click itself isn't lost. */
let paintDue=false,ptrDown=false;
/** Repaints after a field's change, once focus has moved on and no pointer is down */
export function paintSoon(){if(paintDue)return;paintDue=true;if(!ptrDown)setTimeout(paintLater)}
function paintLater(){if(paintDue&&!ptrDown)paint()}
const ptrUp=()=>{if(!ptrDown)return;ptrDown=false;if(paintDue)setTimeout(paintLater)};
addEventListener('pointerdown',()=>{ptrDown=true},true);
addEventListener('pointerup',ptrUp,true);addEventListener('pointercancel',ptrUp,true);addEventListener('blur',ptrUp);
let allLoaded=false;
/** Loads the months the open tab needs, then paints */
export async function render(){
  if(!state.plan)return;
  const i=state.view.y*12+state.view.m,ci=state.now.getFullYear()*12+state.now.getMonth(),need=[monthKeyOf(state.view),monthKeyAt(i-1)];
  /* HSA balances subtract card purchases since the balance date, so load those months (up to two years) */
  for(const a of state.plan.accounts.filter(isHSA))for(let j=Math.max(a.upd?monthIndex(a.upd):ci,ci-24);j<=ci;j++)need.push(monthKeyAt(j));
  if(state.tab==='trends'){if(!allLoaded){need.push(...await allMonths());allLoaded=true}for(let j=i-5;j<=i;j++)need.push(monthKeyAt(j))}
  await Promise.all([...new Set(need)].map(ensureTx));
  paint();
}
