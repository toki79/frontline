import { fmt } from '../core/util';
import { AIS, BASEVAL, FAMINE, RES } from '../data/config';
import { G } from '../sim/state';
import { addAtt, atWar, attOf, setWar } from '../sim/world';
import { famine } from '../sim/costs';
import { emit } from '../core/events';
import { msg } from '../core/events';

/* =====================================================================
   Angebote & Forderungen (Dialog)
   ===================================================================== */
/** eine KI-Macht (o.from) stellt eine Forderung oder bietet Frieden an – das Spiel pausiert, bis geantwortet wird */
/** weitere Angebotsarten (z. B. Bündnisse) melden sich hier an */
export const offerHandlers: Record<string,(o:any,yes:boolean)=>void> = {};
export function showOffer(o){ G.offer=o; G.paused=true; emit('offer',o); }
export function answerOffer(yes){
  const o=G.offer; if(!o) return; G.offer=null; G.paused=false; emit('offerClosed');
  const f=o.from??1, P=G.players[0], A=G.players[f];
  if(offerHandlers[o.type]){ offerHandlers[o.type](o,yes); return; }
  if(o.type==='demand'){
    if(yes&&P.res[o.res]>=o.amt){ P.res[o.res]-=o.amt; A.res[o.res]+=o.amt; addAtt(f,0,15); msg(`Lieferung an ${A.short}: ${o.amt} ${RES[o.res].icon}. Der Frieden hält.`,'#d2bd62'); }
    else { addAtt(f,0,-15); setWar(f,0,true,f); G.ais[f].nextRaid=0; }
  } else if(o.type==='aid'){
    if(!yes){ addAtt(f,0,-3); msg(`Hilfsangebot von ${A.short} abgelehnt.`,'#ffb38a'); return; }
    const amt=Math.min(o.food,Math.max(0,A.res.food)); A.res.food-=amt; P.res.food+=amt; addAtt(f,0,5);
    if(o.credit){ P.debt={to:f,left:o.price,until:G.t+FAMINE.debtTime};
      msg(`${A.short} liefert ${amt} 🌾 auf Kredit. ${Math.round(FAMINE.debtShare*100)} % eurer Steuern gehen an ${A.short}, bis ${o.price} $ bezahlt sind.`,'#d2bd62'); }
    else { P.res.money-=o.price; A.res.money+=o.price; msg(`${A.short} liefert ${amt} 🌾 für ${o.price} $.`,'#d2bd62'); }
  } else {
    if(yes) setWar(f,0,false,f); else { addAtt(f,0,-10); msg('Friedensangebot abgelehnt.','#ffb38a'); }
  }
}

/** Hungersnot beim Spieler: eine bekannte, friedliche Großmacht (am liebsten die Handelsmacht) bietet Nahrung an */
export function famineAid(){
  const P=G.players[0]; if(!P||G.offer||G.over||P.debt||!famine(P)||P.res.food>FAMINE.aidAmt*0.25||G.t<(G.aidCool||0)) return;
  const cand=AIS.filter(f=>G.known[0][f]&&!(G.beaten&&G.beaten[f])&&!atWar(f,0)&&attOf(f,0)>=FAMINE.aidMinAtt&&G.players[f].res.food>=FAMINE.aidAmt+FAMINE.aidReserve)
    .sort((a,b)=>(G.ais[b].char==='handel'?1:0)-(G.ais[a].char==='handel'?1:0)||attOf(b,0)-attOf(a,0));
  if(!cand.length) return;
  G.aidCool=G.t+FAMINE.aidCool;
  const from=cand[0], base=FAMINE.aidAmt*BASEVAL.food*FAMINE.aidMarkup, cash=Math.round(base/10)*10, credit=P.res.money<cash;
  showOffer({type:'aid', from, food:FAMINE.aidAmt, price:credit?Math.round(base*FAMINE.creditMarkup/10)*10:cash, credit});
}
