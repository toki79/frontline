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
import { reinfOf } from '../sim/reinforce';
import { dissolveGroup, groupState, groupsOf, makeGroup, members } from '../sim/groups';

/* =====================================================================
   Kräfte-Übersicht: alle eigenen Einheiten nach Art, Status, Einsatz ordern
   ===================================================================== */
const GROUPS: [string,string[]][] = [
  ['Infanterie',['inf','at','para','volunteer','militia']],
  ['Fahrzeuge',['apc','amphib','ifv','mbt','mlrs','tel','spaag','jammer']],
  ['Drohnen',['drone','swarm','spy','reaper']],
  ['Luftwaffe',['jet']],
  ['Zivil & Spezial',['worker','pioneer','diplomat','truck','caravan']],
];
const PICKABLE = new Set(['inf','at','para','apc','amphib','volunteer','militia','ifv','mbt','mlrs','tel','spaag','jammer','drone','swarm','spy','reaper','jet']);
export const fs: {kind: OrderKind, pick: Record<string,number>} = {kind:'hold', pick:{}};
const KINDS: [OrderKind,string,string][] = [
  ['hold','🛡 Stellung halten','hinziehen und eingraben – besser geschützt, keine Verfolgung, kein Rückzug: bis zum letzten Mann'],
  ['clear','🔍 Gebiet klären','Feinde und Räuberlager im Umkreis ausschalten, dann halten'],
  ['assault','⚔ Angriff','vorrücken, alles im großen Umkreis angreifen – auch Gebäude'],
  ['move','➜ Sammeln','nur hinbewegen'],
];
const own = () => G.units.filter(u=>!u.dead&&u.owner===0);
/** frei = ohne Auftrag, nicht begleitend, nicht auf Patrouille, kein Kampf */
export const isFree = u => !u.grp&&!u.order&&!u.escort&&!u.patrol&&!u.target&&(u.mode==='idle'||u.mode==='harvest'&&false)&&!u.job&&!u.pjob&&!u.mission;
function status(u){
  if(u.def.worker) return u.working?'baut':u.job?(u.job.kind==='haul'?'trägt':'unterwegs'):'wartet';
  if(u.def.pioneer&&(u.pjob||u.working)) return 'baut';
  if(u.def.diplomat) return u.mission!=null?'reist':'wartet';
  if(u.def.caravan) return 'liefert';
  if(u.def.harvester) return u.hs?'fördert':'wartet';
  if(u.carried) return u.carrier&&u.carrier.units?'im Flug':'an Bord';
  if(u.mode==='board') return 'steigt ein';
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
function reinfHtml(){
  const R=reinfOf(0), wait=R.q.length, queued=Object.values(G.players[0].q).flat().filter((i: any)=>i&&i.re).length;
  return `<h4>🔁 Verluste ersetzen</h4><div class="grp" style="border-color:#3a5a2a;background:#141c10"><div class="gh"><span>Gefallene Einheiten ohne Verband automatisch nachbauen</span>
    <span><button data-rein="1" class="${R.on?'on':''}" style="${R.on?'border-color:var(--acc);color:var(--acc)':''}">An</button> <button data-rein="0" style="${!R.on?'border-color:var(--acc);color:var(--acc)':''}">Aus</button></span></div>
    <div class="dim" style="font-size:12px;margin-top:4px">Für Verbände einzeln einstellbar (🔁 beim Verband). Ersatz kostet normal und stößt danach zum Verband.${queued?` · ${queued} im Bau`:''}${wait?` · ${wait} wartet auf Geld oder Platz`:''}</div></div>`;
}
function groupsHtml(){
  const gs=groupsOf(0); let h='<h4>🎖 Verbände</h4>';
  if(!gs.length) return h+'<div class="barl"><span>Noch keine Verbände. Einheiten unten mit −/+ zusammenstellen und „🎖 Als Verband“ tippen – oder auf der Karte mehrere wählen und 🎖 tippen. Infanterie, Fahrzeuge, Flugabwehr und Drohnen gemischt ergeben <b>verbundene Waffen</b>: mehr Kampfkraft, weniger Verluste.</span></div>';
  for(const g of gs){ const s=groupState(g), cnt={}; for(const u of s.ms){ const n=u.def.name.replace(/\u00AD/g,''); cnt[n]=(cnt[n]||0)+1; }
    const hp=s.ms.reduce((a,u)=>a+u.hp,0)/Math.max(1,s.ms.reduce((a,u)=>a+u.maxHp,0)), stt={}; for(const u of s.ms){ const x=status(u); stt[x]=(stt[x]||0)+1; }
    h+=`<div class="grp"><div class="gh"><b>🎖 ${g.name}</b><span>${Math.round(hp*100)} %</span></div>
      <div class="dim" style="font-size:12.5px">${Object.entries(cnt).map(([k,v])=>v+'× '+k).join(', ')}<br>${Object.entries(stt).map(([k,v])=>v+' '+k).join(' · ')} · ${s.combined?'⭐ verbundene Waffen':'ohne verbundene Waffen'}</div>
      <div class="gb"><button data-gsel="${g.id}">📍 Wählen</button><button data-gord="${g.id}_hold">⛉ Halten</button><button data-gord="${g.id}_clear">🔍 Klären</button><button data-gord="${g.id}_assault">⚔ Angriff</button><button data-grein="${g.id}" style="${g.reinforce?'border-color:var(--acc);color:var(--acc)':''}">🔁 Ersatz ${g.reinforce?'an':'aus'}</button><button data-gdel="${g.id}" style="background:#4a2a22">Auflösen</button></div></div>`; }
  return h;
}
export function renderForces(){
  const all=own(); let h=reinfHtml()+groupsHtml()+'<h4>Einsatz aus freien Kräften</h4><div class="row kinds">';
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
  h+=`<button class="big" id="fGrp" ${tot>=2?'':'disabled'} style="background:#3a3418;border-color:#8a7a3a">🎖 Als Verband zusammenstellen (${tot})</button>`;
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
    else if(d.rein){ reinfOf(0).on=d.rein==='1'; if(d.rein==='0') reinfOf(0).q=reinfOf(0).q.filter(i=>i.grp); }
    else if(d.grein){ const g=(G.groups||[]).find(x=>x.id===Number(d.grein)); if(g){ g.reinforce=!g.reinforce; if(!g.reinforce) reinfOf(0).q=reinfOf(0).q.filter(i=>i.grp!==g.id); } }
    else if(d.gsel||d.gord||d.gdel){ const g=(G.groups||[]).find(x=>x.id===Number(d.gsel||d.gdel||d.gord.split('_')[0])); if(!g) return;
      if(d.gdel){ dissolveGroup(g); msg(`${g.name} aufgelöst.`); renderForces(); return; }
      const ms=members(g); G.sel=ms; close();
      if(d.gsel){ const s=groupState(g); centerOn(s.cx,s.cy); }
      else { const k=d.gord.split('_')[1]; if(k==='assault'){ G.amoveMode=true; } else G.orderMode=k; msg(`🎖 ${g.name}: ${ORDER_NAME[k]} – Ziel auf der Karte antippen.`); }
      refreshCmds(); return; }
    else if(b.id==='fGrp'){ const hq=G.buildings.find(x=>!x.dead&&x.owner===0&&x.type==='hq'); const us=pickUnits(fs.pick,hq?hq.x:48,hq?hq.y:48).filter(u=>u.def.weapon||u.def.jam);
      if(us.length>=2){ const g=makeGroup(0,us), s=groupState(g); fs.pick={}; msg(`🎖 ${g.name} gebildet: ${us.length} Einheiten${s.combined?' – verbundene Waffen':''}.`,'#9fd88a'); } renderForces(); return; }
    else if(b.id==='fGo'){ G.orderPending={kind:fs.kind, pick:{...fs.pick}}; close(); refreshCmds(); return; }
    renderForces(); });
}
