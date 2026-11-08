import {html,raw,TH} from '../core/html.js';
import {T} from '../core/i18n.js';
/* AI for reading statements and talking about spending.
   On claude.ai it's Claude (the sample capability). In the Mac app it's a small model running locally in Ollama:
   nothing leaves the computer. sampleCaps() hides the difference: s.json() reads transactions, chat() answers questions */
export const DESK=window.flowlyDesktop||null;
/** Who reads statements and answers here, for messages: the local AI or Claude */
export const aiName=()=>DESK?T('The local AI'):'Claude';
/* local models, best first; the first one installed in Ollama is used. gemma3:4b is the one older installs pulled. */
const LOCAL_MODELS=['gemma4:12b','gemma3:4b'];
/** The local model in use: the first of LOCAL_MODELS installed (set by sampleCaps()) */
export let LOCAL_MODEL=LOCAL_MODELS[0];
/* the Mac app reads PDFs up to this size (main.js has the same limits) */
export const PDF_MAX_MB=25,PDF_MAX_PAGES=60;
const API_TYPES=['image/jpeg','image/png','image/webp','image/gif'];
async function forApi(b){
  let bm;try{bm=await createImageBitmap(b)}catch(e){throw{code:'image_rejected'}}
  const w=bm.width,h=bm.height,s=Math.min(1,1568/Math.max(w,h));let out=b;
  if(s<1||!API_TYPES.includes(b.type)||b.size>3.5e6){
    const c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);
    c.getContext('2d').drawImage(bm,0,0,c.width,c.height);out=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));
  }
  bm.close();
  const data=await new Promise((r,j)=>{const fr=new FileReader();fr.onload=()=>r(String(fr.result).split(',')[1]);fr.onerror=j;fr.readAsDataURL(out)});
  return{type:out.type,data};
}
/* the JSON the local model must answer with: the transactions it found */
const TX_SCHEMA={type:'object',required:['transactions'],properties:{transactions:{type:'array',items:{type:'object',
  properties:{date:{type:'string'},description:{type:'string'},amount:{type:'number'},money:{type:'string',enum:['out','in']}},
  required:['date','description','amount','money']}}}};
/* a small model reads one image at a time best, so each picture is its own call */
const deskSample={json:async(prompt,o={})=>{
  const imgs=o.images?[...o.images]:[],all=[];
  const one=async images=>{
    const r=await DESK.json({model:LOCAL_MODEL,prompt,images,schema:TX_SCHEMA});
    if(!r.ok)throw{code:r.code,message:r.message||''};
    all.push(...(r.data?.transactions||[]));
  };
  if(!imgs.length)await one([]);
  for(let i=0;i<imgs.length;i++){o.onPart?.(i+1,imgs.length);await one([(await forApi(imgs[i])).data])}
  return{transactions:all};
}};
/** What the AI can do here, or null when there's none @returns {Promise<AiCaps|null>} */
export async function sampleCaps(){
  if(DESK){
    const st=await DESK.status().catch(()=>({running:false,models:[]}));
    const have=LOCAL_MODELS.find(m=>st.models?.includes(m));
    if(!st.running||!have)return{desktop:true,s:null,img:null,why:st.running?'model':'off'};
    LOCAL_MODEL=have;
    const chat=(messages,onText)=>{
      const h=DESK.ask({model:LOCAL_MODEL,messages},onText);
      return{stop:()=>DESK.stop(h.id),done:h.done.then(r=>{if(!r.ok)throw{code:r.code,message:r.message,text:r.text};return r.text})};
    };
    return{desktop:true,local:true,s:deskSample,img:{maxCount:10,maxInputBytes:50e6,mediaTypes:API_TYPES},pdf:true,chunk:6000,chat};
  }
  try{
    const s=window.claude?await claude.use('sample'):null;if(!s)return null;const l=await s.limits().catch(()=>null);
    /* Claude takes the facts as the first user message */
    const chat=(messages,onText)=>{
      const ctl=new AbortController(),[first,...rest]=messages;
      const done=s([{role:'user',content:first.content},...rest],{onText:({text})=>onText(text),signal:ctl.signal,cache:false}).then(r=>r.text);
      return{stop:()=>ctl.abort(),done};
    };
    return{s,img:l?.images||null,chunk:50000,chat};
  }catch(e){return null}
}
/* what to show when the Mac app's local AI isn't ready */
export const aiSetup=c=>{
  const cmd=html`<code>ollama pull ${LOCAL_MODEL}</code>`;
  return c?.why==='off'?TH('Optional: reading PDFs and screenshots, and asking about your spending, use a free AI that runs on this Mac. To turn it on, install {ollama}, run {cmd} in Terminal, and keep the Ollama app open. Everything else works without it. If you already have Ollama, open it and check again.',
    {ollama:raw('<a href="https://ollama.com" target="_blank" rel="noopener">Ollama</a>'),cmd})
    :TH('Ollama is running but doesn’t have {model} yet. In Terminal, run {cmd}, then check again.',{model:LOCAL_MODEL,cmd});
};
/** What to tell someone when the AI fails @param {{code?:string,message?:string}} e @param {string} what what was being read ("that PDF") */
export function claudeErr(e,what){
  const c=e&&e.code;
  if(c==='not_granted'||c==='sampling_disabled')return T('Claude isn’t allowed for this page. You can still import a CSV.');
  if(c==='offline')return T('Ollama isn’t running. Open the Ollama app, then try again.');
  if(c==='no_model')return T('Ollama doesn’t have {model}. In Terminal, run: ollama pull {model}',{model:LOCAL_MODEL});
  if(c==='timeout')return T('The local AI took too long. Try a shorter statement or fewer screenshots.');
  if(c==='pdf_scan')return T('That PDF has no text in it, so it’s probably a scan. Take screenshots of its pages and import those instead.');
  if(c==='pdf_locked')return T('That PDF is password-protected. Save an unlocked copy and try again.');
  if(c==='pdf_big')return T('That PDF is too big to read here (over {mb} MB or {pages} pages). Save just the pages with transactions and try again.',{mb:PDF_MAX_MB,pages:PDF_MAX_PAGES});
  if(c==='pdf_error')return T('Couldn’t open that PDF.');
  if(c==='too_long')return T('That’s too many transactions at once. Try fewer screenshots.');
  if(c==='refused')return T('{ai} wouldn’t read {what}. Try a different one, or use CSV.',{ai:aiName(),what});
  if(c==='image_rejected')return T('{ai} couldn’t open that image. Use a PNG or JPEG screenshot.',{ai:aiName()});
  if(c==='rate_limited')return T('Claude is busy or you’ve reached your usage limit. Try again later.');
  if(c==='invalid_json'||c==='empty_completion')return T('{ai} couldn’t find transactions in {what}.',{ai:aiName(),what});
  if(c==='cancelled')return'';
  if(c==='ai_error'&&e.message)return T('{ai} ran into a problem: {msg}',{ai:aiName(),msg:e.message});
  return T('{ai} could not read {what}. Try again, or use CSV.',{ai:aiName(),what});
}
