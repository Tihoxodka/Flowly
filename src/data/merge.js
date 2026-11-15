import {dict} from '../core/util.js';
/* Merging two copies of a saved document (the plan, or a month of transactions) when two Macs share a folder.
   Each copy carries stamps in _m: when each plain field, and each entry of a list or map, last changed on any device.
   A removed entry keeps its stamp, so a removal is a change too. stamp() writes them at save time, by comparing with
   the copy saved before; merge() takes every field and entry from the copy that changed it last. No state, no DOM.
   Stamps come from files, so they are only ever read as numbers. */
const ORDER=''; // in a list's stamps: when its order last changed (no item has an empty key)
const isObj=v=>!!v&&typeof v==='object';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const own=(o,k)=>Object.hasOwn(o,k)?o[k]:undefined;
const num=v=>typeof v==='number'&&v>0?v:0;
const keyOf=x=>isObj(x)?String(x.id??x.name??''):'';
const fields=(a,b)=>[...new Set([...Object.keys(a),...Object.keys(b)])].filter(f=>f!=='_ts'&&f!=='_m');
/* a list's items by id (categories by name) or a map's values; null for a plain value, or a list without unique keys */
function entries(v){
  if(v===undefined)return dict();
  if(!isObj(v))return null;
  if(!Array.isArray(v))return v;
  const d=dict();
  for(const x of v){const k=keyOf(x);if(!k||k in d)return null;d[k]=x}
  return d;
}
/* both lists or both maps (or one missing): they merge entry by entry; anything else is one plain value */
const byEntry=(x,y,a,b)=>!!a&&!!b&&(x===undefined||y===undefined||Array.isArray(x)===Array.isArray(y));
/**
 * The stamps for a document about to be saved: prev's, with `now` on every field and entry that differs from prev.
 * Nothing to compare with means no stamps: unstamped data never beats another copy's.
 * @param {any} prev the copy saved before, or null @param {any} next @param {number} now
 */
export function stamp(prev,next,now){
  const m=dict();
  if(!isObj(prev))return m;
  const pm=isObj(prev._m)?prev._m:{};
  for(const f of Object.keys(pm))m[f]=isObj(pm[f])?Object.assign(dict(),pm[f]):pm[f];
  /* always later than the stamp it replaces, even if that one came from a clock running ahead */
  const mark=(f,k)=>{
    if(k===undefined){m[f]=Math.max(now,num(m[f])+1);return}
    const fm=isObj(m[f])?m[f]:(m[f]=dict());fm[k]=Math.max(now,num(fm[k])+1);
  };
  for(const f of fields(prev,next)){
    const x=prev[f],y=next[f],a=entries(x),b=entries(y);
    if(!byEntry(x,y,a,b)){if(!same(x,y))mark(f);continue}
    for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(!same(own(a,k),own(b,k)))mark(f,k);
    if(Array.isArray(x)&&Array.isArray(y)&&!same(x.map(keyOf).filter(k=>k in b),y.map(keyOf).filter(k=>k in a)))mark(f,ORDER);
  }
  return m;
}
/**
 * Merges this device's copy of a document with the shared folder's. A field or entry comes from the copy with the
 * later stamp. With equal stamps the folder's wins, except that something only one copy has is kept: data is only
 * dropped when a removal was recorded. A list keeps this device's order unless the folder's was reordered later.
 * @param {any} mine @param {any} theirs
 * @returns {{doc:any,mine:boolean,theirs:boolean}} mine: doc has changes the folder lacks (save it there);
 *   theirs: doc differs from this device's copy (show it)
 */
export function merge(mine,theirs){
  const doc=dict(),m=dict(),A=isObj(mine._m)?mine._m:{},B=isObj(theirs._m)?theirs._m:{};
  let um=false,ut=false;
  const take=(a,b,sa,sb)=>{
    const w=sa>sb||(sa===sb&&b===undefined&&a!==undefined);
    if(w)um=true;else if(!same(a,b))ut=true;
    return w?a:b;
  };
  for(const f of fields(mine,theirs)){
    const x=mine[f],y=theirs[f],a=entries(x),b=entries(y);
    if(!byEntry(x,y,a,b)){
      const sa=num(own(A,f)),sb=num(own(B,f)),v=take(x,y,sa,sb);
      if(v!==undefined)doc[f]=v;
      if(sa||sb)m[f]=Math.max(sa,sb);
      continue;
    }
    const SA=isObj(own(A,f))?A[f]:{},SB=isObj(own(B,f))?B[f]:{},vals=dict(),fm=dict();
    /* stamps too: a removed entry is in neither copy, and its stamp must live on */
    for(const k of new Set([...Object.keys(a),...Object.keys(b),...Object.keys(SA),...Object.keys(SB)])){
      const sa=num(own(SA,k)),sb=num(own(SB,k)),v=take(own(a,k),own(b,k),sa,sb);
      if(v!==undefined)vals[k]=v;
      if(sa||sb)fm[k]=Math.max(sa,sb);
    }
    if(Object.keys(fm).length)m[f]=fm;
    if(!Array.isArray(x??y)){doc[f]=vals;continue}
    const ka=(x||[]).map(keyOf),kb=(y||[]).map(keyOf),mineLeads=num(own(SA,ORDER))>=num(own(SB,ORDER));
    const lead=mineLeads?ka:kb,seen=new Set(lead);
    const order=[...lead,...(mineLeads?kb:ka).filter(k=>!seen.has(k))].filter(k=>k in vals);
    if(!mineLeads&&!same(order.filter(k=>k in a),ka.filter(k=>k in vals)))ut=true;
    doc[f]=order.map(k=>vals[k]);
  }
  doc._ts=Math.max(num(mine._ts),num(theirs._ts));
  doc._m=m;
  return{doc,mine:um,theirs:ut};
}
