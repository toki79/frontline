import { dist } from '../core/util';
import { BASEVAL, BUILDINGS, RES, TRIBUTE } from '../data/config';
import { deterrent } from '../sim/nuke';
import { G } from '../sim/state';
import { findBuilding, recalcPower, setWar } from '../sim/world';
import { msg } from '../core/events';
import { fxAdd } from '../sim/units';

/* =====================================================================
   Tribut: Aldoria fordert von Kastrova Geld, Rohstoffe oder Land
   ---------------------------------------------------------------------
   Kastrova gibt nach, wenn die Furcht (eure Übermacht, Atomrakete, ein
   verlorener Krieg, Bündnis mit der Miliz) den Schmerz (Wert der Forderung,
   abgetretenes Land, Dauerzahlung) überwiegt. Wer nachgibt, vergisst es nicht.
   ===================================================================== */
const val = (res,amt) => res==='money'?amt:amt*BASEVAL[res];
function wealth(A){ let w=A.res.money; for(const r in BASEVAL) w+=(A.res[r]||0)*BASEVAL[r]; return Math.max(600,w); }
/** Gebiet, das Kastrova abtreten würde: seine Gebäude nahe der Grenze zu Aldoria */
export function landOffer(){
  const hq=findBuilding(0,'hq'); if(!hq) return [];
  const cand=G.buildings.filter(b=>!b.dead&&b.owner===1&&b.type!=='hq'&&b.type!=='wall'&&!b.def.def);
  if(!cand.length) return [];
  cand.sort((a,b)=>dist(a.x,a.y,hq.x,hq.y)-dist(b.x,b.y,hq.x,hq.y));
  const c=cand[0]; return cand.filter(b=>dist(b.x,b.y,c.x,c.y)<=TRIBUTE.landR).slice(0,TRIBUTE.landMax);
}
/** Würde Kastrova nachgeben? */
export function evalTribute(kind,amt,recurring){
  const A=G.players[1], ai=G.ai, T=TRIBUTE, reasons=[];
  if(!G.known[0][1]) return {ok:false,fear:0,pain:9,reasons:['kein Kontakt']};
  const s=Math.min(4,1/Math.max(0.25,ai.ratio??1));
  let fear=Math.max(0,s-1)*T.superiority;
  if(deterrent(0)&&!deterrent(1)) fear+=T.nuke;
  if(G.war&&(ai.ratio??1)<0.8) fear+=T.losingWar;
  if(G.militiaAlly===0) fear+=T.ally;
  let pain=0;
  if(kind==='land'){ const L=landOffer(); if(!L.length) return {ok:false,fear,pain:9,reasons:['kein Gebiet zum Abtreten']};
    pain=T.land+T.landEach*L.length+L.reduce((s,b)=>s+(BUILDINGS[b.type].cost.money||0),0)/wealth(A)*T.pain*0.5; }
  else { const v=val(kind,amt);
    if(recurring){ const inc=Math.max(150,((A.rate&&A.rate.money)||1)*60); pain=v/inc*T.pain*0.6+T.recurring; }
    else pain=v/wealth(A)*T.pain;
    if(!recurring&&(A.res[kind]||0)<amt) reasons.push(`Kastrova hat nur ${Math.floor(A.res[kind]||0)} ${kind==='money'?'$':RES[kind].icon}`); }
  if(fear<0.3) reasons.push('Kastrova fürchtet euch nicht');
  else if(fear-pain<T.accept) reasons.push('die Forderung ist zu hoch');
  return {ok:!reasons.length, fear, pain, reasons};
}
/** Tribut fordern. Ergebnis: 'ok' | 'nein' | 'krieg' | 'wartet' */
export function demandTribute(kind,amt,recurring){
  const A=G.players[1], P=G.players[0], T=TRIBUTE, ai=G.ai;
  if(G.t<(G.tribCool||0)) return 'wartet';
  G.tribCool=G.t+T.cool;
  const e=evalTribute(kind,amt,recurring);
  if(!e.ok){ G.aiAtt=Math.max(-100,G.aiAtt-T.angry);
    if(!G.war&&e.fear<0.3&&(ai.ratio??1)>1.3&&Math.random()<0.5){ setWar(true,1); ai.nextRaid=0; G.tribLast={ok:false,txt:'Abgelehnt – und Kastrova hat euch den Krieg erklärt! (Haltung −'+T.angry+')'}; msg('👑 Tributforderung abgelehnt – Kastrova erklärt den Krieg!','#ff8a7a'); return 'krieg'; }   // Drohung ohne Macht dahinter
    G.tribLast={ok:false,txt:'Abgelehnt: '+e.reasons.join(', ')+` (Haltung −${T.angry}).`}; msg('👑 Kastrova lehnt eure Tributforderung ab.','#ffb38a');
    return 'nein'; }
  G.aiAtt=Math.max(-100,G.aiAtt-T.grudge); ai.humT=G.t;
  if(kind==='land'){ const L=landOffer(); let pop=0;
    for(const b of L){ b.owner=0; b.upg=null; if(b.resid){ pop+=b.resid; } }
    A.pop=Math.max(10,A.pop-pop); P.pop+=pop*0.8;
    for(const u of G.units) if(!u.dead&&u.owner===1&&L.some(b=>dist(b.x,b.y,u.x,u.y)<4)){ u.target=null; }
    recalcPower(0); recalcPower(1); G.qDirty=true; G.roadDirty=true;
    const t=`🏳 Kastrova tritt Land ab: ${L.map(b=>b.def.name.replace(/\u00AD/g,'')).join(', ')} gehören jetzt Aldoria (+${Math.round(pop*0.8)} Einwohner).`; msg(t,'#9fd88a'); G.tribLast={ok:true,txt:t}; }
  else if(recurring){ G.tribute={res:kind, amt, next:G.t+T.every, paid:0};
    const t=`👑 Angenommen: Kastrova zahlt ab jetzt jede Minute ${amt} ${kind==='money'?'$':RES[kind].icon} – die erste Zahlung kommt in einer Minute Spielzeit.`; msg(t,'#9fd88a'); G.tribLast={ok:true,txt:t}; }
  else { A.res[kind]-=amt; P.res[kind]+=amt; const t=`👑 Angenommen: Kastrova hat ${amt} ${kind==='money'?'$':RES[kind].icon} gezahlt – schon in eurem Lager (jetzt ${Math.floor(P.res[kind])}).`; msg(t,'#9fd88a'); G.tribLast={ok:true,txt:t}; }
  G.tribLast.txt+=` Kastrova ist gekränkt (Haltung −${T.grudge}).`;
  if(G.war) setWar(false);   // Tribut als Friedensbedingung
  return 'ok';
}
/** laufender Tribut: Zahlung jede Minute – Kastrova stellt ein, sobald es sich nicht mehr fürchtet */
export function updateTribute(){
  const t=G.tribute; if(!t||G.t<t.next) return;
  t.next=G.t+TRIBUTE.every;
  const A=G.players[1], P=G.players[0], e=evalTribute(t.res,t.amt,true);
  if(G.war||e.fear-e.pain<-0.3||!G.buildings.some(b=>!b.dead&&b.owner===1&&b.type==='hq')){ G.tribute=null;
    msg('👑 Kastrova stellt die Tributzahlungen ein – es fürchtet euch nicht mehr.','#ffb38a'); return; }
  const a=Math.min(t.amt,Math.floor(A.res[t.res]||0)); if(a<=0) return;
  A.res[t.res]-=a; P.res[t.res]+=a; t.paid+=a;
  msg(`👑 Tribut von Kastrova: +${a} ${t.res==='money'?'$':RES[t.res].icon}`,'#d2bd62');
  const hq=G.buildings.find(b=>!b.dead&&b.owner===0&&b.type==='hq'); if(hq) fxAdd({k:'loot',x:hq.x,y:hq.y,txt:`👑 +${a} ${t.res==='money'?'$':RES[t.res].icon}`,col:'#ffd36a',life:3});
}
export function waiveTribute(){ if(G.tribute){ G.tribute=null; G.aiAtt=Math.min(100,G.aiAtt+10); } }
