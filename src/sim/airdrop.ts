import { dist, idx, inMap } from '../core/util';
import { AIR } from '../data/config';
import { applyOrder } from '../sim/missions';
import { G } from '../sim/state';
import { fxAdd } from '../sim/units';
import { hostile, nearestPassable } from '../sim/world';
import { msg } from '../core/events';
import { noteLoss } from '../sim/reinforce';

/* =====================================================================
   Luftlandung: Fallschirmjäger steigen am Fliegerhorst in eine Transportmaschine,
   fliegen zum Ziel und springen dort ab. Flugabwehr unterwegs kann Mitfliegende treffen.
   Die Maschine ist der "Träger" der Mitfliegenden (u.carried, u.carrier = Flug).
   ===================================================================== */
export const nearAirbase = u => G.buildings.find(b=>!b.dead&&!b.site&&!b.contam&&b.owner===u.owner&&b.type==='airbase'&&dist(b.x,b.y,u.x,u.y)<=6);
export const droppable = units => units.filter(u=>!u.dead&&!u.carried&&u.def.cls==='inf'&&u.type==='para'&&nearAirbase(u));
/** Absprung befehlen. Ergebnis: Anzahl oder Begründung */
export function orderDrop(pid,units,x,y){
  const us=droppable(units).slice(0,AIR.dropMax); if(!us.length) return 'keine Fallschirmjäger am Fliegerhorst';
  const base=nearAirbase(us[0]); if(dist(base.x,base.y,x,y)>AIR.dropRange) return `zu weit (höchstens ${AIR.dropRange} Felder vom Fliegerhorst)`;
  if(pid===0&&G.fog&&inMap(Math.floor(x),Math.floor(y))&&G.vis[idx(Math.floor(x),Math.floor(y))]===0) return 'Ziel nicht erkundet';
  const d=dist(base.x,base.y,x,y), f={owner:pid, x:base.x, y:base.y, x0:base.x, y0:base.y, tx:x, ty:y, t0:G.t, dur:2+d/AIR.dropSpeed, units:us, aaT:0, dead:false};
  for(const u of us){ u.carried=true; u.carrier=f; u.target=null; u.path=null; u.order=null; u.grp=u.grp; }
  G.sel=G.sel.filter(s=>!us.includes(s));
  G.flights=(G.flights||[]).concat([f]);
  if(pid===1&&G.known[0][1]) msg('🪂 Geheimdienst: Feindliche Transportmaschine im Anflug!','#ff8a7a');
  return us.length;
}
export function updateFlights(dt){
  if(!G.flights||!G.flights.length) return;
  for(const f of G.flights){ const k=Math.min(1,(G.t-f.t0)/f.dur); f.x=f.x0+(f.tx-f.x0)*k; f.y=f.y0+(f.ty-f.y0)*k; f.a=Math.atan2(f.ty-f.y0,f.tx-f.x0);
    // Flugabwehr unterwegs
    f.aaT-=dt; if(f.aaT<=0){ f.aaT=1;
      const aa=[...G.buildings.filter(b=>!b.dead&&!b.site&&(b.type==='flak'||b.type==='sam')), ...G.units.filter(u=>!u.dead&&!u.carried&&u.type==='spaag')];
      for(const s of aa){ if(!hostile(s.owner,f.owner)) continue; const w=s.def.weapon; if(!w||dist(s.x,s.y,f.x,f.y)>w.range) continue;
        fxAdd({k:'tracer',x1:s.x,y1:s.y,x2:f.x,y2:f.y,life:0.15,col:'#ffd27a'});
        const alive=f.units.filter(u=>!u.dead); if(alive.length&&Math.random()<(AIR.dropAA[s.type]||0.1)){ const v=alive[Math.floor(Math.random()*alive.length)]; v.dead=true; noteLoss(v);
          fxAdd({k:'boom',x:f.x,y:f.y,r:0.4,life:0.5}); if(f.owner===0){ G.stats.lost++; msg('🪂 Flugabwehr trifft die Transportmaschine – ein Trupp verloren!','#ff8a7a'); } } } }
    if(k>=1){ f.done=true; const alive=f.units.filter(u=>!u.dead);
      alive.forEach((u,i)=>{ const a=i/Math.max(1,alive.length)*6.283, p=nearestPassable(f.tx+Math.cos(a)*1.5,f.ty+Math.sin(a)*1.5,'inf');
        u.carried=false; u.carrier=null; u.x=p?p.x+0.5:f.tx; u.y=p?p.y+0.5:f.ty; u.mode='idle'; u.guard={x:u.x,y:u.y}; fxAdd({k:'loot',x:u.x,y:u.y,txt:'🪂',col:'#ffffff',life:1.6}); });
      if(alive.length) applyOrder(alive,'clear',f.tx,f.ty);
      if(f.owner===0) msg(`🪂 ${alive.length} Trupp${alive.length===1?'':'s'} Fallschirmjäger gelandet – sie säubern das Gebiet.`,'#9fd88a');
      else if(G.units.some(u=>!u.dead&&u.owner===0)&&alive.length) msg(`⚠ ${alive.length} feindliche Fallschirmjäger-Trupps sind gelandet!`,'#ff8a7a'); }
  }
  G.flights=G.flights.filter(f=>!f.done);
}
