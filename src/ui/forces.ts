import { $ } from './dom';
import { dist } from '../core/util';
import { UNITS } from '../data/config';
import { applyOrder, ORDER_NAME, type OrderKind } from '../sim/missions';
import { G } from '../sim/state';
import { cam, centerOn } from '../render/camera';
import { drawIcon } from './panel';
import { refreshCmds } from './input';
import { hideTip } from './tooltips';
import { msg } from '../core/events';

/* =====================================================================
   Kräfte-Übersicht: alle eigenen Einheiten nach Art, Status, Einsatz ordern
   ===================================================================== */
const GROUPS: [string,string[]][] = [
  ['Infanterie',['inf','at','volunteer','militia']],
  ['Fahrzeuge',['ifv','mbt','mlrs','tel','spaag','jammer']],
  ['Drohnen',['drone','swarm','spy','reaper']],
  ['Luftwaffe',['jet']],
  ['Zivil & Spezial',['worker','pioneer','diplomat','truck','caravan']],
];
const PICKABLE = new Set(['inf','at','volunteer','militia','ifv','mbt','mlrs','tel','spaag','jammer','drone','swarm','spy','reaper','jet']);
export const fs: {kind: OrderKind, pick: Record<string,number>} = {kind:'hold', pick:{}};
const KINDS: [OrderKind,string,string][] = [
  ['hold','🛡 Stellung halten','hinziehen und eingraben – besser geschützt, keine Verfolgung'],
  ['clear','🔍 Gebiet klären','Feinde und Räuberlager im Umkreis ausschalten, dann halten'],
  ['assault','⚔ Angriff','vorrücken, alles im großen Umkreis angreifen – auch Gebäude'],
  ['move','➜ Sammeln','nur hinbewegen'],
];
const own = () => G.units.filter(u=>!u.dead&&u.owner===0);
/** frei = ohne Auftrag, nicht begleitend, nicht auf Patrouille, kein Kampf */
export const isFree = u => !u.order&&!u.escort&&!u.patrol&&!u.target&&(u.mode==='idle'||u.mode==='harvest'&&false)&&!u.job&&!u.pjob&&!u.mission;
function status(u){
  if(u.def.worker) return u.working?'baut':u.job?(u.job.kind==='haul'?'trägt':'unterwegs'):'wartet';
  if(u.def.pioneer&&(u.pjob||u.working)) return 'baut';
  if(u.def.diplomat) return u.mission!=null?'reist':'wartet';
  if(u.def.caravan) return 'liefert';
  if(u.def.harvester) return u.hs?'fördert':'wartet';
  if(u.mode==='recharge') return 'lädt';
  if(u.patrol) return 'klärt auf';
  if(u.target) return 'kämpft';
  if(u.order==='hold') return u.dug?'eingegraben':'hält';
  if(u.order==='clear') return 'klärt';
  if(u.order==='assault') return 'greift an';
  if(u.escort) return 'begleitet';
  if(u.lurk) return 'lauert';
  if(u.mode==='move'||u.mode==='amove') return 'unterwegs';
  return 'frei';
}
export function renderForces(){
  const all=own(); let h='<div class="row kinds">';
  for(const [k,l] of KINDS) h+=`<button data-k="${k}" class="${fs.kind===k?'on':''}">${l}</button>`;
  h+=`</div><div class="barl"><span>${KINDS.find(k=>k[0]===fs.kind)[2]}. Drohnen: FPV lauern am Ziel, Aufklärer überwachen das Gebiet.</span></div>`;
  for(const [g,types] of GROUPS){
    const rows=types.filter(t=>all.some(u=>u.type===t)); if(!rows.length) continue;
    h+=`<h4>${g}</h4>`;
    for(const t of rows){ const us=all.filter(u=>u.type===t), free=us.filter(isFree).length, st={};
      for(const u of us){ const s=status(u); st[s]=(st[s]||0)+1; }
      const n=Math.min(fs.pick[t]||0,us.length);
      h+=`<div class="frow"><canvas data-icon="${t}" width="84" height="84"></canvas><div class="fi"><b>${UNITS[t].name}</b><span class="dim">${free} frei / ${us.length}</span><br><small>${Object.entries(st).map(([k,v])=>`${v} ${k}`).join(' · ')}</small></div>`+
        (PICKABLE.has(t)?`<button data-m="${t}">−</button><b class="n">${n}</b><button data-p="${t}">+</button><button data-all="${t}">alle</button>`:'')+
        `<button data-loc="${t}" title="Zeigen">📍</button></div>`; }
  }
  const tot=Object.entries(fs.pick).reduce((s,[t,n])=>s+Math.min(n,all.filter(u=>u.type===t).length),0);
  h+=`<button class="big" id="fGo" ${tot?'':'disabled'}>🎯 ${tot} Einheit${tot===1?'':'en'}: ${ORDER_NAME[fs.kind]} – Ziel auf der Karte antippen</button>`;
  if(!all.length) h='<div class="barl"><span>Keine Einheiten.</span></div>';
  $('#forcesBody').innerHTML=h;
  $('#forcesBody').querySelectorAll('canvas[data-icon]').forEach((c: any)=>drawIcon(c,c.dataset.icon));
}
export function openForces(){ if(!G||G.over) return; hideTip(); G.paused=true; renderForces(); $('#forces').classList.remove('hidden'); }
function close(){ $('#forces').classList.add('hidden'); if(G) G.paused=false; }
/** Einheiten für einen Einsatz auswählen: je Art die nächstgelegenen, freie zuerst */
export function pickUnits(pick: Record<string,number>, x, y){
  const all=own(), out=[];
  for(const [t,n] of Object.entries(pick)){ if(!n) continue;
    const c=all.filter(u=>u.type===t).sort((a,b)=>(isFree(b)?1:0)-(isFree(a)?1:0)||dist(a.x,a.y,x,y)-dist(b.x,b.y,x,y));
    out.push(...c.slice(0,n)); }
  return out;
}
/** Kartentipp mit offenem Einsatz */
export function issuePending(x,y){
  const p=G.orderPending; G.orderPending=null; if(!p) return false;
  const us=pickUnits(p.pick,x,y); if(!us.length) return true;
  applyOrder(us,p.kind,x,y); G.sel=us; fs.pick={};
  msg(`🎯 ${us.length} Einheit${us.length===1?'':'en'}: ${ORDER_NAME[p.kind]}.`,'#9fd88a'); refreshCmds(); return true;
}
const cycle: Record<string,number> = {};
function locate(t){
  const us=own().filter(u=>u.type===t); if(!us.length) return;
  cycle[t]=((cycle[t]??-1)+1)%us.length; const u=us[cycle[t]];
  close(); centerOn(u.x,u.y); G.sel=us.length<=12?us:[u]; refreshCmds();
  msg(`📍 ${UNITS[t].name} ${cycle[t]+1}/${us.length}: ${status(u)}${us.length>1?' – nochmal 📍 für den nächsten':''}.`);
  void cam;
}
export function init(){
  $('#bForces').addEventListener('click',openForces);
  $('#bForcesClose').addEventListener('click',close);
  $('#forcesBody').addEventListener('click',e=>{ const b=(e.target as HTMLElement).closest('button') as HTMLButtonElement; if(!b||b.disabled) return; const d=b.dataset, all=own();
    if(d.k) fs.kind=d.k as OrderKind;
    else if(d.p){ fs.pick[d.p]=Math.min((fs.pick[d.p]||0)+1,all.filter(u=>u.type===d.p).length); }
    else if(d.m){ fs.pick[d.m]=Math.max(0,(fs.pick[d.m]||0)-1); }
    else if(d.all){ const us=all.filter(u=>u.type===d.all), free=us.filter(isFree).length; fs.pick[d.all]=fs.pick[d.all]===free?us.length:free||us.length; }
    else if(d.loc){ locate(d.loc); return; }
    else if(b.id==='fGo'){ G.orderPending={kind:fs.kind, pick:{...fs.pick}}; close(); refreshCmds(); return; }
    renderForces(); });
}
