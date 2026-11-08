/** The first element matching a selector (typed loosely: the app knows what each id is) @param {string} s @returns {any} */
export const $=s=>document.querySelector(s);
/** Every element matching a selector @param {string} s @returns {NodeListOf<any>} */
export const $$=s=>document.querySelectorAll(s);
/** Two digits: 07 @param {number} n */
export const pad=n=>String(n).padStart(2,'0');
/** A new random id */
export const uid=()=>Math.random().toString(36).slice(2,9);
/** A deep copy of JSON data @template T @param {T} o @returns {T} */
export const clone=o=>JSON.parse(JSON.stringify(o));
/** Text made safe to put in HTML, attributes included @param {unknown} s */
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** The total of items' amt @param {{amt:number}[]} a */
export const sum=a=>a.reduce((s,e)=>s+(+e.amt||0),0);
/* a lookup keyed by names people type (merchants, categories, tags): no prototype, so "constructor" or "__proto__" are ordinary keys */
export const dict=()=>Object.create(null);
