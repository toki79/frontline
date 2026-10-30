import { on } from '../core/events';
import { $ } from '../ui/dom';

/* =====================================================================
   Meldungen
   ===================================================================== */
export function showMessage(t,col){
  const el=document.createElement('div'); el.textContent=t; if(col) el.style.borderLeftColor=col;
  const log=$('#log'); log.appendChild(el); while(log.children.length>4) log.removeChild(log.firstChild);
  setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),700);},7000);
}

export function init(){ on('msg',showMessage); }
