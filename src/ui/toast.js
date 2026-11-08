import {T} from '../core/i18n.js';
/* a short message at the bottom; with undo, it has an Undo button and stays a little longer */
export function toast(t,undo){
  const e=document.createElement('div');e.className='toast';e.setAttribute('role','status');e.textContent=t;
  if(undo){const b=document.createElement('button');b.type='button';b.className='lnk';b.textContent=T('Undo');b.onclick=()=>{e.remove();undo()};e.append(b)}
  document.body.appendChild(e);setTimeout(()=>e.remove(),undo?7000:2600);
}
