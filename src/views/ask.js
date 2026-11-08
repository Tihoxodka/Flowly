import {LOCAL_MODEL,aiName,aiSetup,claudeErr,sampleCaps} from '../ai/caps.js';
import {askRules,spendingFacts} from '../ai/facts.js';
import {T,monl} from '../core/i18n.js';
import {html,raw} from '../core/html.js';
import {$,$$,esc} from '../core/util.js';
import {state} from '../state.js';
const ASK_SUGGEST=['Where did my money go this month?','What do I pay for every month?','How is this month different from usual?','Where could I cut back?'];
/* the conversation, and the answer being written (with stop()) */
let askLog=[],askRun=null;
/** The AI's answer as HTML: **bold**, lists and paragraphs; everything else is escaped text @param {string} t */
function md(t){
  let h='',ul=false;
  for(const l of esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').split('\n')){
    const m=l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if(m){if(!ul){h+='<ul>';ul=true}h+=`<li>${m[1]}</li>`}
    else{if(ul){h+='</ul>';ul=false}if(l.trim())h+=`<p>${l.replace(/^#+\s*/,'')}</p>`}
  }
  return raw(h+(ul?'</ul>':''));
}
/** The Ask panel on the Trends tab, before the AI is checked */
export const askHtml=()=>html`<div class="sec" id="ask"><h2>${T('Ask about your spending')}</h2><div id="askbody"><p class="muted small">${
  T('Checking for the AI…')}</p></div></div>`;
/** one message in the conversation @param {{role:string,content:string,note?:string}} m */
const askMsg=m=>m.role==='user'?html`<div class="msg me">${m.content}</div>`
  :html`<div class="msg ai">${m.content?md(m.content):html`<p class="muted">${T('Thinking…')}</p>`}${m.note?html`<p class="muted">${m.note}</p>`:''}</div>`;
/** Redraws the conversation and the buttons' state */
function drawAsk(){
  const l=$('#asklog');if(!l)return;
  l.innerHTML=html`${askLog.map(askMsg)}`;
  l.hidden=!askLog.length;
  const busy=!!askRun;$('#askgo').disabled=busy;$('#askstop').hidden=!busy;$('#askclr').hidden=busy||!askLog.length;
  $$('[data-askq]').forEach(b=>b.disabled=busy);
}
/** The panel once an AI is there: who answers, the conversation, suggested questions and the question box @param {AiCaps} c */
const askPanel=c=>html`<p class="muted small">${
  c.local?T('Answered on this Mac by {model}. Nothing leaves your computer.',{model:LOCAL_MODEL}):T('Answered by Claude.')} ${
  T('The app works out the totals for {month} and the 5 months before it, and the AI explains them, so double-check anything important.',{month:monl(state.view.m)})}</p>
  <div class="chatlog" id="asklog"></div>
  <div class="row" style="margin-top:10px">${ASK_SUGGEST.map(q=>html`<button class="btn sm" type="button" data-askq="${T(q)}">${T(q)}</button>`)}</div>
  <form class="row" id="askf" autocomplete="off"><input class="grow" id="askq" placeholder="${T('Ask anything about your spending')}" aria-label="${
    T('Your question')}"><button class="btn pri" type="submit" id="askgo">${T('Ask')}</button><button class="btn" type="button" id="askstop" hidden>${
    T('Stop')}</button><button class="btn ghost" type="button" id="askclr">${T('Clear')}</button></form>`;
/** Checks for an AI and sets up the Ask panel */
export async function wireAsk(){
  const box=$('#askbody');if(!box)return;
  const c=await sampleCaps();if(!$('#askbody'))return;
  if(!c?.chat){
    if(c?.desktop)box.innerHTML=html`<p class="muted small">${aiSetup(c)}</p><button class="btn sm" data-act="askchk">${
      T('Check again')}</button>`;else $('#ask').hidden=true;
    return;
  }
  box.innerHTML=askPanel(c);
  const ask=q=>{
    q=q.trim();if(!q||askRun)return;
    askLog.push({role:'user',content:q});const a={role:'assistant',content:''};askLog.push(a);
    const msgs=[{role:'system',content:askRules()+spendingFacts()},...askLog.slice(-9,-1).map(({role,content})=>({role,content}))];
    askRun=c.chat(msgs,t=>{a.content=t;drawAsk()});drawAsk();
    const why=e=>e?.code==='cancelled'?T('Stopped.'):['offline','no_model','timeout','rate_limited','not_granted','sampling_disabled'].includes(e?.code)
      ?claudeErr(e,T('that')):T('{ai} couldn’t answer that. Try again.',{ai:aiName()});
    askRun.done.then(t=>{a.content=t},e=>{a.content=e?.text||'';a.note=why(e)})
      .finally(()=>{askRun=null;if(!a.content&&!a.note)a.note=T('No answer came back. Try again.');drawAsk()});
  };
  $('#askf').onsubmit=e=>{e.preventDefault();const q=$('#askq').value;$('#askq').value='';ask(q)};
  box.querySelectorAll('[data-askq]').forEach(b=>b.onclick=()=>ask(b.dataset.askq));
  $('#askstop').onclick=()=>askRun?.stop();
  $('#askclr').onclick=()=>{askLog=[];drawAsk()};
  drawAsk();
}
