import {monthKeyOf} from '../core/dates.js';
import {f2,r2} from '../core/format.js';
import {T,cn} from '../core/i18n.js';
import {html,options,suggestions} from '../core/html.js';
import {$,dict,pad,uid} from '../core/util.js';
import {addTx,catFor,learn,tagList} from '../model/spending.js';
import {state} from '../state.js';
import {spendOpts} from '../ui/forms.js';
import {render} from '../ui/render.js';
import {toast} from '../ui/toast.js';
/** The quick log form: date, amount, merchant, category, account, tag */
export function qaHtml(){
  const mkey=monthKeyOf(state.view),today=state.TODAY;
  /* today in this month; the last day of an earlier month, the first of a later one */
  const d=today.slice(0,7)===mkey?today:(mkey<today.slice(0,7)?mkey+'-'+pad(new Date(state.view.y,state.view.m+1,0).getDate()):mkey+'-01');
  const merch=Object.values(state.plan.merch||{}),ms=merch.map(v=>v.desc).sort((a,b)=>a.localeCompare(b));
  const cats=state.plan.cats.map(c=>c.name).concat(['Uncategorized']);
  /* the category used most by known merchants comes preselected */
  const fr=dict();merch.forEach(v=>fr[v.cat]=(fr[v.cat]||0)+1);const dc=Object.keys(fr).sort((x,y)=>fr[y]-fr[x])[0]||'Uncategorized';
  return html`<form class="qa" id="qa" autocomplete="off">
  <label>${T('Date')}<input id="qa-date" type="date" value="${d}" required></label>
  <label>${T('Amount')}<input id="qa-amt" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" required></label>
  <label class="wide">${T('Merchant')}<input id="qa-desc" list="qa-ml" placeholder="${T('Where')}" required><datalist id="qa-ml">${
    suggestions(ms)}</datalist></label>
  <label>${T('Category')}<select id="qa-cat">${options(cats.map(c=>[c,cn(c)]),dc)}</select></label>
  <label>${T('Paid with')}<select id="qa-acct">${options(spendOpts())}</select></label>
  <label>${T('Tag')}<input id="qa-tag" list="qa-tl" placeholder="${T('optional')}"><datalist id="qa-tl">${suggestions(tagList())}</datalist></label>
  <button class="btn pri" type="submit">${T('Log it')}</button></form>`;
}
/** Logging from the quick log form, and filling in what a known merchant had last time */
export function wireQA(){
  const f=$('#qa');if(!f)return;
  $('#qa-desc').addEventListener('change',()=>{
    const v=$('#qa-desc').value.trim(),mm=state.plan.merch?.[v.toLowerCase()];
    if(mm){$('#qa-cat').value=mm.cat;$('#qa-tag').value=mm.tag||'';if(mm.acct)$('#qa-acct').value=mm.acct}
    else{const c=catFor(v,-1);if(c!=='Uncategorized'&&[...$('#qa-cat').options].some(o=>o.value===c))$('#qa-cat').value=c}
  });
  f.addEventListener('submit',async e=>{
    e.preventDefault();
    const amt=parseFloat($('#qa-amt').value),desc=$('#qa-desc').value.trim(),date=$('#qa-date').value;
    if(!(amt>0)||!desc||!date){toast(T('Add a date, an amount and a merchant'));return}
    const t={id:uid(),date,desc,amt:-r2(amt),cat:$('#qa-cat').value,acct:$('#qa-acct').value,tag:$('#qa-tag').value.trim()};
    await addTx(t);learn(t);toast(T('Logged {amt} at {merchant}',{amt:f2(amt),merchant:desc}));
    const keepDate=date;render();const nd=$('#qa-date');if(nd){nd.value=keepDate;$('#qa-amt').focus()}
  });
}
