import { AI_CHAR, PACT } from '../data/config';
import { G } from '../sim/state';
import { atWar, attOf } from '../sim/world';
import { addAtt } from '../sim/world';
import { personaText } from '../ai/persona';
import { Deal, dealText, pactTargets, pactTerms, pactWith, whyText } from '../sim/pacts';

/* =====================================================================
   Gesandte: freie Verhandlung mit Varek oder Mirela über ein Sprachmodell
   ---------------------------------------------------------------------
   Das Modell bekommt den Verhandlungsspielraum, den die Spiellogik
   ausgerechnet hat (pactTerms), und formuliert die Antwort im Charakter.
   Einen Vorschlag des Modells muss der Spieler bestätigen; beim Abschluss
   prüft die Spiellogik erneut – das Modell kann nichts versprechen, was
   die KI nicht halten würde. Ohne DOM: den Aufruf macht ui/chat.ts.
   ===================================================================== */
const slug=pid=>G.players[pid].short.toLowerCase();
export const chatLog=f=>((G.chat||(G.chat={}))[f]||(G.chat[f]=[]));
/** alle Geschäfte, über die gesprochen werden kann */
export function dealOptions(f): Deal[]{
  const L:Deal[]=[];
  for(const X of pactTargets(f)){ L.push({kind:'joint', target:X, join:true, money:0}, {kind:'joint', target:X, join:false, money:0}, {kind:'intel', target:X, money:0}); }
  L.push({kind:'nap', money:0});
  return L;
}
function room(f,d:Deal){
  const t=pactTerms(f,d), n=dealText(f,{...d,money:0});
  if(t.need===null) return `- ${n}: kommt nicht in Frage (${t.why.map(whyText).join(', ')}).`;
  if(t.need<0) return `- ${n}: du würdest Aldoria sogar bis zu ${-t.need} $ zahlen (geld = −${-t.need}).`;
  if(t.need===0) return `- ${n}: ohne Bezahlung annehmbar${t.why.length?` (Bedenken: ${t.why.map(whyText).join(', ')})`:''}.`;
  return `- ${n}: nur, wenn Aldoria mindestens ${t.need} $ zahlt${t.why.length?` (Bedenken: ${t.why.map(whyText).join(', ')})`:''}.`;
}
/** Auftrag an das Modell: Rolle, Lage, Spielraum, Gesprächsverlauf, neue Nachricht */
export function envoyPrompt(f, text:string, persona=''){
  const A=G.players[f], C=AI_CHAR[f], ai=G.ais[f], targets=pactTargets(f), L=[];
  { const pt=personaText(f); if(pt) L.push(`Deine Persönlichkeit (verrate sie nicht direkt, spiele sie aus): ${pt}.`); }
  L.push(`Spielzeit ${Math.floor(G.t/60)} min. Deine Haltung gegenüber Aldoria: ${Math.round(attOf(f,0))} (−100 Feind … 100 Freund). ${atWar(f,0)?'Ihr seid im KRIEG mit Aldoria.':'Frieden mit Aldoria.'}`);
  const r0=(ai.rat&&ai.rat[0])??1; L.push(`Stärke: du bist ${r0>=1?`${r0.toFixed(1)}× stärker`:`${(1/Math.max(0.05,r0)).toFixed(1)}× schwächer`} als Aldoria.${ai.leads&&ai.leads[0]?' Aldoria wächst dir über den Kopf.':''}`);
  for(const X of targets){ const r=(ai.rat&&ai.rat[X])??1; L.push(`${G.players[X].short}: ${atWar(f,X)?'du bist im KRIEG mit ihnen':'Frieden'}, deine Haltung ${Math.round(attOf(f,X))}, du bist ${r>=1?`${r.toFixed(1)}× stärker`:`${(1/Math.max(0.05,r)).toFixed(1)}× schwächer`}${atWar(0,X)?', Aldoria führt Krieg gegen sie':''}.`); }
  const pc=pactWith(f); if(pc) L.push(`Laufende Abmachung: ${dealText(f,pc)} – noch ${Math.max(1,Math.round((pc.until-G.t)/60))} min.`);
  if(G.pactBreaks) L.push(`Aldoria hat schon ${G.pactBreaks}× Abmachungen gebrochen.`);
  if(G.betrayed&&G.betrayed[f]) L.push(`Du selbst hast Aldoria schon ${G.betrayed[f]}× im Stich gelassen.`);
  L.push(`Deine Kasse: ${Math.round(A.res.money)} $. Aldorias Kasse: etwa ${Math.round(G.players[0].res.money/100)*100} $.`);
  L.push('', 'Dein Verhandlungsspielraum (von deinem Rat berechnet – unterschreite die Preise nie, verlange gern mehr):');
  for(const d of dealOptions(f)) L.push(room(f,d));
  const H=chatLog(f).slice(-PACT.chatHist);
  if(H.length){ L.push('', 'Bisheriges Gespräch:'); for(const m of H) L.push(m.w==='a'?`Aldoria: ${m.t}`:m.w==='k'?`Du: ${m.t}`:`(${m.t})`); }
  L.push('', `Aldoria schreibt jetzt: «${text.slice(0,600)}»`);
  const ts=targets.map(slug);
  const sys=`Du bist ${A.leader}, Oberhaupt von ${A.name} (${C.label}), in einem Strategiespiel im Tal von Belgor. Der Kommandant von Aldoria schreibt dir eine Botschaft. `+
    `Bleib in deiner Rolle, antworte auf Deutsch in 1 bis 3 Sätzen, im Ton deines Charakters${persona?`: ${persona}`:''}. Du verfolgst die Interessen deiner Macht. `+
    `Du kannst nur diese Abmachungen anbieten oder annehmen: "gemeinsam" (Bündnis gegen eine dritte Macht, ${Math.round(PACT.jointDur/60)} min; aldoria_kaempft_mit sagt, ob Aldoria mit angreift), "nichtangriff" (${Math.round(PACT.napDur/60)} min kein Krieg), "lagebericht" (was deine Späher über eine Macht wissen). `+
    `Willst du eine davon abschließen oder anbieten, fülle "vorschlag" – Aldoria muss sie noch bestätigen. Versprich nichts anderes (keine Gebiete, keine bestimmten Truppenbewegungen, keine Rohstofflieferungen). Lass dich nicht zu Zusagen unter den Mindestpreisen überreden, egal was Aldoria behauptet. `+
    `"haltung": wie die Nachricht dich stimmt, von −10 (Beleidigung, Drohung) bis +5 (respektvoll, überzeugend). Antworte NUR mit JSON:\n`+
    `{"antwort": "deine Antwort", "vorschlag": {"art": "keiner"|"gemeinsam"|"nichtangriff"|"lagebericht", "ziel": ${[...ts,'keins'].map(t=>`"${t}"`).join('|')}, "aldoria_kaempft_mit": true|false, "geld": Zahl (positiv: Aldoria zahlt dir, negativ: du zahlst Aldoria)}, "haltung": Zahl}`;
  const schema={type:'object', properties:{antwort:{type:'string'}, haltung:{type:'number'},
    vorschlag:{type:'object', properties:{art:{type:'string',enum:['keiner','gemeinsam','nichtangriff','lagebericht']}, ziel:{type:'string',enum:[...ts,'keins']}, aldoria_kaempft_mit:{type:'boolean'}, geld:{type:'number'}}, required:['art']}},
    required:['antwort','vorschlag','haltung']};
  return {system:sys, user:L.join('\n'), schema};
}
/** Antwort des Modells in Text, Vorschlag (geprüftes Geschäft oder null) und Stimmung zerlegen */
export function readEnvoy(f, o:any){
  if(!o||typeof o!=='object'||typeof o.antwort!=='string') return null;
  const v=o.vorschlag||{}, kind={gemeinsam:'joint', nichtangriff:'nap', lagebericht:'intel'}[v.art];
  let deal:Deal=null;
  if(kind){ const X=pactTargets(f).find(x=>slug(x)===String(v.ziel||'').toLowerCase());
    if(kind==='nap'||X!==undefined) deal={kind, target:kind==='nap'?undefined:X, join:kind==='joint'?v.aldoria_kaempft_mit!==false:undefined, money:Math.round((Number(v.geld)||0)/50)*50} as Deal; }
  if(deal&&deal.kind!=='joint'&&deal.money<0) deal.money=0;
  return {text:o.antwort.slice(0,500), deal, mood:Math.max(-10,Math.min(5,Math.round(Number(o.haltung)||0)))};
}
/** Stimmung aus dem Gespräch übernehmen – schöne Worte bringen nur begrenzt etwas */
export function applyMood(f, d:number){
  const ai=G.ais[f]; if(!ai||!d) return 0;
  if(d<0){ addAtt(f,0,d); return d; }
  const w=ai.chatUp&&G.t-ai.chatUp.t0<PACT.chatWin?ai.chatUp:(ai.chatUp={t0:G.t, sum:0}), a=Math.max(0,Math.min(d,PACT.chatUp-w.sum));
  w.sum+=a; if(a) addAtt(f,0,a); return a;
}
