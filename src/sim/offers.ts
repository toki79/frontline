import { fmt } from '../core/util';
import { RES } from '../data/config';
import { G } from '../sim/state';
import { addAtt, setWar } from '../sim/world';
import { emit } from '../core/events';
import { msg } from '../core/events';

/* =====================================================================
   Angebote & Forderungen (Dialog)
   ===================================================================== */
/** eine KI-Macht (o.from) stellt eine Forderung oder bietet Frieden an – das Spiel pausiert, bis geantwortet wird */
export function showOffer(o){ G.offer=o; G.paused=true; emit('offer',o); }
export function answerOffer(yes){
  const o=G.offer; if(!o) return; G.offer=null; G.paused=false; emit('offerClosed');
  const f=o.from??1, P=G.players[0], A=G.players[f];
  if(o.type==='demand'){
    if(yes&&P.res[o.res]>=o.amt){ P.res[o.res]-=o.amt; A.res[o.res]+=o.amt; addAtt(f,0,15); msg(`Lieferung an ${A.short}: ${o.amt} ${RES[o.res].icon}. Der Frieden hält.`,'#d2bd62'); }
    else { addAtt(f,0,-15); setWar(f,0,true,f); G.ais[f].nextRaid=0; }
  } else {
    if(yes) setWar(f,0,false,f); else { addAtt(f,0,-10); msg('Friedensangebot abgelehnt.','#ffb38a'); }
  }
}
