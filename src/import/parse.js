import {dict,pad} from '../core/util.js';
/* Amounts as banks print them: 1,234.56 · 1 234,56 · 1.234,56 · 1'234.56 · (12.50) · 12.50- · −12,50 · $-12.
   With both separators, the last one is the decimal point. A lone comma is a thousands separator only in 1,234 form. */
export function parseAmount(s){
  s=String(s??'').trim();if(!s||!/\d/.test(s))return NaN;
  const neg=/^\(.*\)$/.test(s)||/^[^\d]*[-−–]/.test(s)||/[-−–]\s*$/.test(s);
  let n=s.replace(/[^\d.,]/g,'');
  const lc=n.lastIndexOf(','),ld=n.lastIndexOf('.');
  if(lc>=0&&ld>=0)n=lc>ld?n.replace(/\./g,'').replace(',','.'):n.replace(/,/g,'');
  else if(lc>=0)n=/^[1-9]\d{0,2}(,\d{3})+$/.test(n)||n.split(',').length>2?n.replace(/,/g,''):n.replace(',','.');
  else if(n.split('.').length>2)n=n.replace(/\./g,'');
  const v=parseFloat(n);return isNaN(v)?NaN:neg?-v:v;
}
/* Dates: 2026-03-25, 03/25/2026 or 25.03.2026. order says which comes first in 03/04/2026 ('mdy' or 'dmy');
   without it, dots mean day first (European) and slashes month first (US). A part over 12 settles it either way. */
export function parseDate(s,order){
  s=String(s||'').trim();let m,y,mo,d;
  if(m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/)){y=+m[1];mo=+m[2];d=+m[3]}
  else if(m=s.match(/^(\d{1,2})([\/\-.])(\d{1,2})[\/\-.](\d{2,4})(?!\d)/)){
    y=+m[4];if(y<100)y+=2000;const a=+m[1],b=+m[3];
    const dayFirst=a>12?true:b>12?false:(order||(m[2]==='.'?'dmy':'mdy'))==='dmy';
    [mo,d]=dayFirst?[b,a]:[a,b];
  }
  else if(/[a-z]{3}/i.test(s)){const dt=new Date(s);if(isNaN(+dt))return null;y=dt.getFullYear();mo=dt.getMonth()+1;d=dt.getDate()}
  else return null;
  if(y<2000||mo<1||mo>12||d<1||d>new Date(y,mo,0).getDate())return null;
  return`${y}-${pad(mo)}-${pad(d)}`;
}
/* which order a column of dates uses: any first part over 12 means day first, any second part over 12 month first */
export function dateOrder(vals){
  let n=0,dots=0;
  for(const v of vals){
    const m=String(v??'').trim().match(/^(\d{1,2})([\/\-.])(\d{1,2})[\/\-.]\d{2,4}/);if(!m)continue;
    n++;if(+m[1]>12)return'dmy';if(+m[3]>12)return'mdy';if(m[2]==='.')dots++;
  }
  return n&&dots>n/2?'dmy':'mdy';
}
/* the same purchase in the same amount on the same day */
const txKey=t=>`${t.date}|${String(t.desc).toLowerCase()}|${(+t.amt).toFixed(2)}`;
/* Rows not logged yet. Each logged transaction covers one matching row, so two identical coffees on one
   statement both import. within: also drop repeats inside rows (overlapping screenshot pieces). */
export function freshRows(rows,logged,within){
  const have=dict();logged.forEach(t=>{const k=txKey(t);have[k]=(have[k]||0)+1});
  const seen=new Set();
  return rows.filter(r=>{
    const k=txKey(r);
    if(have[k]>0){have[k]--;return false}
    if(within){if(seen.has(k))return false;seen.add(k)}
    return true;
  });
}
/* The AI copies each amount as printed and says which way the money went; this sets the sign.
   When printed amounts mix plus and minus, the statement's own convention decides, as with CSVs: mostly plain
   amounts is a card statement (plain = money out), mostly minus is a bank statement (minus = money out).
   With no signs at all, the AI's out/in label decides. */
export function aiRows(res){
  const arr=Array.isArray(res)?res:(res&&res.transactions)||[];
  const amountOf=r=>typeof r.amount==='number'?r.amount:parseAmount(r.amount);
  const nums=arr.map(amountOf).filter(n=>n&&!isNaN(n)),neg=nums.filter(n=>n<0).length,pos=nums.length-neg,mixed=neg>0&&pos>0;
  return arr.map(r=>{
    const a=amountOf(r);
    return{date:parseDate(r.date),desc:String(r.description||'').trim(),amt:mixed?(pos>=neg?-a:a):r.money==='in'?Math.abs(a):r.money==='out'?-Math.abs(a):a};
  }).filter(r=>r.date&&r.desc&&!isNaN(r.amt)&&r.amt!==0&&!/\bpending\b/i.test(r.desc));
}
/** Rows of a CSV, TSV or semicolon file (the delimiter is the one the first line uses most); quotes and a BOM are handled @param {string} t */
export function parseCSV(t){
  t=t.replace(/^﻿/,'');const first=t.split(/\r?\n/,1)[0]||'';
  const D=[',','\t',';'].map(d=>({d,n:first.split(d).length})).sort((a,b)=>b.n-a.n)[0].d;
  const rows=[];let r=[],c='',q=false;
  for(let i=0;i<t.length;i++){
    const ch=t[i];
    if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++}else q=false}else c+=ch}
    else if(ch==='"')q=true;
    else if(ch===D){r.push(c);c=''}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;r.push(c);c='';if(r.some(x=>x.trim()))rows.push(r);r=[]}
    else c+=ch;
  }
  r.push(c);if(r.some(x=>x.trim()))rows.push(r);return rows;
}
/* statement text in pieces a small model can hold; long pages split on line breaks */
export function chunkText(pages,max){
  const out=[];let cur='';
  const push=t=>{if(cur&&cur.length+2+t.length>max){out.push(cur);cur=''}cur+=(cur?'\n\n':'')+t};
  pages.forEach(pg=>{
    if(pg.length<=max){push(pg);return}
    let part='';
    pg.split('\n').forEach(l=>{if(part&&part.length+1+l.length>max){push(part);part=''}part+=(part?'\n':'')+l});
    if(part)push(part);
  });
  if(cur)out.push(cur);return out;
}
/** @typedef {{date:number,desc:number,amt:number,out:number,inn:number}} ColumnMap which column holds what (-1 for none) */
/**
 * Guesses a CSV's layout: whether its first row is a header, which column holds the date, description and amount
 * (or separate money out and money in), and whether minus means money out ('neg', most banks) or in ('pos', some cards).
 * @param {string[][]} raw the rows, at least two
 * @returns {{hasH:boolean,n:number,map:ColumnMap,sign?:'neg'|'pos'}} n: the number of columns; sign only with an amount column
 */
export function guessColumns(raw){
  const hasH=!raw[0].some(x=>parseDate(x)||(!isNaN(parseAmount(x))&&/\d/.test(x)));
  const n=Math.max(...raw.map(r=>r.length)),H=hasH?raw[0].map(s=>String(s).toLowerCase()):[];
  const find=re=>H.findIndex(h=>re.test(h));
  const body=raw.slice(hasH?1:0,(hasH?1:0)+8),most=Math.ceil(body.length*.6);
  /* the first column where most of the first rows pass the test */
  const col=fn=>{for(let c=0;c<n;c++)if(body.filter(r=>fn(r[c])).length>=most)return c;return-1};
  const map=hasH?{date:find(/date/),desc:find(/desc|payee|merchant|memo|name|detail|location/),amt:find(/^amount$|^amt/),
    out:find(/debit|withdraw|money out|paid out/),inn:find(/credit|deposit|money in|paid in/)}:{date:-1,desc:-1,amt:-1,out:-1,inn:-1};
  if(hasH){const pi=find(/post/);if(pi>=0&&/date/.test(H[pi]))map.date=pi}
  if(hasH&&map.amt<0)map.amt=find(/amount/);
  if(map.date<0)map.date=col(x=>!!parseDate(x));
  /* no amount column by name: the last column that's mostly numbers */
  if(map.amt<0&&map.out<0&&map.inn<0){
    for(let c=n-1;c>=0;c--)if(body.filter(r=>!isNaN(parseAmount(r[c]))&&!parseDate(r[c])).length>=most){map.amt=c;break}
  }
  /* no description by name: the column with the most text */
  if(map.desc<0){
    let best=-1,len=0;
    for(let c=0;c<n;c++){if(c===map.date||c===map.amt)continue;const l=body.reduce((s,r)=>s+String(r[c]||'').length,0);if(l>len){len=l;best=c}}
    map.desc=best;
  }
  if(map.amt<0)return{hasH,n,map};
  let neg=0,pos=0;raw.slice(hasH?1:0).forEach(r=>{const v=parseAmount(r[map.amt]);if(v<0)neg++;else if(v>0)pos++});
  return{hasH,n,map,sign:neg>=pos?'neg':'pos'};
}
/**
 * Transactions from CSV rows with a known layout; rows without a date, description or amount are left out.
 * @param {string[][]} rows the rows without the header @param {ColumnMap} map
 * @param {string} sign which way the amount column counts money out ('neg' or 'pos') @param {string} order how dates are written ('mdy' or 'dmy')
 */
export function csvRows(rows,map,sign,order){
  const out=[];
  rows.forEach(r=>{
    const date=parseDate(r[map.date],order),desc=String(r[map.desc]||'').trim();let amt;
    if(map.amt>=0){const v=parseAmount(r[map.amt]);amt=isNaN(v)?NaN:sign==='neg'?v:-v}
    else{const o=Math.abs(parseAmount(r[map.out])||0),i=Math.abs(parseAmount(r[map.inn])||0);amt=(map.out>=0||map.inn>=0)?i-o:NaN}
    if(date&&desc&&!isNaN(amt)&&amt!==0)out.push({date,desc,amt});
  });
  return out;
}
