import { $ } from './dom';
import { MODULES, VETERAN, WORKSHOP } from '../data/config';
import { G } from '../sim/state';
import { msg } from '../core/events';
import { dist } from '../core/util';
import { capOf, devBlock, devDone, fitBlock, fitModule, fitPlan, isFittable, label, rankOf, removeModule, shopNear, startDev, weightOf } from '../sim/modules';
import { orderMove } from '../sim/orders';
import { nearestPassable } from '../sim/world';
import { costHtml } from './format';

/* =====================================================================
   Werkstatt-Fenster: Module entwickeln, Fahrzeuge ausrüsten
   ===================================================================== */
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SLOT={antrieb:'Antrieb', waffe:'Waffe', aufsatz:'Aufsatz', schutz:'Schutz', elektronik:'Elektronik'};
const shops=()=>G.buildings.filter(b=>!b.dead&&b.owner===0&&b.type==='workshop');
const inShop=()=>G.units.filter(u=>u.owner===0&&isFittable(u)&&shopNear(u));
function render(){
  const p=G.players[0], q=p.mdevQ, ready=shops().some(b=>!b.site);
  let h=`<div class="barl"><span>Module werden <b>einmal entwickelt</b> und dann je Fahrzeug <b>eingebaut</b> (${WORKSHOP.fitTime} s). Die Tragfähigkeit begrenzt die Ausstattung – kein Fahrzeug kann alles. Fahrzeuge wählen und 🔧 drücken: Sie fahren her. Die Werkstatt repariert auch.</span></div>`;
  if(!ready) h+=`<div class="barl" style="color:#ffb38a"><span>Die Werkstatt ist noch im Bau.</span></div>`;
  // Fahrzeuge in der Werkstatt
  const vs=inShop();
  h+=`<h4>🚙 In der Werkstatt (${vs.length})</h4>`;
  if(!vs.length) h+=`<div class="barl"><span>Keine Fahrzeuge da. Kampffahrzeuge (Schützenpanzer, Transporter, Kampfpanzer, Flakpanzer, Raketenwerfer) wählen und 🔧 Werkstatt drücken.</span></div>`;
  for(const u of vs){ const used=weightOf(u.mods), cap=capOf(u.type), r=rankOf(u);
    h+=`<div class="wcard"><div class="wh"><b>${esc(label(u))}</b> <span class="dim">${r?'⭐'.repeat(r)+' '+VETERAN.names[r-1]+' · ':''}${u.kills||0} Abschüsse · ${Math.ceil(u.hp)}/${u.maxHp} · Tragfähigkeit ${used}/${cap}</span></div>`;
    h+=`<div class="row">${(u.mods||[]).map(k=>`<span class="chip">${MODULES[k].icon} ${MODULES[k].name} <button class="x" data-rm="${u.id}|${k}" title="ausbauen (ohne Erstattung)">✕</button></span>`).join('')||'<span class="dim">noch keine Ausrüstung</span>'}</div>`;
    if(u.fit) h+=`<div class="barl"><span>🔧 Einbau ${MODULES[u.fit.k].icon} ${MODULES[u.fit.k].name}: noch ${Math.ceil(u.fit.t)} s${u.fitQ&&u.fitQ.length?` · danach ${u.fitQ.map(k=>MODULES[k].icon).join('')}`:''} (läuft, wenn das Spiel weiterläuft)</span></div>`;
    else { const opts=Object.keys(MODULES).filter(k=>MODULES[k].fits.includes(u.type)&&devDone(p,k)&&!(u.mods||[]).includes(k));
      h+=`<div class="row">${opts.map(k=>{ const M=MODULES[k], why=fitBlock(u,k); return `<button data-fit="${u.id}|${k}" ${why?'disabled':''} title="${esc(M.desc)}${why?' – '+why:''}">+ ${M.icon} ${M.name} <small>${costHtml(M.cost)} · ⚖${M.weight}${(u.mods||[]).some(x=>MODULES[x].slot===M.slot)?' · ersetzt':''}</small></button>`; }).join('')||'<span class="dim">Keine weiteren Module entwickelt, die hier passen.</span>'}</div>`;
      const lf=G.lastFit; if(lf&&lf.length&&lf.some(k=>!(u.mods||[]).includes(k))&&lf.every(k=>MODULES[k].fits.includes(u.type))) h+=`<div class="row"><button data-plan="${u.id}">🔁 wie zuletzt ausrüsten: ${lf.map(k=>MODULES[k].icon).join('')}</button></div>`; }
    h+=`</div>`; }
  // Entwicklung
  h+=`<h4>🧪 Entwicklung${q?` – läuft: ${MODULES[q.k].icon} ${MODULES[q.k].name} ${Math.floor(q.t/q.time*100)} %`:''}</h4><div class="wgrid">`;
  for(const k of Object.keys(MODULES)){ const M=MODULES[k], done=devDone(p,k), why=done?'':devBlock(0,k), run=q&&q.k===k;
    h+=`<div class="wmod ${done?'done':''}"><div><b>${M.icon} ${M.name}</b> <span class="dim">${SLOT[M.slot]} · ⚖${M.weight}${M.need.length?' · braucht '+M.need.map(n=>n==='computing'?'Rechenzentrum-Forschung':n==='rocketry'?'Raketentechnik':n).join(', '):''}</span></div>
      <div class="dim" style="font-size:12.5px">${esc(M.desc)} · Einbau ${costHtml(M.cost)}</div>
      ${done?'<div class="ok">✓ entwickelt</div>':run?`<div class="bar"><i style="width:${q.t/q.time*100}%"></i></div>`:`<button data-dev="${k}" ${why?'disabled':''} title="${esc(why)}">Entwickeln ${costHtml(M.dev)} · ${Math.round(M.devTime)} s${why&&why!=='zu teuer'?` <small>(${esc(why)})</small>`:''}</button>`}</div>`; }
  h+=`</div>`;
  $('#werkBody').innerHTML=h;
}
export function openWerk(){ if(!G||G.over) return; if(!shops().length){ msg('Erst eine Werkstatt bauen (Gebäude → Militär).','#ffb38a'); return; } G.paused=true; render(); $('#werk').classList.remove('hidden'); }
/** ausgewählte Fahrzeuge zur nächsten Werkstatt schicken */
export function sendToShop(units){
  const vs=units.filter(isFittable), S=shops(); if(!vs.length) return false;
  if(!S.length){ msg('Keine Werkstatt – zuerst eine bauen (Militär).','#ffb38a'); return true; }
  if(vs.every(u=>shopNear(u))){ openWerk(); return true; }
  for(const u of vs){ const b=S.slice().sort((a,c)=>dist(a.x,a.y,u.x,u.y)-dist(c.x,c.y,u.x,u.y))[0], k=vs.indexOf(u);
    const pp=nearestPassable(b.x+((k%3)-1)*1.2,b.y+b.h/2+1.3+Math.floor(k/3)*1.1,u.def.cls); if(pp) orderMove([u],pp.x+0.5,pp.y+0.5); }
  msg(`🔧 ${vs.length} Fahrzeug${vs.length===1?'':'e'} fahren zur Werkstatt.`,'#b8c8e0'); return true;
}
export function init(){
  $('#bWerkClose').addEventListener('click',()=>{ $('#werk').classList.add('hidden'); if(G) G.paused=false; });
  $('#werkBody').addEventListener('click',e=>{ const t=(e.target as HTMLElement).closest('button') as HTMLButtonElement; if(!t||t.disabled) return;
    const byId=id=>G.units.find(u=>u.id===Number(id));
    if(t.dataset.dev){ const why=startDev(0,t.dataset.dev); if(why) msg('Entwicklung nicht möglich: '+why,'#ffb38a'); else msg(`🧪 Entwicklung begonnen: ${MODULES[t.dataset.dev].name}.`,'#b8c8e0'); }
    else if(t.dataset.fit){ const [id,k]=t.dataset.fit.split('|'), u=byId(id); const why=u?fitModule(u,k):'weg'; if(why) msg('Einbau nicht möglich: '+why,'#ffb38a'); }
    else if(t.dataset.plan){ const u=byId(t.dataset.plan); const why=u?fitPlan(u,G.lastFit||[]):'weg'; if(why) msg('Einbau nicht möglich: '+why,'#ffb38a'); }
    else if(t.dataset.rm){ const [id,k]=t.dataset.rm.split('|'), u=byId(id); if(u) removeModule(u,k); }
    render(); });
}
