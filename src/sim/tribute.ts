import { dist } from '../core/util';
import { BASEVAL, BUILDINGS, RES, TRIBUTE } from '../data/config';
import { deterrent } from '../sim/nuke';
import { G } from '../sim/state';
import { addAtt, anyWar, atWar, findBuilding, recalcPower, setWar } from '../sim/world';
import { msg } from '../core/events';
import { fxAdd } from '../sim/units';

/* =====================================================================
   Tribut: Aldoria fordert von einer KI-Macht Geld, Rohstoffe oder Land
   ---------------------------------------------------------------------
   Kastrova gibt nach, wenn die Furcht (eure Übermacht, Atomrakete, ein
   verlorener Krieg, Bündnis mit der Miliz) den Schmerz (Wert der Forderung,
   abgetretenes Land, Dauerzahlung) überwiegt. Wer nachgibt, vergisst es nicht.
   ===================================================================== */
const val = (res,amt) => res==='money'?amt:amt*BASEVAL[res];
function wealth(A){ let w=A.res.money; for(const r in BASEVAL) w+=(A.res[r]||0)*BASEVAL[r]; return Math.max(600,w); }
const icon = k => k==='money'?'$':RES[k].icon;
/** laufende Tributzahlungen (an Aldoria), eine je Macht */
export const tributeOf = t => (G.tributes||[]).find(x=>x.from===t)||null;
/** Gebiet, das eine KI-Macht t abtreten würde: ihre Gebäude nahe der Grenze zu Aldoria */
export function landOffer(t=1){
  const hq=findBuilding(0,'hq'); if(!hq) return [];
  const cand=G.buildings.filter(b=>!b.dead&&b.owner===t&&b.type!=='hq'&&b.type!=='wall'&&!b.def.def);
  if(!cand.length) return [];
  cand.sort((a,b)=>dist(a.x,a.y,hq.x,hq.y)-dist(b.x,b.y,hq.x,hq.y));
  const c=cand[0]; return cand.filter(b=>dist(b.x,b.y,c.x,c.y)<=TRIBUTE.landR).slice(0,TRIBUTE.landMax);
}
/** Würde die Macht t nachgeben? */
export function evalTribute(t,kind,amt,recurring){
  const A=G.players[t], ai=G.ais[t], T=TRIBUTE, reasons=[], r=(ai.rat&&ai.rat[0])??1;
  if(!G.known[0][t]) return {ok:false,fear:0,pain:9,reasons:['kein Kontakt']};
  const s=Math.min(4,1/Math.max(0.25,r));
  let fear=Math.max(0,s-1)*T.superiority;
  if(deterrent(0)&&!deterrent(t)) fear+=T.nuke;
  if(atWar(0,t)&&r<0.8) fear+=T.losingWar;
  if(G.militiaAlly===0) fear+=T.ally;
  if(anyWar(t)&&!atWar(0,t)) fear+=T.ally*0.5;   // wer schon anderswo Krieg führt, will keine zweite Front
  let pain=0;
  if(kind==='land'){ const L=landOffer(t); if(!L.length) return {ok:false,fear,pain:9,reasons:['kein Gebiet zum Abtreten']};
    pain=T.land+T.landEach*L.length+L.reduce((s,b)=>s+(BUILDINGS[b.type].cost.money||0),0)/wealth(A)*T.pain*0.5; }
  else { const v=val(kind,amt);
    if(recurring){ const inc=Math.max(150,((A.rate&&A.rate.money)||1)*60); pain=v/inc*T.pain*0.6+T.recurring; }
    else pain=v/wealth(A)*T.pain;
    if(!recurring&&(A.res[kind]||0)<amt) reasons.push(`${A.short} hat nur ${Math.floor(A.res[kind]||0)} ${icon(kind)}`); }
  if(fear<0.3) reasons.push(`${A.short} fürchtet euch nicht`);
  else if(fear-pain<T.accept) reasons.push('die Forderung ist zu hoch');
  return {ok:!reasons.length, fear, pain, reasons};
}
/** Tribut von Macht t fordern. Ergebnis: 'ok' | 'nein' | 'krieg' | 'wartet' */
export function demandTribute(t,kind,amt,recurring){
  const A=G.players[t], P=G.players[0], T=TRIBUTE, ai=G.ais[t], r=(ai.rat&&ai.rat[0])??1;
  G.tribCool=G.tribCool||{}; G.tribLast=G.tribLast||{};
  if(G.t<(G.tribCool[t]||0)) return 'wartet';
  G.tribCool[t]=G.t+T.cool;
  const e=evalTribute(t,kind,amt,recurring);
  if(!e.ok){ addAtt(t,0,-T.angry);
    if(!atWar(0,t)&&e.fear<0.3&&r>1.3&&Math.random()<0.5){ setWar(t,0,true,t); ai.nextRaid=0; G.tribLast[t]={ok:false,txt:`Abgelehnt – und ${A.short} hat euch den Krieg erklärt! (Haltung −${T.angry})`}; msg(`👑 Tributforderung abgelehnt – ${A.short} erklärt den Krieg!`,'#ff8a7a'); return 'krieg'; }   // Drohung ohne Macht dahinter
    G.tribLast[t]={ok:false,txt:'Abgelehnt: '+e.reasons.join(', ')+` (Haltung −${T.angry}).`}; msg(`👑 ${A.short} lehnt eure Tributforderung ab.`,'#ffb38a');
    return 'nein'; }
  addAtt(t,0,-T.grudge); (ai.humBy=ai.humBy||{})[0]=G.t;
  if(kind==='land'){ const L=landOffer(t); let pop=0;
    for(const b of L){ b.owner=0; b.upg=null; if(b.resid){ pop+=b.resid; } }
    A.pop=Math.max(10,A.pop-pop); P.pop+=pop*0.8;
    for(const u of G.units) if(!u.dead&&u.owner===t&&L.some(b=>dist(b.x,b.y,u.x,u.y)<4)){ u.target=null; }
    recalcPower(0); recalcPower(t); G.qDirty=true; G.roadDirty=true;
    const tx=`🏳 ${A.short} tritt Land ab: ${L.map(b=>b.def.name.replace(/\u00AD/g,'')).join(', ')} gehören jetzt Aldoria (+${Math.round(pop*0.8)} Einwohner).`; msg(tx,'#9fd88a'); G.tribLast[t]={ok:true,txt:tx}; }
  else if(recurring){ G.tributes=(G.tributes||[]).filter(x=>x.from!==t); G.tributes.push({from:t, res:kind, amt, next:G.t+T.every, paid:0});
    const tx=`👑 Angenommen: ${A.short} zahlt ab jetzt jede Minute ${amt} ${icon(kind)} – die erste Zahlung kommt in einer Minute Spielzeit.`; msg(tx,'#9fd88a'); G.tribLast[t]={ok:true,txt:tx}; }
  else { A.res[kind]-=amt; P.res[kind]+=amt; const tx=`👑 Angenommen: ${A.short} hat ${amt} ${icon(kind)} gezahlt – schon in eurem Lager (jetzt ${Math.floor(P.res[kind])}).`; msg(tx,'#9fd88a'); G.tribLast[t]={ok:true,txt:tx}; }
  G.tribLast[t].txt+=` ${A.short} ist gekränkt (Haltung −${T.grudge}).`;
  if(atWar(0,t)) setWar(0,t,false,t);   // Tribut als Friedensbedingung
  return 'ok';
}
/** laufender Tribut: Zahlung jede Minute – die Macht stellt ein, sobald sie sich nicht mehr fürchtet */
export function updateTribute(){
  for(const tr of [...(G.tributes||[])]){ if(G.t<tr.next) continue;
    tr.next=G.t+TRIBUTE.every;
    const t=tr.from, A=G.players[t], P=G.players[0], e=evalTribute(t,tr.res,tr.amt,true);
    if(atWar(0,t)||e.fear-e.pain<-0.3||!G.buildings.some(b=>!b.dead&&b.owner===t&&b.type==='hq')){ G.tributes=G.tributes.filter(x=>x!==tr);
      msg(`👑 ${A.short} stellt die Tributzahlungen ein – es fürchtet euch nicht mehr.`,'#ffb38a'); continue; }
    const a=Math.min(tr.amt,Math.floor(A.res[tr.res]||0)); if(a<=0) continue;
    A.res[tr.res]-=a; P.res[tr.res]+=a; tr.paid+=a;
    msg(`👑 Tribut von ${A.short}: +${a} ${icon(tr.res)}`,'#d2bd62');
    const hq=G.buildings.find(b=>!b.dead&&b.owner===0&&b.type==='hq'); if(hq) fxAdd({k:'loot',x:hq.x,y:hq.y,txt:`👑 +${a} ${icon(tr.res)}`,col:'#ffd36a',life:3}); }
}
export function waiveTribute(t=1){ const tr=tributeOf(t); if(tr){ G.tributes=G.tributes.filter(x=>x!==tr); addAtt(t,0,10); } }
