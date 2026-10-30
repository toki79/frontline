import { fmt } from '../core/util';
import { RES } from '../data/config';
import { G } from '../sim/state';
import { setWar } from '../sim/world';
import { emit } from '../core/events';
import { msg } from '../core/events';

/* =====================================================================
   Angebote & Forderungen (Dialog)
   ===================================================================== */
/** Kastrova stellt eine Forderung oder bietet Frieden an – das Spiel pausiert, bis geantwortet wird */
export function showOffer(o){ G.offer=o; G.paused=true; emit('offer',o); }
export function answerOffer(yes){
  const o=G.offer; if(!o) return; G.offer=null; G.paused=false; emit('offerClosed');
  const P=G.players[0], A=G.players[1];
  if(o.type==='demand'){
    if(yes&&P.res[o.res]>=o.amt){ P.res[o.res]-=o.amt; A.res[o.res]+=o.amt; G.aiAtt=Math.min(100,G.aiAtt+15); msg(`Lieferung an Kastrova: ${o.amt} ${RES[o.res].icon}. Der Frieden hält.`,'#d2bd62'); }
    else { G.aiAtt=Math.max(-100,G.aiAtt-15); setWar(true,1); G.ai.nextRaid=0; }
  } else {
    if(yes) setWar(false); else { G.aiAtt=Math.max(-100,G.aiAtt-10); msg('Friedensangebot abgelehnt.','#ffb38a'); }
  }
}
