import { DEV, FIRE, FUN, RES, UPGRADES, lvlOf } from '../data/config';
import { catOf, devOf, funCoverage } from '../sim/devplan';
import { fireCoverage } from '../sim/city';
import { G } from '../sim/state';
import { $ } from '../ui/dom';
import { hideTip } from '../ui/tooltips';

/* =====================================================================
   Stadtentwicklung (Fenster): Prioritäten, Freigabe, Lage der Stadt
   ===================================================================== */
const PRIO = ['Aus','Niedrig','Hoch'];
const pct = v => Math.round(v*100)+' %';
export function renderDev(){
  const p=G.players[0], d=devOf(0); let h='';
  // Lage der Stadt
  const fun=funCoverage(0), fire=fireCoverage(0), want=Math.max(0,Math.floor(p.pop)-FUN.free);
  h+=`<div class="party"><h3>📊 Lage der Stadt</h3>
    <div class="stat"><span>🎭 Unterhaltung (ab ${FUN.free} Einwohnern nötig)</span><b class="${fun<1?'bad':'good'}">${want>0?pct(fun):'noch nicht nötig'}</b></div>
    <div class="stat"><span>🚒 Gebäude im Schutz einer Feuerwache</span><b class="${fire<0.8&&p.pop>FIRE.minPop?'bad':'good'}">${pct(fire)}</b></div>
    <div class="stat"><span>🏗 Laufende Ausbauten</span><b>${G.buildings.filter(b=>!b.dead&&b.owner===0&&b.upg).length} / ${DEV.parallel+Math.floor(p.pop/DEV.parallelPer)}</b></div></div>`;
  // An/aus
  h+=`<div class="party"><h3>🏗 Ausbau durch die Bürger</h3><div class="drow"><span class="dn">Bürger bauen selbst aus</span>
    <button data-d="on_1" class="${d.on?'on':''}">An</button><button data-d="on_0" class="${!d.on?'on':''}">Aus</button></div>`;
  h+='<h4>Prioritäten</h4>';
  for(const [k,c] of Object.entries(DEV.cats) as [string,any][]){
    const own=G.buildings.filter(b=>!b.dead&&b.owner===0&&!b.site&&c.types.includes(b.type)), max=own.filter(b=>UPGRADES[b.type]&&lvlOf(b)>=UPGRADES[b.type].length).length;
    h+=`<div class="drow"><span class="dn">${c.icon} ${c.name}<small>${own.length} Gebäude · ${max} voll ausgebaut</small></span>`+PRIO.map((l,i)=>`<button data-d="p_${k}_${i}" class="${(d.prio[k]||0)===i?'on':''}">${l}</button>`).join('')+'</div>'; }
  h+='<h4>Freigabe: so viel der Vorräte dürfen die Bürger verbauen</h4>';
  for(const r of ['money','wood','stone','metal']){ const ic=r==='money'?'💰 Geld':RES[r].icon+' '+RES[r].name;
    h+=`<div class="drow"><span class="dn">${ic}</span>`+DEV.release.map(v=>`<button data-d="r_${r}_${v}" class="${d.release[r]===v?'on':''}">${pct(v)}</button>`).join('')+'</div>'; }
  h+='<div class="barl"><span>Engpässe haben Vorrang: zu wenig Wohnraum, Nahrung, Strom oder Unterhaltung lässt die Bürger dort zuerst ausbauen. Von Hand geht es weiterhin: Gebäude wählen → ⬆ Ausbau. Ausgebaute Gebäude leisten ×1,4 bzw. ×1,9, kosten aber mehr Unterhalt.</span></div></div>';
  // laufende Ausbauten
  const run=G.buildings.filter(b=>!b.dead&&b.owner===0&&b.upg);
  if(run.length) h+='<div class="party"><h3>⏳ Im Ausbau</h3>'+run.map(b=>`<div class="stat"><span>${b.def.name.replace(/­/g,'')} → Stufe ${lvlOf(b)+1}${b.autoUp?' (Bürger)':''}</span><b>${Math.floor(b.upg.t/b.upg.time*100)} %</b></div>`).join('')+'</div>';
  $('#devBody').innerHTML=h;
}
export function openDev(){ if(!G||G.over) return; hideTip(); G.paused=true; renderDev(); $('#dev').classList.remove('hidden'); }
function close(){ $('#dev').classList.add('hidden'); if(G) G.paused=false; }
export function init(){
  $('#bDev').addEventListener('click',openDev);
  $('#bDevClose').addEventListener('click',close);
  $('#devBody').addEventListener('click',e=>{ const t=(e.target as HTMLElement).closest('[data-d]') as HTMLElement; if(!t||!G) return;
    const d=devOf(0), [k,a,b]=t.dataset.d.split('_');
    if(k==='on') d.on=a==='1'; else if(k==='p') d.prio[a]=Number(b); else if(k==='r') d.release[a]=Number(b);
    renderDev(); });
}
export { catOf };
