import { $ } from './dom';
import { G } from '../sim/state';
import { loadGame, saveMeta, serialize } from '../sim/save';
import { findBuilding } from '../sim/world';
import { cam, centerOn, VW } from '../render/camera';
import { setTab } from './panel';
import { msg } from '../core/events';

/* =====================================================================
   Spielstände im Browser (localStorage): 3 Plätze + automatisch jede Minute
   ===================================================================== */
const KEY = (s: string) => 'frontlinie.save.'+s, MKEY = (s: string) => 'frontlinie.meta.'+s;
export const SLOTS = ['1','2','3'];
function meta(slot: string){ try{ const m=localStorage.getItem(MKEY(slot)); return m?JSON.parse(m):null; }catch(e){ return null; } }
/* Spielstände werden mit gzip gepackt (CompressionStream) – die große Karte passt sonst kaum in den Browser-Speicher */
const canGz = typeof CompressionStream!=='undefined';
async function pack(str: string){
  if(!canGz) return str;
  const buf=await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(), b=new Uint8Array(buf);
  let s=''; for(let i=0;i<b.length;i+=0x8000) s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000) as any);
  return 'gz:'+btoa(s);
}
async function unpack(s: string){
  if(!s.startsWith('gz:')) return s;
  const bin=atob(s.slice(3)), b=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i);
  return await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
export async function saveTo(slot: string, quiet=false){
  if(!G||G.over) return false;
  try{ const raw=serialize(), m=JSON.stringify(saveMeta()), data=await pack(raw);   // Stand sofort festhalten, dann packen
    localStorage.setItem(KEY(slot),data); localStorage.setItem(MKEY(slot),m);
    if(!quiet) msg(`💾 Spielstand gespeichert (${slot==='auto'?'automatisch':'Platz '+slot}, ${Math.max(1,Math.round(data.length/1024))} KB).`,'#9fd88a'); return true; }
  catch(e){ if(!quiet) msg('⚠ Speichern fehlgeschlagen – der Browser-Speicher ist voll oder gesperrt.','#ff8a7a'); return false; }
}
export async function loadFrom(slot: string){
  const s=localStorage.getItem(KEY(slot)); if(!s) return false;
  try{ loadGame(await unpack(s)); }catch(e){ msg('⚠ Spielstand konnte nicht geladen werden: '+e.message,'#ff8a7a'); return false; }
  $('#log').innerHTML='';
  const hq=findBuilding(0,'hq')||G.buildings.find(b=>b.owner===0)||{x:20,y:70};
  cam.zoom=VW<700?0.85:1; centerOn(hq.x,hq.y); setTab('bau');
  msg(`📂 Spielstand geladen (${slot==='auto'?'automatisch':'Platz '+slot}).`,'#9fd88a');
  return true;
}
const fmtT=(t: number)=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
/** Liste im Menü neu zeichnen */
export function renderSaves(){
  const box=$('#saves'); if(!box) return; const can=!!G&&!G.over; let h='';
  for(const s of [...SLOTS,'auto']){ const m=meta(s), lab=s==='auto'?'Auto':'Platz '+s;
    h+=`<div class="slot"><span>${lab}: ${m?`👥 ${m.pop} · ${fmtT(m.t)} · ${new Date(m.date).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:'<i>leer</i>'}</span>`+
      (s!=='auto'?`<button data-save="${s}" ${can?'':'disabled'}>💾</button>`:'')+`<button data-load="${s}" ${m?'':'disabled'}>📂</button></div>`; }
  box.innerHTML=h;
}
export function init(onLoaded: ()=>void){
  $('#saves').addEventListener('click',e=>{ const b=(e.target as HTMLElement).closest('button') as HTMLButtonElement; if(!b||b.disabled) return;
    if(b.dataset.save){ saveTo(b.dataset.save).then(renderSaves); }
    else if(b.dataset.load) loadFrom(b.dataset.load).then(ok=>{ if(ok) onLoaded(); }); });
  renderSaves();
}
/** aus der Hauptschleife: alle 60 Spielsekunden automatisch speichern */
export function autosave(){ if(G&&!G.over&&G.t-(G.autoSaveT||0)>=60){ G.autoSaveT=G.t; saveTo('auto',true); } }
