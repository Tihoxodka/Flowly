import {monthKeyOf} from './core/dates.js';
import {f2,r2} from './core/format.js';
import {T,catKey,cn,dl} from './core/i18n.js';
import {$,$$} from './core/util.js';
import {backup} from './data/backup.js';
import {lget,lset,savePlan,saveTx} from './data/storage.js';
import {openImport} from './import/dialog.js';
import {acct,snapNW} from './model/accounts.js';
import {startDay,dueToast,setDue,setPay} from './model/schedule.js';
import {catList,learn} from './model/spending.js';
import {srcFor} from './model/transfers.js';
import {state} from './state.js';
import {ask,openForm} from './ui/dialog.js';
import {del,edit,editRules,editSettings,editTx,fundGoal,nextStmt,transfer} from './ui/forms.js';
import {paint,paintSoon,project,render} from './ui/render.js';
import {toast} from './ui/toast.js';
import {wireAsk} from './views/ask.js';
import {kickGo} from './views/kickoff.js';
import {tipIcs} from './views/shared.js';
import {catPick,txSum} from './views/spending.js';
const shift=n=>{const i=state.view.y*12+state.view.m+n;state.view={y:Math.floor(i/12),m:((i%12)+12)%12};render()};
/** the transfer tip a button belongs to (data-i), if any @param {HTMLElement} b */
const tipOf=b=>b.dataset.i!=null?project().tips[+b.dataset.i]:null;
/** Deletes a logged transaction, with Undo @param {string} id */
function deleteTx(id){
  const m=monthKeyOf(state.view),items=state.tx[m].items,i=items.findIndex(t=>t.id===id);if(i<0)return;
  const [gone]=items.splice(i,1);saveTx(m);paint();
  const undo=()=>{state.tx[m].items.splice(Math.min(i,state.tx[m].items.length),0,gone);saveTx(m);paint()};
  toast(T('Deleted {what}',{what:`${gone.desc} ${f2(gone.amt)}`}),undo);
}
function addCategory(){
  openForm('Add category',[{k:'name',l:'Category name',req:1},{k:'budget',l:'Monthly budget',t:'number'}],{},o=>{
    const n=catKey(o.name);
    if(!catList().includes(n)){state.plan.cats.push({name:n,budget:o.budget});savePlan()}
    render();
  });
}
/** @param {string} c */
function removeCategory(c){
  ask(T('Remove category “{name}”?',{name:cn(c)}),T('Remove'),()=>{state.plan.cats=state.plan.cats.filter(x=>x.name!==c);savePlan();render()});
}
/** @param {string} id @param {string} v */
const setKickEstimate=(id,v)=>{const el=$(`[data-kb="${CSS.escape(id)}"]`);if(el)el.value=v};

/** What a click on a [data-act] element does, by its data-act. b is the element; its data-kind, data-id and so on say what it's for.
 * @type {Record<string,(b:HTMLElement)=>void>} */
const CLICK={
  prev(){shift(-1)},
  next(){shift(1)},
  today(){state.view={y:state.now.getFullYear(),m:state.now.getMonth()};render()},
  kickoff(){if(!state.plan.kickoff)state.plan.kickoff=startDay();state.tab='kickoff';render();scrollTo(0,0)},
  kgo(){kickGo()},
  kest(b){setKickEstimate(b.dataset.id,b.dataset.v)},
  kuse(){$$('[data-act="kest"]').forEach(x=>setKickEstimate(x.dataset.id,x.dataset.v))},
  settings(){editSettings()},
  askchk(){wireAsk()},
  duesave(b){
    const el=/** @type {HTMLInputElement} */(b.closest('.tip')?.querySelector('[data-act="due"]'));
    if(el&&el.value.trim()&&setDue(b.dataset.key,el.value)){paint();dueToast(b.dataset.key)}
  },
  add(b){edit(b.dataset.kind)},
  edit(b){edit(b.dataset.kind,b.dataset.id)},
  del(b){del(b.dataset.kind,b.dataset.id)},
  fund(b){fundGoal(b.dataset.id)},
  nextstmt(b){nextStmt(b.dataset.id)},
  xfer(b){const t=tipOf(b);transfer(t?{to:t.acct,from:srcFor(t)?.id,amt:t.amount}:{})},
  ics(b){const {tips}=project(),sel=b.dataset.i==='all'?tips:[tips[+b.dataset.i]].filter(Boolean);if(sel.length)tipIcs(sel)},
  backup(){backup()},
  restore(){$('#rf').click()},
  tadd(){editTx()},
  tedit(b){editTx(b.dataset.id)},
  tdel(b){deleteTx(b.dataset.id)},
  timport(){openImport()},
  trules(){editRules()},
  tcatpick(b){catPick(b,b.dataset.id)},
  catadd(){addCategory()},
  catdel(b){removeCategory(b.dataset.cat)}
};
document.addEventListener('click',e=>{
  const b=/** @type {any} */(e.target).closest('[data-act],[data-tab]');if(!b||!state.plan)return;
  if(b.dataset.tab){state.tab=b.dataset.tab;lset('ui',{...(lget('ui')||{}),tab:state.tab});render();return}
  if(Object.hasOwn(CLICK,b.dataset.act))CLICK[b.dataset.act](b);
});
/* budget categories: drag the grip (mouse or touch) or use arrow keys on it; the order is the plan's category order */
function catOrder(names){
  const before=state.plan.cats.map(c=>c.name).join('\n');
  state.plan.cats.sort((a,b)=>names.indexOf(a.name)-names.indexOf(b.name));
  if(state.plan.cats.map(c=>c.name).join('\n')!==before)savePlan();
}
document.addEventListener('pointerdown',e=>{
  const g=/** @type {any} */(e.target).closest('.grip');if(!g||!state.plan||e.button>0)return;
  e.preventDefault();
  /* listen on the document: moving the row in the DOM drops pointer capture on the grip */
  const tr=g.closest('tr'),tb=tr.parentNode,pid=e.pointerId;let lastY=e.clientY,raf=0;
  tr.classList.add('drag');document.body.classList.add('dragging');
  /* the row goes past every neighbour whose middle the pointer has crossed */
  const place=y=>{
    const rows=[...tb.querySelectorAll('tr[data-cat]')],i=rows.indexOf(tr);let j=i;
    for(let k=0;k<rows.length;k++){
      if(k===i)continue;const b=rows[k].getBoundingClientRect(),mid=b.top+b.height/2;
      if(k<i&&y<mid){j=k;break}
      if(k>i&&y>mid)j=k;
    }
    if(j<i)tb.insertBefore(tr,rows[j]);else if(j>i)tb.insertBefore(tr,rows[j].nextSibling);
  };
  const edge=()=>{const d=lastY<70?-12:lastY>innerHeight-70?12:0;if(d){scrollBy(0,d);place(lastY);raf=requestAnimationFrame(edge)}else raf=0};
  const move=ev=>{if(ev.pointerId!==pid)return;ev.preventDefault();lastY=ev.clientY;place(lastY);if(!raf)raf=requestAnimationFrame(edge)};
  const end=ev=>{
    if(ev.pointerId!==pid)return;
    cancelAnimationFrame(raf);
    document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);
    tr.classList.remove('drag');document.body.classList.remove('dragging');
    catOrder([...tb.querySelectorAll('tr[data-cat]')].map(r=>r.dataset.cat));
  };
  document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
});
document.addEventListener('keydown',e=>{
  const g=/** @type {any} */(e.target).closest?.('.grip');if(!g||!state.plan||(e.key!=='ArrowUp'&&e.key!=='ArrowDown'))return;
  e.preventDefault();
  const names=state.plan.cats.map(c=>c.name),i=names.indexOf(g.dataset.cat),j=i+(e.key==='ArrowUp'?-1:1);
  if(i<0||j<0||j>=names.length)return;
  [names[i],names[j]]=[names[j],names[i]];catOrder(names);paint();
  [...$$('.grip')].find(x=>x.dataset.cat===g.dataset.cat)?.focus();
});
/** A recorded actual amount (or a cleared one). A dividend's amount also goes into the account it pays into,
   and that is undone when the amount changes. @param {string} k the event key @param {string} v what was typed */
function setActual(k,v){
  const ap=state.plan.applied||(state.plan.applied={}),parts=k.split(':');
  const a=parts[0]==='in'&&parts[1].startsWith('div-')?acct(parts[1].slice(4)):null;
  const undo=()=>{const p=ap[k];if(p&&a){a[p.f]=r2((+a[p.f]||0)-p.v)}delete ap[k]};
  if(v===''){undo();delete state.plan.actual[k];delete state.plan.done[k]}
  else{
    const n=parseFloat(v);if(isNaN(n))return false;
    undo();state.plan.actual[k]=Math.abs(n);state.plan.done[k]=1;
    if(a){const f=a.divMode==='reinvest'?'bal':'cash',x=Math.abs(n);a[f]=r2((+a[f]||0)+x);ap[k]={f,v:x}}
  }
  return true;
}
/** @param {HTMLInputElement} b */
const num=b=>parseFloat(b.value)||0;
/** Changes an account field from an input with data-id, then saves and repaints @param {HTMLInputElement} b @param {(a:Account)=>void} fn */
const setAcct=(b,fn)=>{const a=acct(b.dataset.id);if(a){fn(a);savePlan();paintSoon()}};
/** Changes a plan setting, then saves and repaints @param {()=>void} fn */
const setPlan=fn=>{fn();savePlan();paintSoon()};
/** @param {HTMLInputElement} b */
const setDone=b=>{const k=b.dataset.key;if(b.checked)state.plan.done[k]=1;else delete state.plan.done[k];savePlan()};

/** What changing a [data-act] field does, by its data-act. b is the field.
 * @type {Record<string,(b:HTMLInputElement)=>void>} */
const CHANGE={
  done(b){setDone(b);paintSoon()},
  kdone(b){setDone(b)},
  kdate(b){setPlan(()=>{state.plan.kickoff=b.value})},
  planned(b){setPlan(()=>{state.plan.showPlanned=b.checked})},
  intin(b){setPlan(()=>{state.plan.interestIn=b.checked})},
  extra(b){setPlan(()=>{state.plan.extra=Math.max(0,num(b))})},
  strategy(b){setPlan(()=>{state.plan.strategy=/** @type {Plan['strategy']} */(b.value)})},
  budget(b){const c=state.plan.cats.find(x=>x.name===b.dataset.cat);if(c)setPlan(()=>{c.budget=Math.max(0,num(b))})},
  due(b){if(setDue(b.dataset.key,b.value)){paintSoon();dueToast(b.dataset.key)}},
  actual(b){if(setActual(b.dataset.key,b.value.trim()))setPlan(()=>{})},
  cash(b){setAcct(b,a=>{a.cash=num(b);a.upd=state.TODAY;snapNW()})},
  apy(b){setAcct(b,a=>{a.apy=Math.max(0,num(b))})},
  typ(b){setAcct(b,a=>{a.typ=Math.max(0,num(b))})},
  stmt(b){setAcct(b,a=>{a.stmt=Math.max(0,num(b))})},
  bal(b){setAcct(b,a=>{a.bal=num(b);a.upd=state.TODAY;a.updAt=Date.now();snapNW()})},
  payon(b){setPay(b.dataset.key,b.value);paintSoon();if(b.value)toast(T('Payment moved to {date}',{date:dl(b.value)}))},
  tcat(b){
    const m=monthKeyOf(state.view),t=state.tx[m].items.find(x=>x.id===b.dataset.id);
    if(t){t.cat=b.value;saveTx(m);learn(t);$('#txs').textContent=txSum()}
  }
};
document.addEventListener('change',e=>{
  const b=/** @type {any} */(e.target).closest('[data-act]');if(!b||!state.plan)return;
  if(Object.hasOwn(CHANGE,b.dataset.act))CHANGE[b.dataset.act](b);
});
