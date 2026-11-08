import {html,options,suggestions} from '../core/html.js';
import {T} from '../core/i18n.js';
import {$} from '../core/util.js';
/** @param {Field} f @param {unknown} val */
function fieldInput(f,val){
  const id=`f-${f.k}`;
  if(f.t==='select')return html`<select id="${id}" name="${f.k}">${options(f.opts,val)}</select>`;
  if(f.t==='checkbox')return html`<label class="chk"><input id="${id}" type="checkbox" name="${f.k}"${val?' checked':''}> ${T(f.l)}</label>`;
  if(f.t==='textarea')return html`<textarea id="${id}" name="${f.k}" rows="8" placeholder="${T(f.ph||'')}">${val}</textarea>`;
  const num=f.t==='number'?html` step="any" inputmode="decimal"`:'',list=f.list?html` list="dl-${f.k}"`:'';
  return html`<input id="${id}" name="${f.k}" type="${f.t||'text'}"${num}${list} value="${val}" placeholder="${T(f.ph||'')}">${
    f.list?html`<datalist id="dl-${f.k}">${suggestions(f.list)}</datalist>`:''}`;
}
/** @param {Field} f @param {unknown} val */
const fieldHtml=(f,val)=>html`<div class="fld" data-k="${f.k}">${f.t==='checkbox'?'':html`<label for="f-${f.k}">${T(f.l)}</label>`}${fieldInput(f,val)}${
  f.help?html`<small>${T(f.help)}</small>`:''}</div>`;
/**
 * Opens a form in the dialog. Save checks required fields, then calls onSave with the values.
 * @param {string} title English, translated here
 * @param {Field[]} fields
 * @param {Record<string,unknown>} vals the values to start from
 * @param {(o:Record<string,any>)=>void} onSave
 * @param {(o:Record<string,any>)=>string|undefined} [check] returns an error to show instead of saving
 */
export function openForm(title,fields,vals,onSave,check){
  const d=$('#dlg');
  const acts=html`<button class="btn" type="button" data-close>${T('Cancel')}</button><button class="btn pri" type="button" id="fs">${T('Save')}</button>`;
  d.innerHTML=html`<h3>${T(title)}</h3>${fields.map(f=>fieldHtml(f,vals[f.k]??''))}<p class="err" id="ferr"></p><div class="acts">${acts}</div>`;
  /** the values in the form: numbers as numbers (NaN when empty), checkboxes as true or false, text trimmed */
  const get=()=>{
    const o={};
    fields.forEach(f=>{
      const el=d.querySelector(`[name="${f.k}"]`);
      o[f.k]=f.t==='checkbox'?el.checked:f.t==='number'?(el.value===''?NaN:parseFloat(el.value)):el.value.trim();
    });
    return o;
  };
  const sync=()=>{const o=get();fields.forEach(f=>{if(f.show)d.querySelector(`[data-k="${f.k}"]`).hidden=!f.show(o)})};
  d.oninput=d.onchange=sync;sync();
  d.onkeydown=e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT'&&e.target.type!=='file'){e.preventDefault();$('#fs').click()}};
  d.querySelector('[data-close]').onclick=()=>d.close();
  $('#fs').onclick=()=>{
    const o=get();
    for(const f of fields){
      if(f.show&&!f.show(o)){o[f.k]=f.t==='number'?0:f.t==='checkbox'?false:'';continue}
      const req=typeof f.req==='function'?f.req(o):f.req;
      if(req&&(f.t==='number'?isNaN(o[f.k]):!o[f.k])){$('#ferr').textContent=T('{field} is required.',{field:T(f.l)});return}
      if(f.t==='number'&&isNaN(o[f.k]))o[f.k]=0;
    }
    const bad=check?.(o);if(bad){$('#ferr').textContent=bad;return}
    d.close();onSave(o);
  };
  d.showModal();
}
/** Asks a yes/no question in the dialog @param {string} msg @param {string} label the yes button @param {()=>void} yes */
export function ask(msg,label,yes){
  const d=$('#dlg');
  d.innerHTML=html`<h3>${msg}</h3><div class="acts"><button class="btn" data-close>${T('Cancel')}</button><button class="btn pri" id="fy">${
    label}</button></div>`;
  d.onkeydown=null;d.oninput=d.onchange=null;
  d.querySelector('[data-close]').onclick=()=>d.close();
  $('#fy').onclick=()=>{d.close();yes()};d.showModal();
}
