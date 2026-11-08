import {DEFAULT_CATS,RESERVED} from './constants.js';
import {state} from '../state.js';
import {ru} from '../i18n/ru.js';
/* Language.
   Text is written in English inside T('…'); other languages look it up in LANGS below (src/i18n/<lang>.js), so a missing translation shows
   the English. {name} placeholders are filled from the second argument. TN() picks a plural form.
   The language is this device's choice (saved with the open tab); saved data stays the same in every language. */
const LANGS={ru};
/** the interface languages: [code, name in that language] */
export const LANG_NAMES=[['en','English'],['ru','Русский']];
const LOC=()=>state.LANG==='ru'?'ru-RU':'en-US';
/** Interface text in the current language. s is the English text (the dictionary key); {name} placeholders are filled from v @param {string} s @param {Record<string,unknown>} [v] */
export function T(s,v){
  let r=(state.LANG!=='en'&&LANGS[state.LANG]?.[s])||s;
  if(v)r=r.replace(/\{(\w+)\}/g,(m,k)=>v[k]!=null?v[k]:m);
  return r;
}
/* Russian has three plural forms: 1 платёж, 2 платежа, 5 платежей. The dictionary key is "one|other" in English. */
const ruForm=n=>{n=Math.abs(n)%100;const d=n%10;return n>10&&n<20?2:d===1?0:d>=2&&d<=4?1:2};
/** A count's noun in the current language: TN(5,'day','days') @param {number} n @param {string} one @param {string} other */
export function TN(n,one,other){
  const r=state.LANG!=='en'&&LANGS[state.LANG]?.[one+'|'+other];
  if(r)return r.split('|')[state.LANG==='ru'?ruForm(n):n===1?0:1];
  return n===1?one:other;
}
/* month names and dates in the chosen language */
const dfs={};
/** A cached date formatter for the current language @param {Intl.DateTimeFormatOptions} o */
export const dfmt=o=>{const k=state.LANG+JSON.stringify(o);return dfs[k]||(dfs[k]=new Intl.DateTimeFormat(LOC(),o))};
/** Capitalizes the first letter @param {string} s */
export const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
/** Short month name: Nov @param {number} m 0-11 */
export const mon=m=>cap(dfmt({month:'short'}).format(new Date(2000,m,1)));
/** Full month name: November @param {number} m 0-11 */
export const monl=m=>cap(dfmt({month:'long'}).format(new Date(2000,m,1)));
/* 1st, 2nd… in English; Russian sentences use the bare number (see the {n} in their translations) */
export const ord=n=>{if(state.LANG!=='en')return String(n);const s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0])};
/* Russian writes the month out (5 ноября): its short forms end in a dot that doubles up at the end of a sentence */
export const dl=iso=>iso?dfmt({month:state.LANG==='ru'?'long':'short',day:'numeric'}).format(new Date(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))):'';
/* category names the app ships with are shown translated; the names saved in the plan stay as they are */
const CAT_KEYS=new Set([...DEFAULT_CATS,...RESERVED,'Debt payment']);
/** A category's name in the current language: built-in ones are translated, people's own stay as typed @param {string} c */
export const cn=c=>CAT_KEYS.has(c)?T(c):c;
/* a category typed in the current language back to its saved name: "Продукты" is Groceries */
export const catKey=c=>{const t=String(c).trim().toLowerCase();for(const k of CAT_KEYS)if(T(k).toLowerCase()===t)return k;return String(c).trim()};
/* fixed choices (how often, account type…) shown in the current language */
export const tOpts=list=>list.map(([v,l])=>[v,T(l)]);
/** A date with its weekday: Wed, Nov 18 @param {string} iso */
export const wdl=iso=>dfmt({weekday:'short',month:state.LANG==='ru'?'long':'short',day:'numeric'}).format(new Date(iso+'T12:00:00'));
