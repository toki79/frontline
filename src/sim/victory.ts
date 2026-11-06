import { msg } from '../core/events';
import { BASEVAL, INTEL, MAJORS, VICTORY, hasTech } from '../data/config';
import { endGame } from '../sim/combat';
import { intelEvent } from '../sim/intel';
import { G } from '../sim/state';

/* =====================================================================
   Alternative Siege
   ---------------------------------------------------------------------
   • Wissenschaft: Kernfusion als Erster erforschen (siehe production.ts)
   • Wirtschaft: nach dem Welthandelsabkommen ein Vermögen (Kasse + Lager)
     von VICTORY.wealth zwei Minuten lang halten
   ===================================================================== */
export function wealthOf(pid){ const p=G.players[pid]; let w=p.res.money; for(const r in BASEVAL) w+=(p.res[r]||0)*BASEVAL[r]; return Math.floor(w); }
/** einmal je Sekunde */
export function updateVictory(){
  if(G.over) return;
  for(const pid of MAJORS){ const p=G.players[pid];
    if(!hasTech(p,'worldtrade')||!G.buildings.some(b=>!b.dead&&b.owner===pid&&b.type==='hq')){ p.wealthT=0; continue; }
    const w=wealthOf(pid), share=w/VICTORY.wealth;
    if(pid!==0&&share>=VICTORY.warnAt&&!p.wealthWarn){ p.wealthWarn=true;
      intelEvent(pid,'victory','worldtrade',{txt:`hat schon ${Math.round(share*100)} % des Vermögens für den Wirtschaftssieg beisammen.`, counter:INTEL.threats.worldtrade.counter}); }
    if(share>=1){ p.wealthT=(p.wealthT||0)+1;
      if(p.wealthT===1) msg(pid===0?`🌐 Aldoria hält ${VICTORY.wealth.toLocaleString('de-DE')} $ Vermögen – noch ${VICTORY.hold} s, dann ist der Wirtschaftssieg da!`:`⚠ ${p.short} hält ein Vermögen von ${VICTORY.wealth.toLocaleString('de-DE')} $ – in ${VICTORY.hold} s gewinnt es den Wirtschaftssieg! Krieg, Plünderung oder Tribut können das verhindern.`, pid===0?'#9fd88a':'#ff8a7a');
      if(p.wealthT>=VICTORY.hold){ endGame(pid===0, pid===0?'Aldoria beherrscht den Welthandel – Wirtschaftssieg!':`${p.short} beherrscht den Welthandel – Wirtschaftssieg für ${p.short}.`); return; } }
    else { if(p.wealthT>0&&pid!==0) msg(`${p.short} hat das Vermögen für den Wirtschaftssieg nicht halten können.`,'#9fd88a'); p.wealthT=0; }
  }
}
