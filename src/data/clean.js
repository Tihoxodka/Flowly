import {DEFAULT_CATS,FREQS,TYPES} from '../core/constants.js';
import {CURRENCIES,NUMFMTS} from '../core/format.js';
import {dict,uid} from '../core/util.js';
import {HOLIDAYS} from '../model/holidays.js';
/** A new, empty plan @returns {Plan} */
export const blank=()=>({v:2,currency:'USD',numfmt:'',holidays:'',income:[],bills:[],accounts:[],goals:[],cats:DEFAULT_CATS.map(name=>({name,budget:0})),
  rules:'',done:{},actual:{},applied:{},showPlanned:false,interestIn:false,kickoff:'',kickDone:false,nw:{},merch:{},extra:0,strategy:'avalanche'});
/* Saved data is checked before use. A backup file can come from anywhere, so ids, dates and amounts are forced into
   the shapes the app writes itself; text is always escaped when shown. Ids the app makes never change here. */
export const ISO_D=/^\d{4}-\d{2}-\d{2}$/,ISO_M=/^\d{4}-\d{2}$/,ID_OK=/^[\w.-]{1,64}$/;
const okId=v=>typeof v==='string'&&ID_OK.test(v);
const okDate=v=>typeof v==='string'&&ISO_D.test(v)?v:'';
const fnum=v=>{const n=typeof v==='number'?v:parseFloat(v);return Number.isFinite(n)?n:0};
const NUM_K='amt day2 dom issue bal cash divAmt contrib match cday2 ret ytd apy intday limit dueDay stmt typ apr min lead target saved updAt'.split(' ');
const DATE_K='date end upd duedate divDate cdate ytdOn'.split(' ');
const REF_K='acct to payfrom cfrom'.split(' ');
const TEXT_K='name note basis cat conf kind cover divMode'.split(' ');
const FREQ_K=new Set(FREQS.map(f=>f[0])),TYPE_K=new Set(TYPES.map(t=>t[0]));
function cleanItem(o){
  if(!o||typeof o!=='object'||Array.isArray(o))return null;
  const x={...o};
  if(!okId(x.id))x.id=uid();
  NUM_K.forEach(k=>{if(k in x&&typeof x[k]!=='number')x[k]=fnum(x[k])});
  DATE_K.forEach(k=>{if(k in x)x[k]=okDate(x[k])});
  REF_K.forEach(k=>{if(k in x&&!okId(x[k]))x[k]=''});
  TEXT_K.forEach(k=>{if(k in x&&typeof x[k]!=='string')x[k]=String(x[k]??'')});
  ['freq','cfreq','divFreq'].forEach(k=>{if(k in x&&!FREQ_K.has(x[k]))x[k]=k==='freq'?'monthly':k==='cfreq'?'biweekly':'quarterly'});
  if('type' in x&&!TYPE_K.has(x.type))x.type='checking';
  return x;
}
/* plan.merch and other maps become prototype-free dicts with checked values */
function cleanMap(o,fn){const d=dict();if(o&&typeof o==='object')for(const k of Object.keys(o)){const v=fn(o[k],k);if(v!==undefined)d[k]=v}return d}
/** Forces a loaded plan into the shapes the app writes, in place: ids, dates, numbers, choices and maps @param {any} p */
export function cleanPlan(p){
  ['income','bills','accounts','goals'].forEach(k=>p[k]=(Array.isArray(p[k])?p[k]:[]).map(cleanItem).filter(Boolean));
  p.cats=(Array.isArray(p.cats)?p.cats:[]).filter(c=>c&&c.name!=null&&String(c.name).trim())
    .map(c=>({...c,name:String(c.name),budget:Math.max(0,fnum(c.budget))}));
  p.rules=typeof p.rules==='string'?p.rules:'';
  p.done=cleanMap(p.done,v=>v?1:undefined);
  p.actual=cleanMap(p.actual,v=>{const n=typeof v==='number'?v:parseFloat(v);return Number.isFinite(n)?n:undefined});
  p.payOn=cleanMap(p.payOn,v=>okDate(v)||undefined);
  p.applied=cleanMap(p.applied,v=>v&&(v.f==='bal'||v.f==='cash')?{f:v.f,v:fnum(v.v)}:undefined);
  p.nw=cleanMap(p.nw,(v,k)=>ISO_M.test(k)&&v?{a:fnum(v.a),d:fnum(v.d),dt:okDate(v.dt)}:undefined);
  p.merch=cleanMap(p.merch,v=>v&&typeof v==='object'
    ?{desc:String(v.desc??''),cat:String(v.cat??''),tag:String(v.tag??''),acct:okId(v.acct)?v.acct:''}:undefined);
  p.kickoff=okDate(p.kickoff);
  p.extra=Math.max(0,fnum(p.extra));
  if(p.strategy!=='snowball')p.strategy='avalanche';
  if(!CURRENCIES.some(c=>c[0]===p.currency))p.currency='USD';
  if(!NUMFMTS.some(f=>f[0]===p.numfmt))p.numfmt='';
  if(!HOLIDAYS.some(h=>h[0]===p.holidays))p.holidays='';
  ['showPlanned','interestIn','kickDone'].forEach(k=>p[k]=!!p[k]);
}
/* one month of logged transactions */
export function cleanTx(v,m){
  const items=Array.isArray(v?.items)?v.items:[];
  return{items:items.filter(t=>t&&typeof t==='object').map(t=>({...t,
    id:okId(t.id)?t.id:uid(),date:okDate(t.date)||m+'-01',desc:String(t.desc??''),amt:fnum(t.amt),
    cat:typeof t.cat==='string'&&t.cat?t.cat:'Uncategorized',acct:okId(t.acct)?t.acct:'',tag:typeof t.tag==='string'?t.tag:'',
    at:typeof t.at==='number'?t.at:undefined}))};
}
/** Cleans a loaded plan and moves old data to the current shape; true if anything changed, so it should be saved @param {any} p a plan from storage or a backup, maybe with old fields */
export function upgrade(p){
  cleanPlan(p);
  let ch=false;
  p.accounts.forEach(a=>{
    if(a.type==='credit'&&!+a.dueDay){const d=+a.due||(a.duedate?+a.duedate.slice(8,10):0);if(d){a.dueDay=d;ch=true}}
    if(a.type==='loan'&&a.pdate){
      if(+a.min>0&&!p.bills.some(b=>b.to===a.id)){
        const cat=['Debt payment','Other'].find(c=>p.cats.some(x=>x.name===c))||p.cats[0]?.name||'Other';
        p.bills.push({id:uid(),name:a.name+' payment',amt:+a.min,freq:'monthly',date:a.pdate,end:a.lend||'',acct:a.lfrom||'',to:a.id,cat,auto:!!a.lauto});
      }
      ['pdate','lfrom','lend','lauto'].forEach(k=>delete a[k]);ch=true;
    }
  });
  return ch;
}
