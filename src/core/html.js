import {esc} from './util.js';
import {T} from './i18n.js';

/* Markup made by html`` or raw(): put into another html`` as it is, not escaped */
class Raw{
  /** @param {string} s */
  constructor(s){this.s=s}
  toString(){return this.s}
}
/** Trusted markup, inserted unescaped. @param {unknown} s */
export const raw=s=>new Raw(String(s??''));
/** @param {unknown} v @returns {string} */
const part=v=>v instanceof Raw?v.s:Array.isArray(v)?v.map(part).join(''):v==null||v===false?'':esc(v);
/**
 * HTML from a template. Every ${value} is escaped, in text and in attributes, unless it is raw() or another html``.
 * Arrays are joined (each item treated the same way); null, undefined and false print nothing.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} vals
 */
export const html=(strings,...vals)=>new Raw(strings.reduce((o,s,i)=>o+s+(i<vals.length?part(vals[i]):''),''));
/**
 * T() for translations that hold markup (<b>…</b>), or whose values do. The translation is trusted;
 * each value is escaped unless it is raw() or html``.
 * @param {string} s English text, the dictionary key
 * @param {Record<string,unknown>} [v] values for its {placeholders}
 */
export const TH=(s,v)=>raw(T(s,v&&Object.fromEntries(Object.entries(v).map(([k,x])=>[k,part(x)]))));
/** <option>s for [value, label] pairs @param {unknown[][]} list @param {unknown} [sel] the selected value */
export const options=(list,sel)=>list.map(([v,l])=>html`<option value="${v}"${String(v)===String(sel)?' selected':''}>${l}</option>`);
/** <option>s for a <datalist> of suggestions @param {unknown[]} list */
export const suggestions=list=>list.map(x=>html`<option value="${x}">`);
