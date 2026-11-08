import {pad} from './util.js';
import {state} from '../state.js';
/** Moves today (state.now, state.TODAY) forward when the app stays open past midnight; true if the day changed */
export function newDay(){
  const d=new Date(),t=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  if(t===state.TODAY)return false;
  state.now=d;state.TODAY=t;return true;
}
/** A month as one number (year×12 + month), for counting months @param {string} iso 'YYYY-MM-DD' or 'YYYY-MM-…' */
export const monthIndex=iso=>(+iso.slice(0,4))*12+(+iso.slice(5,7))-1;

/** 'YYYY-MM' of a month shown @param {{y:number,m:number}} v */
export const monthKeyOf=v=>`${v.y}-${pad(v.m+1)}`;
/** The date n days after iso (before, for negative n) @param {string} iso @param {number} n */
export const addDays=(iso,n)=>{const [y,m,d]=iso.split('-').map(Number);return isoOf(new Date(y,m-1,d+n))};
/** 'YYYY-MM-DD' of a local date @param {Date} dt */
export const isoOf=dt=>`${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
/** 'YYYY-MM' of a month index (see monthIndex) @param {number} j */
export const monthKeyAt=j=>`${Math.floor(j/12)}-${pad(j%12+1)}`;
