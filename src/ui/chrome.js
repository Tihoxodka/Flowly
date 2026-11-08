import {LANG_NAMES,T} from '../core/i18n.js';
import {S,lget,lset,okMsg,status} from '../data/storage.js';
import {$$} from '../core/util.js';
import {state} from '../state.js';
/* the parts of the page outside #main, in the current language */
export function chrome(){
  document.documentElement.lang=state.LANG;
  $$('[data-t]').forEach(el=>{el.textContent=T(el.dataset.t)});
  $$('[data-ta]').forEach(el=>{el.setAttribute('aria-label',T(el.dataset.ta))});
}
/** Switches the interface language on this device @param {string} l */
export function setLang(l){
  state.LANG=LANG_NAMES.some(x=>x[0]===l)?l:'en';
  lset('ui',{...(lget('ui')||{}),lang:state.LANG});
  status(S.locked?T('Load failed: reload before editing'):okMsg(),S.locked?'bad':'');
}
