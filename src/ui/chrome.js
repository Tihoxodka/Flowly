import {LANG_NAMES,T} from '../core/i18n.js';
import {S,lget,lset,okMsg,status} from '../data/storage.js';
import {$,$$} from '../core/util.js';
import {state} from '../state.js';
/* the parts of the page outside #main, in the current language */
export function chrome(){
  document.documentElement.lang=state.LANG;
  $$('[data-t]').forEach(el=>{el.textContent=T(el.dataset.t)});
  $$('[data-ta]').forEach(el=>{el.setAttribute('aria-label',T(el.dataset.ta))});
  const b=$('#theme'),d=isDark();
  if(b){b.textContent=d?'☀︎':'☾︎';b.title=T(d?'Light theme':'Dark theme');b.setAttribute('aria-label',b.title)}
}
/** Dark mode is on: chosen on this device, else the system's */
const isDark=()=>{const t=document.documentElement.dataset.theme;return t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches};
/** Applies the theme saved on this device ('light' or 'dark'; anything else follows the system) */
export function loadTheme(){const t=lget('ui')?.theme;if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}
/** Switches between light and dark, and remembers it on this device */
export function toggleTheme(){
  const t=isDark()?'light':'dark';document.documentElement.dataset.theme=t;lset('ui',{...(lget('ui')||{}),theme:t});chrome();
}
/** Switches the interface language on this device @param {string} l */
export function setLang(l){
  state.LANG=LANG_NAMES.some(x=>x[0]===l)?l:'en';
  lset('ui',{...(lget('ui')||{}),lang:state.LANG});
  status(S.locked?T('Load failed: reload before editing'):okMsg(),S.locked?'bad':'');
}
