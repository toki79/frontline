import { MAJORS, REINFORCE, UNITS } from '../data/config';
import { enqueue, queueName } from '../sim/production';
import { G } from '../sim/state';
import { orderMove } from '../sim/orders';
import { groupState } from '../sim/groups';
import { msg } from '../core/events';

/* =====================================================================
   Verluste ersetzen: Gefallene Einheiten werden automatisch nachgebaut,
   wenn es eingestellt ist – für Einheiten ohne Verband global, für jeden
   Verband einzeln. Der Ersatz kostet normal und stößt danach zum Verband.
   ===================================================================== */
export function reinfOf(pid){ G.reinf=G.reinf||{}; if(!G.reinf[pid]) G.reinf[pid]={on:false, q:[]}; return G.reinf[pid]; }
const groupOf = id => id&&(G.groups||[]).find(g=>g.id===id);
/** Einheit gefallen: Ersatz vormerken, falls eingestellt */
export function noteLoss(u){
  if(u.owner!==0&&u.owner!==1) return; const d=UNITS[u.type]; if(!d||!d.prod||REINFORCE.skip.includes(u.type)) return;
  const g=groupOf(u.grp); if(g&&g.want) return;   // Verbände mit Soll-Stärke füllt updateReinforce selbst auf
  const want=g?!!g.reinforce:reinfOf(u.owner).on; if(!want) return;
  reinfOf(u.owner).q.push({type:u.type, grp:g?g.id:null, t:G.t});
}
export function updateReinforce(dt){
  G.reT=(G.reT||0)-dt; if(G.reT>0) return; G.reT=REINFORCE.think;
  // Soll-Stärke der Verbände: fehlt eine Einheit (und ist keine im Bau), wird sie bestellt
  for(const g of (G.groups||[])){ if(!g.reinforce||!g.want) continue; const p=G.players[g.owner];
    for(const t in g.want){ if(!UNITS[t]||!UNITS[t].prod||REINFORCE.skip.includes(t)) continue;
      const have=G.units.filter(u=>!u.dead&&u.grp===g.id&&u.type===t).length+Object.values(p.q).flat().filter((i:any)=>i&&i.grp===g.id&&i.type===t).length;
      if(have>=g.want[t]) continue;
      if(!enqueue(g.owner,t)){ g.short=t; continue; }
      const q=p.q[queueName(t)], job=q[q.length-1]; job.grp=g.id; job.re=true; g.short=null;
      if(g.owner===0&&G.t-(G.reMsg||-99)>6){ G.reMsg=G.t; msg(`🔁 ${g.name}: ${UNITS[t].name.replace(/\u00AD/g,'')} in Auftrag (Soll ${g.want[t]}).`,'#9fd88a'); }
      break; } }
  for(const pid of MAJORS){ const R=reinfOf(pid); if(!R.q.length) continue;
    R.q=R.q.filter(it=>G.t-it.t<REINFORCE.wait);
    for(const it of [...R.q]){ if(!enqueue(pid,it.type)) continue;
      const q=G.players[pid].q[queueName(it.type)], job=q[q.length-1]; job.grp=it.grp; job.re=true;
      R.q.splice(R.q.indexOf(it),1);
      if(pid===0&&G.t-(G.reMsg||-99)>6){ G.reMsg=G.t; const g=groupOf(it.grp); msg(`🔁 Ersatz in Auftrag: ${UNITS[it.type].name.replace(/­/g,'')}${g?' für die '+g.name:''}.`,'#9fd88a'); } }
  }
}
/** neu gebaute Ersatzeinheit: in den Verband eingliedern und hinschicken */
export function joinGroup(u,job){
  const g=groupOf(job.grp); if(!g) return;
  u.grp=g.id; const s=groupState(g), lead=s.ms.find(o=>o!==u&&o.order);
  if(s.ms.length>1){ orderMove([u],s.cx+(Math.random()-.5)*2,s.cy+(Math.random()-.5)*2,lead&&lead.order!=='hold'?'amove':'move');
    if(lead){ u.order=lead.order; u.area=lead.area; u.msn=lead.msn; } }   // übernimmt den Auftrag des Verbands
}
