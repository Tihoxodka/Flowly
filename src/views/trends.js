import {NOSPEND} from '../core/constants.js';
import {monthIndex} from '../core/dates.js';
import {f0,f2,kfmt} from '../core/format.js';
import {T,TN,cn,mon,monl} from '../core/i18n.js';
import {html} from '../core/html.js';
import {$$,dict,pad} from '../core/util.js';
import {state} from '../state.js';
import {askHtml} from './ask.js';
import {card} from './shared.js';
/** a round number for the top of a chart's axis @param {number} v */
const niceMax=v=>{if(v<=0)return 100;const p=Math.pow(10,Math.floor(Math.log10(v))),n=v/p;return(n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p};
/** an SVG path for a bar with rounded top corners */
function roundTop(x,y,w,h,r){r=Math.min(r,h,w/2);return`M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`}
/** "Nov" from "2026-11" @param {string} m */
const monOf=m=>mon(+m.slice(5)-1);

/** @typedef {{m:string,by:Record<string,number>,tags:Record<string,number>,n:number,total:number}} MonthSpend logged spending in one month */
/** @param {string} m @returns {MonthSpend} */
function monthSpend(m){
  const by=dict(),tags=dict();let n=0;
  (state.tx[m]?.items||[]).forEach(t=>{if(NOSPEND.includes(t.cat))return;by[t.cat]=(by[t.cat]||0)-t.amt;if(t.tag)tags[t.tag]=(tags[t.tag]||0)-t.amt;n++});
  return{m,by,tags,n,total:Object.values(by).reduce((s,v)=>s+v,0)};
}
/** @typedef {{names:string[],col:(s:string,i:number)=>string,val:(d:MonthSpend,s:string)=>number}} Series the top categories, and Other */
/** The biggest categories over the months, with the rest as Other @param {MonthSpend[]} data @returns {Series} */
function topSeries(data){
  const tot=dict();data.forEach(d=>Object.entries(d.by).forEach(([k,v])=>tot[k]=(tot[k]||0)+v));
  const ranked=Object.keys(tot).sort((a,b)=>tot[b]-tot[a]),top=ranked.slice(0,ranked.length>5?4:5);
  return{names:[...top,...(ranked.length>top.length?['Other']:[])],col:(s,i)=>s==='Other'?'var(--s0)':`var(--s${i+1})`,
    val:(d,s)=>s==='Other'?Object.entries(d.by).filter(([k])=>!top.includes(k)).reduce((a,[,v])=>a+v,0):(d.by[s]||0)};
}
/** Stacked bars of logged spending by month and category @param {MonthSpend[]} data @param {Series} S */
function spendChart(data,S){
  const W=680,H=250,ml=64,mr=8,mt=10,mb=28,iw=W-ml-mr,ih=H-mt-mb,ymax=niceMax(Math.max(...data.map(d=>d.total),1)),band=iw/data.length,bw=Math.min(56,band*.58);
  const y=v=>mt+ih-v/ymax*ih;
  const grid=[0,1,2,3,4].map(i=>{const v=ymax*i/4,yy=y(v);return html`<line class="${i?'gl':'base'}" x1="${ml}" x2="${W-mr}" y1="${yy}" y2="${yy}"/><text x="${
    ml-8}" y="${yy+4}" text-anchor="end">${kfmt(v)}</text>`});
  const bars=data.map((d,i)=>{
    const x=ml+band*i+(band-bw)/2,segs=S.names.map((s,j)=>({s,j,v:S.val(d,s)})).filter(g=>g.v>0.5);let acc=0;
    const parts=segs.map((g,k)=>{
      const y0=y(acc),y1=y(acc+g.v);acc+=g.v;const h=Math.max(1,y0-y1-(k?2:0)),tip=`${cn(g.s)} · ${monOf(d.m)}: ${f2(g.v)}`;
      return k===segs.length-1?html`<path d="${roundTop(x,y1,bw,h,4)}" fill="${S.col(g.s,g.j)}" data-tip="${tip}"/>`
        :html`<rect x="${x}" y="${y1}" width="${bw}" height="${h}" fill="${S.col(g.s,g.j)}" data-tip="${tip}"/>`;
    });
    const total=d.total>0?html`<text x="${x+bw/2}" y="${y(d.total)-6}" text-anchor="middle" style="fill:var(--ink)">${f0(d.total)}</text>`:'';
    return html`${parts}${total}<text x="${x+bw/2}" y="${H-8}" text-anchor="middle">${monOf(d.m)}</text>`;
  });
  return html`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${T('Logged spending by month and category')}">${grid}${bars}</svg>`;
}
/** Net worth over time, one point per month with a snapshot */
function netWorth(){
  const nw=Object.entries(state.plan.nw||{}).sort((a,b)=>a[0]<b[0]?-1:1).map(([k,v])=>({k,v:v.a-v.d,dt:v.dt}));
  if(nw.length<2)return html`<div class="empty">${
    nw.length?T('Net worth history builds one point per month as you update balances. First snapshot: {amt} in {month}.',
    {amt:f0(nw[0].v),month:monl(+nw[0].k.slice(5)-1)}):T('Net worth history builds one point per month as you update balances.')}</div>`;
  const W=680,H=200,l=64,t=16,b=28,r=40,lo=Math.min(...nw.map(p=>p.v)),hi=Math.max(...nw.map(p=>p.v)),pad_=(hi-lo)*.15||Math.abs(hi)*.05||100;
  const y0=lo-pad_,y1=hi+pad_,i0=monthIndex(nw[0].k+'-01'),span=Math.max(1,monthIndex(nw[nw.length-1].k+'-01')-i0);
  const X=k=>l+(monthIndex(k+'-01')-i0)/span*(W-l-r),Y=v=>t+(1-(v-y0)/(y1-y0))*(H-t-b);
  const grid=[0,1,2,3].map(i=>{const v=y0+(y1-y0)*i/3;return html`<line class="gl" x1="${l}" x2="${W-r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${l-8}" y="${
    Y(v)+4}" text-anchor="end">${kfmt(v)}</text>`});
  const points=nw.map((p,i)=>html`<circle cx="${X(p.k)}" cy="${Y(p.v)}" r="${
    i===nw.length-1?5:4}" fill="var(--s1)" stroke="var(--surface)" stroke-width="2"/><circle cx="${
    X(p.k)}" cy="${Y(p.v)}" r="14" fill="transparent" data-tip="${monOf(p.k)} ${p.k.slice(0,4)}: ${f0(p.v)}"/><text x="${X(p.k)}" y="${
      H-8}" text-anchor="middle">${monOf(p.k)}</text>`);
  const L=nw[nw.length-1];
  return html`<div class="viz"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${T('Net worth over time')}">${
    grid}<polyline fill="none" stroke="var(--s1)" stroke-width="2" points="${
    nw.map(p=>`${X(p.k)},${Y(p.v)}`).join(' ')}"/>${points}<text x="${X(L.k)}" y="${
      Y(L.v)-12}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${f0(L.v)}</text></svg></div>`;
}
/** The month-by-month table under the chart @param {MonthSpend[]} data @param {Series} S @param {string[]} tags */
function trendsTable(data,S,tags){
  const row=d=>html`<tr><td>${monOf(d.m)} ${d.m.slice(0,4)}</td>${S.names.map(s=>html`<td class="num">${
    S.val(d,s)?f0(S.val(d,s)):''}</td>`)}<td class="num"><b>${
    f0(d.total)}</b></td><td class="num">${d.n?f2(d.total/new Date(+d.m.slice(0,4),+d.m.slice(5),0).getDate()):''}</td>${
    tags.map(t=>html`<td class="num">${d.tags[t]?f0(d.tags[t]):''}</td>`)}</tr>`;
  return html`<div class="scroll" style="margin-top:10px"><table><thead><tr><th>${T('Month')}</th>${S.names.map(s=>html`<th class="num">${
    cn(s)}</th>`)}<th class="num">${
    T('Total')}</th><th class="num">${T('Per day')}</th>${tags.map(t=>html`<th class="num">${T('Tag: {tag}',{tag:t})}</th>`)}</tr></thead><tbody>${
      data.map(row)}</tbody></table></div>`;
}
/** The Trends tab: the last 6 months of logged spending, and net worth */
export function vTrends(){
  const end=state.view.y*12+state.view.m,ms=[];for(let i=end-5;i<=end;i++)ms.push(`${Math.floor(i/12)}-${pad(i%12+1)}`);
  const data=ms.map(monthSpend),S=topSeries(data),allTags=[...new Set(data.flatMap(d=>Object.keys(d.tags)))];
  const a3=data.filter(d=>d.n).slice(-3);
  const avg=card(T('Average, last {months} with spending',{months:`${a3.length||0} ${TN(a3.length||0,'month','months')}`}),
    a3.length?f0(a3.reduce((s,d)=>s+d.total,0)/a3.length):'—');
  const tagCards=allTags.map(t=>card(T('Tagged {tag}, 6 months',{tag:t}),f0(data.reduce((s,d)=>s+(d.tags[t]||0),0))));
  const legend=S.names.map((s,i)=>html`<span><i style="background:${S.col(s,i)}"></i>${cn(s)}</span>`);
  return html`${askHtml()}<div class="cards">${card(T('{month}: logged',{month:monl(state.view.m)}),f0(data[5].total))}${avg}${tagCards}</div>
  <div class="sec"><h2>${T('Logged spending by month')}</h2><div class="viz"><div class="lg">${legend}</div>${spendChart(data,S)}</div>
  ${trendsTable(data,S,allTags)}
  <p class="muted small">${T('Logged spending only. Bills and card payments aren’t included, and partial months show as partial.')}</p></div>
  <div class="sec"><h2>${T('Net worth')}</h2>${netWorth()}</div>`;
}
/** Tooltips on the charts' bars and points */
export function wireTips(){
  $$('.viz').forEach(v=>{
    let tt=null;
    v.addEventListener('pointermove',e=>{
      const t=/** @type {any} */(e.target).closest('[data-tip]');if(!t){tt&&(tt.hidden=true);return}
      if(!tt){tt=document.createElement('div');tt.className='tt';v.appendChild(tt)}
      const r=v.getBoundingClientRect();tt.hidden=false;tt.textContent=t.dataset.tip.replace(/&amp;/g,'&');
      tt.style.left=Math.min(r.width-60,Math.max(60,e.clientX-r.left))+'px';tt.style.top=(e.clientY-r.top-6)+'px';
    });
    v.addEventListener('pointerleave',()=>{tt&&(tt.hidden=true)});
  });
}
