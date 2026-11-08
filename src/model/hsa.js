import {r2} from '../core/format.js';
import {acct} from './accounts.js';
import {occ} from './schedule.js';
import {state} from '../state.js';
/* HSA: money set aside for health costs. Its debit card purchases come out of the HSA, not your spending money */
export const isHSA=a=>!!a&&a.type==='hsa';
/** A transaction paid with the HSA card @param {Tx} t */
export const hsaPaid=t=>isHSA(acct(t.acct));
/* logged purchases (and refunds) on the HSA card after its balance was last recorded */
export function hsaSpent(a){
  let s=0;const on=a.upd||'';
  Object.values(state.tx).forEach(m=>m.items.forEach(t=>{
    if(t.acct!==a.id)return;
    if(a.updAt&&t.at?t.date>=on&&t.at>a.updAt:t.date>on)s-=t.amt;
  }));
  return r2(s);
}
/** What an HSA holds now: its balance less card purchases since @param {Account} a */
export const hsaNow=a=>r2((+a.bal||0)-hsaSpent(a));
/* IRS limits: [self-only, family]; people 55 and older can add a catch-up amount */
const HSA_LIMITS={2025:[4300,8550],2026:[4400,8750]},HSA_CATCHUP=1000;
/** This year's HSA contributions (so far and still scheduled) against the IRS limit @param {Account} a */
export function hsaYear(a){
  const y=state.now.getFullYear(),ly=HSA_LIMITS[y]?y:Math.max(...Object.keys(HSA_LIMITS).map(Number));
  const limit=HSA_LIMITS[ly][a.cover==='family'?1:0]+(a.age55?HSA_CATCHUP:0);
  const per=(+a.contrib||0)+(+a.match||0),from=a.ytdOn&&a.ytdOn.slice(0,4)==String(y)?a.ytdOn:state.TODAY;let left=0;
  if(per>0&&a.cdate)for(let m=state.now.getMonth();m<12;m++)left+=occ({freq:a.cfreq||'biweekly',date:a.cdate,day2:a.cday2},y,m).filter(d=>d>from).length*per;
  const so=a.ytdOn&&a.ytdOn.slice(0,4)==String(y)?+a.ytd||0:0;
  return{limit,limitYear:ly,so,left:r2(left),total:r2(so+left)};
}
