import {state} from '../state.js';
/* Money is shown in the plan's currency (Currency button at the bottom). Changing it doesn't convert anything.
   The number format is the currency's usual one unless the plan picks another. */
export const CURRENCIES=[['USD','US dollar'],['EUR','Euro'],['SEK','Swedish krona'],['NOK','Norwegian krone'],['DKK','Danish krone'],['GBP','British pound'],
  ['CHF','Swiss franc'],['PLN','Polish złoty'],['CAD','Canadian dollar'],['AUD','Australian dollar'],['JPY','Japanese yen']];
const CUR_LOC={USD:'en-US',EUR:'de-DE',SEK:'sv-SE',NOK:'nb-NO',DKK:'da-DK',GBP:'en-GB',CHF:'de-CH',PLN:'pl-PL',CAD:'en-CA',AUD:'en-AU',JPY:'ja-JP'};
/** number formats to choose from: '' is the currency's own */
export const NUMFMTS=[['','Usual for the currency'],['en-US','1,234.56'],['sv-SE','1 234,56'],['de-DE','1.234,56'],['de-CH','1\'234.56']];
const fmts={};
/* dec: digits after the decimal point; left out, the currency's own (2, or 0 for yen) */
function money(dec){
  const c=state.plan?.currency||'USD',loc=state.plan?.numfmt||CUR_LOC[c]||'en-US',k=`${c}|${loc}|${dec}`;
  const digits=dec==null?{}:{minimumFractionDigits:dec,maximumFractionDigits:dec};
  return fmts[k]||(fmts[k]=new Intl.NumberFormat(loc,{style:'currency',currency:c,signDisplay:'never',...digits}));
}
/** Money in whole units, in the plan's currency and format: −$1,234 @param {number} n */
export const f0=n=>(n<-0.5?'−':'')+money(0).format(Math.abs(Math.round(n)));
/** Money with cents: −$1,234.50 @param {number} n */
export const f2=n=>(n<-0.004?'−':'')+money().format(Math.abs(n));
/** Rounds to cents @param {number} n */
export const r2=n=>Math.round(n*100)/100;
/* short amounts for chart axes, in thousands: $12.5k, 12,5k kr, 12,5k € */
export function kfmt(v){
  if(Math.abs(v)<1000)return f0(v);
  const f=money(0),short=new Intl.NumberFormat(f.resolvedOptions().locale,{maximumFractionDigits:1}).format(Math.abs(v)/1000)+'k';
  let done=false;
  return(v<0?'−':'')+f.formatToParts(Math.round(Math.abs(v))).map(p=>p.type==='integer'?(done?'':(done=true,short)):p.type==='group'?'':p.value).join('');
}
