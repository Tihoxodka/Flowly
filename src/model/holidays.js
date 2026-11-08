import {isoOf} from '../core/dates.js';
import {state} from '../state.js';
/* Business days skip weekends and bank holidays: the Federal Reserve's in the US, Sweden's bank holidays there.
   The plan picks the calendar; automatic follows the currency (SEK means Sweden). */
export const HOLIDAYS=[['','Automatic (from the currency)'],['us','United States (Federal Reserve)'],['se','Sweden']];
/** The bank holiday calendar in use: the plan's, or Sweden's for SEK */
export const holCal=()=>state.plan?.holidays||(state.plan?.currency==='SEK'?'se':'us');
const hol={};
/** Bank holidays in a year, as 'YYYY-MM-DD' @param {number} y @param {string} [cal] 'us' or 'se' @returns {Set<string>} */
export function holidays(y,cal=holCal()){
  const hk=cal+y;if(hol[hk])return hol[hk];const set=new Set();
  const day=(m,d)=>set.add(isoOf(new Date(y,m,d)));
  if(cal==='se'){
    /* Easter Sunday (Gregorian computus); Swedish holidays falling on a weekend aren't moved */
    const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
    const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),em=Math.floor((h+l-7*m+114)/31)-1,ed=(h+l-7*m+114)%31+1;
    const easter=n=>day(em,ed+n);
    day(0,1);day(0,6);easter(-2);easter(1);day(4,1);easter(39);day(5,6);day(11,24);day(11,25);day(11,26);day(11,31);
    /* Midsummer Eve: the Friday between June 19 and 25. Banks also close on Christmas Eve and New Year's Eve. */
    for(let dd=19;dd<=25;dd++)if(new Date(y,5,dd).getDay()===5)day(5,dd);
    return hol[hk]=set;
  }
  const nth=(m,dow,n)=>1+((dow-new Date(y,m,1).getDay()+7)%7)+(n-1)*7;
  const lastDow=(m,dow)=>{const l=new Date(y,m+1,0);return l.getDate()-((l.getDay()-dow+7)%7)};
  const fixed=(m,d)=>{const dt=new Date(y,m,d),w=dt.getDay();if(w===6)return;if(w===0)dt.setDate(d+1);set.add(isoOf(dt))};
  /* New Year, MLK Day, Presidents Day, Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day, Veterans Day,
     Thanksgiving, Christmas. A fixed date on Sunday moves to Monday; on Saturday the Fed stays open the day before. */
  fixed(0,1);day(0,nth(0,1,3));day(1,nth(1,1,3));day(4,lastDow(4,1));fixed(5,19);fixed(6,4);
  day(8,nth(8,1,1));day(9,nth(9,1,2));fixed(10,11);day(10,nth(10,4,4));fixed(11,25);
  return hol[hk]=set;
}
const isBiz=dt=>dt.getDay()>0&&dt.getDay()<6&&!holidays(dt.getFullYear()).has(isoOf(dt));
/** The business day n business days before iso @param {string} iso @param {number} n */
export function bizBefore(iso,n){
  const [y,m,d]=iso.split('-').map(Number),dt=new Date(y,m-1,d);
  while(n>0){dt.setDate(dt.getDate()-1);if(isBiz(dt))n--}
  return isoOf(dt);
}
