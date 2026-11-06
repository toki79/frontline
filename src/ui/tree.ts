import { RESEARCH, RTREE, BUILDINGS, NUKE, UNITS, hasTech } from '../data/config';
import { canAfford, costOf, doneCount } from '../sim/costs';
import { enqueue, exclBlock, missingReq } from '../sim/production';
import { branchCount } from '../sim/intel';
import { G } from '../sim/state';
import { $ } from '../ui/dom';
import { costHtml } from '../ui/format';
import { hideTip } from '../ui/tooltips';

/* =====================================================================
   Forschungsbaum (Fenster): Ebenen nach Voraussetzungen, Zustand je Eintrag
   ===================================================================== */
const depth = (k, seen = new Set<string>()): number => { if(seen.has(k)) return 0; seen.add(k); const n=RESEARCH[k].need||[]; return n.length?1+Math.max(...n.map(x=>depth(x,seen))):0; };
const unlocks = k => [...Object.keys(BUILDINGS).filter(b=>BUILDINGS[b].research===k).map(b=>BUILDINGS[b].name), ...Object.keys(UNITS).filter(u=>UNITS[u].research===k).map(u=>UNITS[u].name)].map(n=>n.replace(/\u00AD/g,''));
export function renderTree(){
  const p=G.players[0], keys=Object.keys(RESEARCH), cur=p.q.research[0], n=doneCount(p);
  let h=`<div class="treeHead">Erforscht: ${n} · jede weitere Forschung kostet <b>+${Math.round(RTREE.rise*100)} %</b> (jetzt ×${(1+RTREE.rise*n).toFixed(2)}) – <b>breit</b> ist teuer, <b>tief</b> bringt ab ${RTREE.master} Forschungen eines Zweigs eine Meisterschaft. Mit ⚖ markierte Forschungen schließen sich gegenseitig aus.</div><div class="branches">`;
  for(const [bk,B] of Object.entries(RTREE.branches) as [string,any][]){
    const ks=keys.filter(k=>RESEARCH[k].branch===bk).sort((a,c)=>depth(a)-depth(c)), cnt=branchCount(p,bk), m=cnt>=RTREE.master;
    h+=`<div class="branch"><div class="bh">${B.icon} ${B.name} <span class="${m?'mst':'dim'}">${m?'🏅 Meisterschaft':`${cnt}/${RTREE.master}`} · ${B.bonus}</span></div>`;
    for(const k of ks){ const R=RESEARCH[k], done=hasTech(p,k), run=cur&&cur.type===k, miss=missingReq(0,k), ex=exclBlock(p,k), c=costOf(k,0);
      const cls=done?'done':run?'run':ex?'excl':miss.length?'lock':'avail';
      const st=done?'✓ erforscht':run?`⏳ ${Math.floor(cur.t/cur.time*100)} %${cur.stalled?' (steht)':''}`:ex?'✗ ausgeschlossen':miss.length?'🔒 gesperrt':canAfford(0,k)?'▶ starten':'zu teuer';
      const next=keys.filter(o=>(RESEARCH[o].need||[]).includes(k)).map(o=>RESEARCH[o].icon+' '+RESEARCH[o].name);
      const ul=unlocks(k), rivals=R.excl?keys.filter(o=>o!==k&&RESEARCH[o].excl===R.excl).map(o=>RESEARCH[o].name):[];
      h+=`<div class="tn ${cls}${R.win?' win':''}" data-r="${k}"><div class="ic">${R.icon||'🎓'}</div><div class="tx"><b>${R.name}</b> · <span class="dim">${costHtml(c)} · ${R.time} s${R.power?' · ⚡':''}</span><br>${R.desc}`+
        (R.excl?`<br><span class="xl">⚖ ${RTREE.excl[R.excl]}: schließt ${rivals.join(', ')} aus</span>`:'')+
        (R.win?`<br><span class="wn">🏆 ${R.win==='wiss'?'Wissenschaftssieg':'Wirtschaftssieg'}</span>`:'')+
        (ul.length?`<br>🏗 Schaltet frei: ${ul.join(', ')}`:'')+(k==='bomb'?`<br>🚀 Danach: Atomrakete im Silo (höchstens ${NUKE.maxStock})`:'')+
        (miss.length&&!done?`<br><span style="color:#ffb38a">Braucht: ${miss.join(', ')}</span>`:'')+(next.length?`<br><span class="dim">Führt zu: ${next.join(', ')}</span>`:'')+
        `</div><div class="stt">${st}</div></div>`; }
    h+='</div>'; }
  $('#treeBody').innerHTML=h+'</div>';
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
    else if(!canAfford(0,k)) txt=`Zu teuer: ${costHtml(costOf(k,0))}.`;
    else { ok=enqueue(0,k); txt=ok?`🎓 Forschung „${RESEARCH[k].name}“ gestartet.`:'Konnte nicht starten.'; }
    rep.textContent=txt; rep.className='tribres '+(ok?'ok':'no'); rep.style.display='block'; renderTree(); });
}
