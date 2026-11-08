import {monthIndex} from '../core/dates.js';
import {f0} from '../core/format.js';
import {html,TH} from '../core/html.js';
import {T,TN,mon} from '../core/i18n.js';
import {acctName} from '../model/accounts.js';
import {goalNeed} from '../model/schedule.js';
import {state} from '../state.js';
import {delBtn,editBtn} from './shared.js';

/** "By June 2027, 7 months left" @param {Goal} g @param {boolean} reached */
function goalWhen(g,reached){
  if(!g.date)return T('No target date');
  const left=monthIndex(g.date)-(state.now.getFullYear()*12+state.now.getMonth());
  const where=reached?T('reached'):left<=0?T('due now'):T('{months} left',{months:`${left} ${TN(left,'month','months')}`});
  return T('By {month} {y}, {state}',{month:mon(+g.date.slice(5,7)-1),y:g.date.slice(0,4),state:where});
}
/** @param {Goal} g */
function goalCard(g){
  const t=+g.target||0,s=+g.saved||0,pct=t>0?Math.min(100,s/t*100):0,need=goalNeed(g);
  const fund=html`<button class="btn sm" data-act="fund" data-id="${g.id}">${T('Add funds')}</button>`;
  return html`<div class="goal"><span class="nm">${g.name}</span><span class="act">${fund} ${editBtn('goals',g.id)} ${delBtn('goals',g.id)}</span>
  <span class="meta">${T('{amt} of {limit}',{amt:f0(s),limit:f0(t)})}, ${goalWhen(g,s>=t)}${
    need?T(', needs {amt} a month',{amt:f0(need)}):''}${
      g.acct?T(', kept in {name}',{name:acctName(g.acct)}):''}</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
}
/** @param {'short'|'long'} kind @param {string} title */
function goalGroup(kind,title){
  const list=state.plan.goals.filter(g=>g.kind===kind).sort((a,b)=>(a.date||'9999')<(b.date||'9999')?-1:1);
  return list.length?html`<div class="sec"><h2>${T(title)}</h2>${list.map(goalCard)}</div>`:'';
}
/** The Goals tab */
export function vGoals(){
  const need=state.plan.goals.reduce((s,g)=>s+goalNeed(g),0);
  const empty=T('No goals yet. Add an emergency fund, a trip, or a bigger long-term target. Monthly amounts come out of your spending money on the Overview.');
  return html`<div class="row" style="margin-top:16px"><button class="btn pri" data-act="add" data-kind="goals">${T('Add goal')}</button>${
    need?html`<span class="muted">${TH('Together your goals need {amt} a month.',{amt:html`<b>${f0(need)}</b>`})}</span>`:''}</div>
  ${state.plan.goals.length?[goalGroup('short','Short term'),goalGroup('long','Long term')]:html`<div class="empty">${empty}</div>`}`;
}
