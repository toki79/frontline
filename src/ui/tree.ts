import { RESEARCH, BUILDINGS, NUKE, hasTech } from '../data/config';
import { canAfford } from '../sim/costs';
import { enqueue, missingReq } from '../sim/production';
import { G } from '../sim/state';
import { $ } from '../ui/dom';
import { costHtml } from '../ui/format';
import { hideTip } from '../ui/tooltips';

/* =====================================================================
   Forschungsbaum (Fenster): Ebenen nach Voraussetzungen, Zustand je Eintrag
   ===================================================================== */
const depth = (k, seen = new Set<string>()): number => { if(seen.has(k)) return 0; seen.add(k); const n=RESEARCH[k].need||[]; return n.length?1+Math.max(...n.map(x=>depth(x,seen))):0; };
const unlocks = k => Object.keys(BUILDINGS).filter(b=>BUILDINGS[b].research===k).map(b=>BUILDINGS[b].name.replace(/­/g,''));
export function renderTree(){
  const p=G.players[0], keys=Object.keys(RESEARCH), tiers: string[][]=[];
  for(const k of keys){ const d=depth(k); (tiers[d]=tiers[d]||[]).push(k); }
  const cur=p.q.research[0];
  let h='';
  tiers.forEach((ks,i)=>{ h+=`<div class="tier">Ebene ${i+1}${i===0?' · Universität nötig':''}</div>`;
    for(const k of ks){ const R=RESEARCH[k], done=hasTech(p,k), run=cur&&cur.type===k, miss=missingReq(0,k);
      const cls=done?'done':run?'run':miss.length?'lock':'avail';
      const st=done?'✓ erforscht':run?`⏳ ${Math.floor(cur.t/cur.time*100)} %${cur.stalled?' (steht)':''}`:miss.length?'🔒 gesperrt':canAfford(0,k)?'▶ antippen':'zu teuer';
      const next=keys.filter(o=>(RESEARCH[o].need||[]).includes(k)).map(o=>RESEARCH[o].icon+' '+RESEARCH[o].name);
      const ul=unlocks(k);
      h+=`<div class="tn ${cls}" data-r="${k}"><div class="ic">${R.icon||'🎓'}</div><div class="tx"><b>${R.name}</b> · <span class="dim">${costHtml(R.cost)} · ${R.time} s${R.power?' · ⚡ braucht Strom':''}</span><br>${R.desc}`+
        (ul.length?`<br>🏗 Schaltet frei: ${ul.join(', ')}`:'')+(k==='bomb'?`<br>🚀 Danach: Atomrakete im Silo (höchstens ${NUKE.maxStock})`:'')+
        (miss.length&&!done?`<br><span style="color:#ffb38a">Braucht: ${miss.join(', ')}</span>`:'')+(next.length?`<br><span class="dim">Führt zu: ${next.join(', ')}</span>`:'')+
        `</div><div class="stt">${st}</div></div>`; } });
  $('#treeBody').innerHTML=h;
}
export function openTree(){ if(!G||G.over) return; hideTip(); G.paused=true; $('#treeReply').style.display='none'; renderTree(); $('#tree').classList.remove('hidden'); }
function close(){ $('#tree').classList.add('hidden'); if(G) G.paused=false; }
export function init(){
  $('#bTreeClose').addEventListener('click',close);
  $('#treeBody').addEventListener('click',e=>{ const t=(e.target as HTMLElement).closest('[data-r]') as HTMLElement; if(!t||!G) return;
    const k=t.dataset.r, p=G.players[0], miss=missingReq(0,k), rep=$('#treeReply'); let txt='', ok=false;
    if(hasTech(p,k)) txt=`${RESEARCH[k].name} ist schon erforscht.`;
    else if(miss.length) txt=`${RESEARCH[k].name} braucht noch: ${miss.join(', ')}.`;
    else if(p.q.research.length) txt='Die Universität forscht bereits – eins nach dem anderen.';
    else if(!canAfford(0,k)) txt=`Zu teuer: ${costHtml(RESEARCH[k].cost)}.`;
    else { ok=enqueue(0,k); txt=ok?`🎓 Forschung „${RESEARCH[k].name}“ gestartet.`:'Konnte nicht starten.'; }
    rep.textContent=txt; rep.className='tribres '+(ok?'ok':'no'); rep.style.display='block'; renderTree(); });
}
