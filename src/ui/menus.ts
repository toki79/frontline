import { $$ } from './dom';
import { AIS, ECON, MAPTYPES } from '../data/config';
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
import { continueGame } from '../sim/combat';
import { init as initSaves, renderSaves } from '../ui/saves';

/* =====================================================================
   Menüs
   ===================================================================== */
export let diffSel='mittel';
/** Neues Spiel starten: Simulation anlegen, dann Kamera und Oberfläche vorbereiten */
export let mapSel='zufall';
export function startGame(diff:string, fog:boolean, mode:string, opts:{seed?:number,map?:string}={}){
  $('#log').innerHTML='';
  newGame(diff,fog,mode,opts);
  const hq=findBuilding(0,'hq');
  cam.zoom = VW < 700 ? 0.85 : 1;
  centerOn(hq.x, hq.y);
  setTab('bau');
}
function showEnd(win:boolean, reason:string){
  const mm=Math.floor(G.t/60), ss=String(Math.floor(G.t%60)).padStart(2,'0');
  $('#endTitle').textContent=win?'SIEG':'NIEDERLAGE';
  $('#endTitle').style.color=win?'#9fd88a':'#ff8a7a';
  $('#endText').innerHTML=reason+`<br><br>Karte: ${MAPTYPES[G.mapType]?.name||'Flusstal'} · Nr. ${G.seed??'–'}<br>Spielzeit: ${mm}:${ss} · Einwohner: ${Math.floor(G.players[0].pop)} (${AIS.map(p=>`${G.players[p].short} ${Math.floor(G.players[p].pop)}`).join(', ')})<br>Einheiten gebaut: ${G.stats.built} · verloren: ${G.stats.lost} · Abschüsse: ${G.stats.kills} · Beute: ${fmt(G.stats.loot)}`;
  const c=!!(G.result&&G.result.cont); $('#bContinue').style.display=c?'block':'none';
  if(c) $('#bContinue').textContent=win?'▶ Weiterspielen (freies Spiel)':'▶ Trotzdem weiterspielen';
  $('#end').classList.remove('hidden');
}
export function openDiplo(){ if(!G||G.over||G.offer) return; hideTip(); G.paused=true; $('#reply').textContent=''; G.tribLast={}; renderDiplo(); $('#diplo').classList.remove('hidden'); }

export function init(){
on('gameover',showEnd);
$('#goalTxt').textContent=String(ECON.target);
$$('#diffRow button').forEach(b=>b.addEventListener('click',()=>{diffSel=b.dataset.d;$$('#diffRow button').forEach(x=>x.classList.toggle('on',x===b));}));
const maps:[string,string,string][]=[['zufall','🎲 Zufall','Kartentyp nach Kartennummer – jedes Spiel anders.'],...Object.entries(MAPTYPES).map(([k,m]):[string,string,string]=>[k,`${m.icon} ${m.name}`,m.desc])];
$('#mapRow').innerHTML=maps.map(([k,l])=>`<button data-m="${k}" class="${k===mapSel?'on':''}">${l}</button>`).join('');
const mapDesc=()=>{ $('#mapDesc').textContent=maps.find(m=>m[0]===mapSel)[2]; }; mapDesc();
$$('#mapRow button').forEach(b=>b.addEventListener('click',()=>{ mapSel=b.dataset.m; $$('#mapRow button').forEach(x=>x.classList.toggle('on',x===b)); mapDesc(); }));
$('#bStart').addEventListener('click',()=>{ $('#start').classList.add('hidden'); const sv=parseInt(($('#optSeed') as HTMLInputElement).value,10);
  startGame(diffSel,$('#optFog').checked,$('#optRace').checked?'race':'endless',{seed:sv>0?sv:undefined, map:mapSel==='zufall'?undefined:mapSel}); });
$('#bResume').addEventListener('click',()=>{ $('#start').classList.add('hidden'); if(G) G.paused=!!G.offer; });
$('#bMenu').addEventListener('click',()=>{ if(!G) return; G.paused=true; $('#bResume').style.display='block'; renderSaves(); $('#start').classList.add('ingame'); $('#start').classList.remove('hidden'); });
initSaves(()=>{ $('#start').classList.add('hidden'); $('#end').classList.add('hidden'); $('#bResume').style.display='block'; if(G) G.paused=false; });
$('#bDiplo').addEventListener('click',openDiplo);
$('#bHelp').addEventListener('click',()=>{ hideTip(); if(G&&!G.over) G.paused=true; $$('.goalN').forEach(e=>e.textContent=ECON.target); $('#help').classList.remove('hidden'); });
$('#bHelpClose').addEventListener('click',()=>{ $('#help').classList.add('hidden'); if(G) G.paused=!!G.offer; });
$('#bDiploClose').addEventListener('click',()=>{ $('#diplo').classList.add('hidden'); if(G) G.paused=false; updateAdvisor(); });
$('#diploBody').addEventListener('click',e=>{const b=e.target.closest('button[data-a]'); if(b&&!b.disabled) diploAction(b.dataset.a);});
$('#bContinue').addEventListener('click',()=>{ if(continueGame()){ $('#end').classList.add('hidden'); updateAdvisor(); } });
$('#bAgain').addEventListener('click',()=>{ $('#start').classList.remove('ingame'); $('#end').classList.add('hidden'); $('#bResume').style.display='none'; $('#start').classList.remove('hidden'); setG(null); });
}
