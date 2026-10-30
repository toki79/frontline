import { $$ } from './dom';
import { ECON } from '../data/config';
import { G, newGame, setG } from '../sim/state';
import { on } from '../core/events';
import { fmt } from '../core/util';
import { findBuilding } from '../sim/world';
import { cam, centerOn, VW } from '../render/camera';
import { setTab } from './panel';
import { updateAdvisor } from '../ui/advisor';
import { diploAction, renderDiplo } from '../ui/diplomacy';
import { $ } from '../ui/dom';
import { hideTip } from '../ui/tooltips';

/* =====================================================================
   Menüs
   ===================================================================== */
export let diffSel='mittel';
/** Neues Spiel starten: Simulation anlegen, dann Kamera und Oberfläche vorbereiten */
export function startGame(diff:string, fog:boolean, mode:string){
  $('#log').innerHTML='';
  newGame(diff,fog,mode);
  const hq=findBuilding(0,'hq');
  cam.zoom = VW < 700 ? 0.85 : 1;
  centerOn(hq.x, hq.y);
  setTab('bau');
}
function showEnd(win:boolean, reason:string){
  const mm=Math.floor(G.t/60), ss=String(Math.floor(G.t%60)).padStart(2,'0');
  $('#endTitle').textContent=win?'SIEG':'NIEDERLAGE';
  $('#endTitle').style.color=win?'#9fd88a':'#ff8a7a';
  $('#endText').innerHTML=reason+`<br><br>Spielzeit: ${mm}:${ss} · Einwohner: ${Math.floor(G.players[0].pop)} (Kastrova ${Math.floor(G.players[1].pop)})<br>Einheiten gebaut: ${G.stats.built} · verloren: ${G.stats.lost} · Abschüsse: ${G.stats.kills} · Beute: ${fmt(G.stats.loot)}`;
  $('#end').classList.remove('hidden');
}
export function openDiplo(){ if(!G||G.over||G.offer) return; hideTip(); G.paused=true; $('#reply').textContent=''; renderDiplo(); $('#diplo').classList.remove('hidden'); }

export function init(){
on('gameover',showEnd);
$('#goalTxt').textContent=String(ECON.target);
$$('#diffRow button').forEach(b=>b.addEventListener('click',()=>{diffSel=b.dataset.d;$$('#diffRow button').forEach(x=>x.classList.toggle('on',x===b));}));
$('#bStart').addEventListener('click',()=>{ $('#start').classList.add('hidden'); startGame(diffSel,$('#optFog').checked,$('#optRace').checked?'race':'endless'); });
$('#bResume').addEventListener('click',()=>{ $('#start').classList.add('hidden'); if(G) G.paused=!!G.offer; });
$('#bMenu').addEventListener('click',()=>{ if(!G) return; G.paused=true; $('#bResume').style.display='block'; $('#start').classList.remove('hidden'); });
$('#bDiplo').addEventListener('click',openDiplo);
$('#bHelp').addEventListener('click',()=>{ hideTip(); if(G&&!G.over) G.paused=true; $$('.goalN').forEach(e=>e.textContent=ECON.target); $('#help').classList.remove('hidden'); });
$('#bHelpClose').addEventListener('click',()=>{ $('#help').classList.add('hidden'); if(G) G.paused=!!G.offer; });
$('#bDiploClose').addEventListener('click',()=>{ $('#diplo').classList.add('hidden'); if(G) G.paused=false; updateAdvisor(); });
$('#diploBody').addEventListener('click',e=>{const b=e.target.closest('button[data-a]'); if(b&&!b.disabled) diploAction(b.dataset.a);});
$('#bAgain').addEventListener('click',()=>{ $('#end').classList.add('hidden'); $('#bResume').style.display='none'; $('#start').classList.remove('hidden'); setG(null); });
}
