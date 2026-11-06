import { AIS, AI_CHAR, AI_WAR, MAJORS, PACT, RESEARCH, isAI } from '../data/config';
import { G } from '../sim/state';
import { addAtt, atWar, attOf, foesOf, setWar } from '../sim/world';
import { deterrent } from '../sim/nuke';
import { msg } from '../core/events';
import { offerHandlers, showOffer } from '../sim/offers';

/* =====================================================================
   Geheimabsprachen zwischen Aldoria und einer KI-Macht
   ---------------------------------------------------------------------
   joint – gemeinsam gegen die dritte Macht (die KI erklärt ihr den Krieg;
           auf Wunsch auch Aldoria). Solange gilt: kein Krieg untereinander,
           kein Separatfrieden mit dem Ziel.
   nap   – Nichtangriffspakt: keine Kriegserklärung, keine Drohungen.
   intel – einmaliger Lagebericht über die dritte Macht (gegen Geld).
   Die KI entscheidet nach eigenem Vorteil (pactTerms): Haltung, Stärke,
   Bedrohung durch das Ziel, Charakter, frühere Wortbrüche. Fehlt der
   Wille, nennt sie einen Preis – oder lehnt ab. Ein Sprachmodell darf nur
   formulieren und innerhalb dieser Grenzen verhandeln.
   ===================================================================== */
export type Deal = {kind:'joint'|'nap'|'intel', target?:number, money:number, join?:boolean};
export const pactList=()=>(G.pacts||(G.pacts=[]));
const alive=pid=>G.buildings.some(b=>!b.dead&&b.owner===pid&&!b.def.def);
const beaten=pid=>!!(G.beaten&&G.beaten[pid])||!alive(pid);
/** besteht eine Abmachung zwischen Aldoria und der KI f (joint schließt Nichtangriff ein)? */
export const pactWith=(f,kind?)=>pactList().find(p=>p.f===f&&(!kind||p.kind===kind));
/** darf die Macht a der Macht b nicht den Krieg erklären bzw. drohen? */
export const bound=(a,b)=>(a===0&&isAI(b)&&!!pactWith(b))||(b===0&&isAI(a)&&!!pactWith(a));
/** hat die KI f zugesagt, gegen X zu kämpfen? */
export const jointAgainst=(f,X)=>pactList().some(p=>p.f===f&&p.kind==='joint'&&p.target===X);
/** Zielmächte, gegen die man mit f paktieren kann */
export const pactTargets=f=>MAJORS.filter(x=>x!==0&&x!==f&&G.known[0][x]&&!beaten(x));
const why0={krieg:'wir sind im Krieg miteinander', schon:'es gibt schon eine Abmachung', ziel:'kein gültiges Ziel', unbekannt:'diese Macht kennen wir nicht', abschreckung:'das Ziel hat eine Atomrakete',
  zweifront:'wir führen schon einen anderen Krieg', schwach:'wir sind zu schwach dafür', freund:'wir sind mit dem Ziel gut Freund', frueh:'für einen Krieg ist es noch zu früh', misstrauen:'wir trauen Aldoria nicht',
  wortbruch:'Aldoria hat schon Abmachungen gebrochen', stark:'wir sind stärker als ihr', vorsprung:'Aldoria wächst uns über den Kopf', besiegt:'besiegt'};
export const whyText=k=>why0[k]||k;
/** Bedingungen der KI f für ein Geschäft: need = Mindestbetrag, den Aldoria zahlt (negativ: die KI zahlt), null = nie */
export function pactTerms(f, d:Deal){
  const ai=G.ais[f], A=G.players[f], C=AI_CHAR[f], why:string[]=[];
  if(!ai||beaten(f)) return {need:null, why:['besiegt']};
  if(atWar(f,0)) return {need:null, why:['krieg']};
  const brk=(G.pactBreaks||0)*PACT.brokenW, att=attOf(f,0), unit=PACT.unit[C.key]||15;
  if(brk) why.push('wortbruch'); if(att<0) why.push('misstrauen');
  if(d.kind==='intel'){
    const X=d.target; if(X===undefined||!pactTargets(f).includes(X)) return {need:null, why:['ziel']};
    if(!G.known[f][X]) return {need:null, why:['unbekannt']};
    if(att<-20) return {need:null, why};
    return {need:Math.round(PACT.intelPrice[C.key]*(1+brk/50)/50)*50, why}; }
  let w=0, thr=0;
  if(d.kind==='nap'){
    if(pactWith(f)) return {need:null, why:['schon']};
    const r=(ai.rat&&ai.rat[0])??1, lead=!!(ai.leads&&ai.leads[0]);
    if(r>1.3) why.push('stark'); if(lead) why.push('vorsprung');
    w=att/2+20-Math.max(0,r-1)*20-(C.key==='militar'?10:0)-brk-(lead?15:0); thr=PACT.thrNap;
  } else {
    const X=d.target;
    if(X===undefined||!MAJORS.includes(X)||X===0||X===f||beaten(X)) return {need:null, why:['ziel']};
    if(!G.known[f][X]||(d.join&&!G.known[0][X])) return {need:null, why:['unbekannt']};
    if(pactWith(f)) return {need:null, why:['schon']};
    if(deterrent(X)&&!deterrent(f)) return {need:null, why:['abschreckung']};
    if(foesOf(f).some(o=>o!==X)) return {need:null, why:['zweifront']};
    const r=(ai.rat&&ai.rat[X])??1, warX=atWar(f,X);
    if(r<0.45&&!d.join&&!warX) return {need:null, why:['schwach']};
    if(r<0.8) why.push('schwach'); if(attOf(f,X)>20) why.push('freund');
    const early=G.t<AI_WAR.minT&&!warX; if(early) why.push('frueh');
    w=att/2-attOf(f,X)/2+(ai.leads&&ai.leads[X]?25:0)+Math.max(-40,Math.min(30,(r-1)*30))+(d.join?25:0)+(C.aggr-0.9)*50+(warX?40:0)-brk-(early?25:0)+(d.join&&atWar(0,X)?10:0);
    thr=PACT.thrJoint;
  }
  const gap=thr-w; if(gap>PACT.maxGap) return {need:null, why:why.length?why:['misstrauen']};
  let need=Math.round(gap*unit/50)*50;
  if(need<0) need=d.kind==='joint'&&d.join?Math.max(need,-Math.min(PACT.maxPay,Math.floor(Math.max(0,A.res.money)*0.3/50)*50)):0;   // die KI zahlt höchstens, wenn Aldoria mitkämpft
  return {need, why};
}
/** würde die KI f dieses Geschäft annehmen? */
export function judge(f, d:Deal){ const t=pactTerms(f,d); return {...t, ok:t.need!==null&&d.money>=t.need}; }
/** Text eines Geschäfts (für Dialoge und das Sprachmodell) */
export function dealText(f, d:Deal){
  const X=d.target!==undefined?G.players[d.target]?.short:'', m=d.money>0?` – Aldoria zahlt ${d.money} $`:d.money<0?` – ${G.players[f].short} zahlt ${-d.money} $`:'';
  if(d.kind==='joint') return `Gemeinsam gegen ${X}${d.join?' (Aldoria greift mit an)':` (nur ${G.players[f].short} greift an)`}, ${Math.round(PACT.jointDur/60)} min${m}`;
  if(d.kind==='nap') return `Nichtangriffspakt, ${Math.round(PACT.napDur/60)} min${m}`;
  return `Lagebericht über ${X}${m}`;
}
/** Lagebericht der KI f über X – was f wirklich weiß (Truppen nur grob) */
function intelReport(f,X){
  const c={inf:0, veh:0, heavy:0, air:0, missile:0}; let n=0;
  for(const u of G.units){ if(u.dead||u.owner!==X||!u.def.weapon) continue; n++;
    if(u.type==='tel'||u.type==='mlrs') c.missile++; else if(u.def.cls==='air') c.air++; else if(u.def.armor==='heavy') c.heavy++; else if(u.def.cls==='veh') c.veh++; else c.inf++; }
  const r=v=>v<3?v:Math.round(v/2)*2, P=G.players[X];
  const tech=Object.keys(P.done||{}).filter(k=>RESEARCH[k]&&!RESEARCH[k].level).map(k=>RESEARCH[k].name);
  const q=P.q&&P.q.research&&P.q.research[0];
  return `${G.players[f].short} über ${P.short}: etwa ${r(n)} Kampfeinheiten (🪖 ${r(c.inf)} · 🚙 ${r(c.veh)} · 🛡 ${r(c.heavy)} · ✈ ${r(c.air)} · 🚀 ${r(c.missile)}), ${Math.round(P.pop)} Einwohner. `+
    `Erforscht: ${tech.length?tech.slice(-6).join(', '):'nichts Nennenswertes'}.${q&&RESEARCH[q.type]?` Forscht gerade: ${RESEARCH[q.type].name}.`:''}${(P.nukes||0)>0?' ☢ Besitzt eine Atomrakete!':''}${foesOf(X).length?` Im Krieg mit ${foesOf(X).map(o=>G.players[o].short).join(', ')}.`:''}`;
}
/** Geschäft abschließen (prüft erneut) – ok, oder Grund der Ablehnung */
export function conclude(f, d:Deal){
  const j=judge(f,d), P=G.players[0], A=G.players[f], ai=G.ais[f];
  if(!j.ok) return {ok:false, need:j.need, why:j.why};
  if(d.money>0&&P.res.money<d.money) return {ok:false, need:j.need, why:['geld']};
  if(d.money>0){ P.res.money-=d.money; A.res.money+=d.money; } else if(d.money<0){ const m=Math.min(-d.money,Math.max(0,A.res.money)); A.res.money-=m; P.res.money+=m; }
  addAtt(f,0,PACT.signAtt);
  if(d.kind==='intel'){ const rep=intelReport(f,d.target); msg('🕵 '+rep,'#b8c8e0'); return {ok:true, report:rep}; }
  const p:any={id:(G.pactId=(G.pactId||0)+1), kind:d.kind, f, t0:G.t, until:G.t+(d.kind==='joint'?PACT.jointDur:PACT.napDur), money:d.money};
  if(d.kind==='joint'){ const X=d.target; p.target=X; p.join=!!d.join;
    if(!atWar(f,X)) setWar(f,X,true,f);
    ai.foe=X; ai.foeT=p.until; ai.nextRaid=0;
    if(p.join&&!atWar(0,X)) setWar(0,X,true,0); }
  pactList().push(p);
  msg(`🤝 Abmachung mit ${A.short}: ${dealText(f,d)}.`,'#9fd88a');
  return {ok:true, pact:p};
}
const end=p=>{ G.pacts=pactList().filter(q=>q!==p); };
/** Wortbruch Aldorias: die betroffene KI ist empört, die anderen merken es sich */
function broken(p,txt,att){ const A=G.players[p.f];
  addAtt(p.f,0,-att); for(const o of AIS) if(o!==p.f) addAtt(o,0,-PACT.breakOther);
  G.pactBreaks=(G.pactBreaks||0)+1; end(p);
  msg(`💔 ${txt} ${A.leader}: „Aldorias Wort ist nichts wert.“`,'#ff8a7a'); }
/** jede Sekunde: Abmachungen überwachen, Vorschläge der KI */
export function updatePacts(){
  for(const p of [...pactList()]){ const A=G.players[p.f];
    if(beaten(p.f)){ end(p); continue; }
    if(atWar(0,p.f)){ broken(p,`Ihr habt ${A.short} trotz Abmachung den Krieg erklärt.`,PACT.breakAtt); continue; }
    if(p.kind==='joint'){ const X=p.target, XN=G.players[X].short;
      if(beaten(X)){ addAtt(p.f,0,PACT.winAtt); end(p); msg(`🏆 ${XN} ist besiegt – das Bündnis mit ${A.short} hat sein Ziel erreicht.`,'#9fd88a'); continue; }
      if(p.join&&!atWar(0,X)){ broken(p,`Ihr habt Separatfrieden mit ${XN} geschlossen.`,PACT.peaceBreakAtt); continue; }
      if(!atWar(p.f,X)){ end(p); (G.betrayed=G.betrayed||{})[p.f]=((G.betrayed||{})[p.f]||0)+1;
        msg(`⚠ ${A.short} hat Frieden mit ${XN} geschlossen – die Abmachung ist hinfällig.${p.join?' Ihr steht allein im Krieg.':''}`,'#ffb38a'); continue; } }
    if(G.t>p.until){ addAtt(p.f,0,PACT.doneAtt); end(p); msg(`🤝 Die Abmachung mit ${A.short} ist ausgelaufen (${p.kind==='joint'?'Bündnis':'Nichtangriffspakt'}). Beide Seiten haben Wort gehalten.`,'#9fd88a'); }
  }
  // Die KI selbst schlägt ein Bündnis gegen die dritte Macht vor
  if(G.offer||G.over) return;
  for(const f of AIS){ const ai=G.ais[f];
    if(!ai||!G.known[0][f]||!G.known[f][0]||beaten(f)||atWar(0,f)||pactWith(f)||G.t<(ai.pactAsk??PACT.askFirst)||attOf(f,0)<PACT.askAtt) continue;
    for(const X of pactTargets(f)){ if(atWar(0,X)&&atWar(f,X)) continue;
      if(!(atWar(f,X)||(ai.leads&&ai.leads[X]&&attOf(f,X)<0&&G.t>AI_WAR.minT))) continue;
      const t=pactTerms(f,{kind:'joint', target:X, join:true, money:0}); if(t.need===null||t.need>0) continue;
      ai.pactAsk=G.t+PACT.askCool;
      showOffer({type:'pact', from:f, deal:{kind:'joint', target:X, join:true, money:Math.round(t.need/2/50)*50}}); return; }
  }
}
offerHandlers.pact=(o,yes)=>{
  if(!yes){ addAtt(o.from,0,-5); msg(`Bündnisangebot von ${G.players[o.from].short} abgelehnt.`,'#ffb38a'); return; }
  const r=conclude(o.from,o.deal); if(!r.ok) msg(`Das Bündnis kam nicht zustande (${r.why.map(whyText).join(', ')}).`,'#ffb38a');
};
