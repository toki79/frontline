import { msg } from '../core/events';
import { AI_CHAR, AI_WAR, BUILDINGS, MAJORS, RES, RESEARCH, STRATEGIST, UNITS, hasTech } from '../data/config';
import { costOf } from '../sim/costs';
import { armyEstimate, knows } from '../sim/intel';
import { available, exclBlock } from '../sim/production';
import { G } from '../sim/state';
import { addAtt, atWar, attOf, countBuildings } from '../sim/world';
import { aiDemand, aiOfferPeace } from './kastrova';
import { setWar } from '../sim/world';

/* =====================================================================
   LLM-Stratege (optional): Lagebild für ein Sprachmodell und Umsetzung
   seiner Entscheidungen. Ohne DOM – den Aufruf (Ollama) macht ui/llm.ts.
   ---------------------------------------------------------------------
   Das Modell trifft nur die großen Entscheidungen (Schwerpunkt, Forschung,
   Krieg/Frieden/Forderungen, Angriffsziele). Alles andere erledigt die
   eingebaute KI. Jede Entscheidung wird geprüft; ist sie veraltet (das
   Modell antwortet nicht mehr), entscheidet wieder die eingebaute KI.
   Das Lagebild enthält nur, was die Macht wirklich weiß.
   ===================================================================== */
export const FOCI = ['wachstum','ruestung','forschung','verteidigung'];
export const ACTIONS = ['nichts','krieg_erklaeren','frieden_anbieten','fordern','geschenk'];
export const TARGETS = ['keins','farm','mine','refinery','house','power','factory','university','hq'];
const slug = pid => G.players[pid].short.toLowerCase();
const fmt = n => Math.round(n).toLocaleString('de-DE');
/** gilt die letzte Entscheidung des Strategen noch? */
export const llmActive = ai => !!(ai&&ai.llm&&G.t-ai.llm.t<ai.llm.ttl);
/** Forschungen, die die Macht jetzt beginnen könnte */
export function researchOptions(pid){
  const p=G.players[pid];
  return Object.keys(RESEARCH).filter(k=>!hasTech(p,k)&&!exclBlock(p,k)&&available(pid,k)).slice(0,10);
}
/** Lagebild und Antwortformat für das Modell */
export function strategistPrompt(pid, persona=''){
  const p=G.players[pid], ai=G.ais[pid], C=AI_CHAR[pid], others=MAJORS.filter(o=>o!==pid&&G.buildings.some(b=>!b.dead&&b.owner===o));
  const L=[];
  const mm=Math.floor(G.t/60);
  L.push(`Spielzeit: ${mm} min. Deine Stadt: ${fmt(p.pop)} Einwohner (Platz für ${fmt(p.cap)}), Zufriedenheit ${Math.round((p.happy??1)*100)} %.`);
  const r=p.rate||{}, net=(r.money||0)+(r.export||0)-(r.upkeep||0)-(r.wages||0)-(r.admin||0);
  L.push(`Kasse ${fmt(p.res.money)} $ (${net>=0?'+':''}${net.toFixed(1)} $/s). Lager: ${['food','wood','stone','metal','oil'].map(k=>`${RES[k].name} ${fmt(p.res[k]||0)}`).join(', ')}.`);
  L.push(`Reich an: ${G.profile[pid].rich.map(k=>RES[k].name).join(', ')||'–'}; knapp: ${G.profile[pid].scarce.map(k=>RES[k].name).join(', ')||'–'}.`);
  const bc={}; for(const b of G.buildings) if(!b.dead&&b.owner===pid&&!b.def.def) bc[b.def.name.replace(/­/g,'')]=(bc[b.def.name.replace(/­/g,'')]||0)+1;
  L.push(`Gebäude: ${Object.entries(bc).map(([n,k])=>`${k}× ${n}`).join(', ')}.`);
  const uc={}; for(const u of G.units) if(!u.dead&&u.owner===pid&&u.def.weapon) uc[u.def.name.replace(/­/g,'')]=(uc[u.def.name.replace(/­/g,'')]||0)+1;
  L.push(`Armee: ${Object.entries(uc).map(([n,k])=>`${k}× ${n}`).join(', ')||'keine'}. Verteidigungsanlagen: ${G.buildings.filter(b=>!b.dead&&b.owner===pid&&b.def.def).length}.`);
  const done=Object.keys(p.done||{}).filter(k=>RESEARCH[k]).map(k=>RESEARCH[k].name), cur=p.q.research[0];
  L.push(`Erforscht: ${done.join(', ')||'nichts'}.${cur?` In Arbeit: ${RESEARCH[cur.type].name}.`:''}${countBuildings(pid,'university')?'':' Noch keine Universität.'}`);
  const ro=researchOptions(pid);
  if(ro.length) L.push(`Jetzt möglich: ${ro.map(k=>`${k} (${RESEARCH[k].name}${RESEARCH[k].excl?', schließt Alternativen aus':''}${RESEARCH[k].win?', SIEG':''}, ${fmt(costOf(k,pid).money||0)} $)`).join('; ')}.`);
  L.push('');
  L.push('Andere Mächte:');
  for(const o of others){ const P=G.players[o], k=G.known[pid][o], K=knows(pid,o), est=armyEstimate(pid,o);
    if(!k){ L.push(`- ${slug(o)}: noch kein Kontakt.`); continue; }
    const rat=(ai.rat&&ai.rat[o])??1;
    const threats=[...Object.keys(K.tech).filter(t=>RESEARCH[t]).map(t=>RESEARCH[t].name), ...Object.keys(K.units).map(u=>UNITS[u]?UNITS[u].name.replace(/­/g,''):u)];
    L.push(`- ${slug(o)} (${P.name}): ${atWar(pid,o)?'KRIEG':'Frieden'}, ${fmt(P.pop)} Einwohner, deine Haltung ${Math.round(attOf(pid,o))}, wir sind ${rat>=1?`${rat.toFixed(1)}× stärker`:`${(1/Math.max(0.05,rat)).toFixed(1)}× schwächer`}`+
      (est?`, Truppen geschätzt: ${est.inf} Inf., ${est.veh} Fahrz., ${est.heavy} Panzer, ${est.air} Luft, ${est.missile} Raketen`:'')+(threats.length?`, bekannt: ${threats.join(', ')}`:'')+(K.plan&&G.t-K.plan.t<300?', plant einen Angriff auf dich!':'')+'.'); }
  L.push(`- miliz (Grenzmiliz, Markt in der Talmitte): ${G.militiaAlly===pid?'mit dir verbündet':G.militiaAlly>=0?`verbündet mit ${slug(G.militiaAlly)}`:'neutral'}, dein Ansehen ${Math.round(G.attitude[pid]||0)}.`);
  if(ai.need) L.push(`Engpass: ${RES[ai.need].name}.`);
  if(ai.llm&&ai.llm.reason) L.push(`Deine letzte Entscheidung: ${ai.llm.reason}`);
  const keys=others.map(slug);
  const sys=`Du bist der oberste Stratege von ${p.name} (${C.label}) in einem Echtzeit-Strategiespiel im Tal von Belgor. Ziel: deine Macht soll überleben und das Tal beherrschen – militärisch, wissenschaftlich (Kernfusion) oder wirtschaftlich (Welthandel). `+
    `Krieg kostet Truppen und Wachstum; Frieden und Handel bringen Geld. Triff jetzt die großen Entscheidungen für die nächste Minute.${persona?` Charakter: ${persona}`:''}\n`+
    `Antworte NUR mit einem JSON-Objekt:\n{"schwerpunkt": ${FOCI.map(f=>`"${f}"`).join('|')}, "forschung": eine Kennung aus "Jetzt möglich" oder "keine", `+
    `${keys.map(k=>`"${k}": ${ACTIONS.map(a=>`"${a}"`).join('|')}`).join(', ')}, "forderung": {"rohstoff": "money|food|wood|stone|metal|oil", "menge": Zahl} (nur bei "fordern"), "angriffsziel": ${TARGETS.map(t=>`"${t}"`).join('|')}, "miliz": "nichts"|"geschenk", "begruendung": "ein kurzer Satz"}`;
  const props:any={schwerpunkt:{type:'string',enum:FOCI}, forschung:{type:'string'}, angriffsziel:{type:'string',enum:TARGETS}, miliz:{type:'string',enum:['nichts','geschenk']}, begruendung:{type:'string'},
    forderung:{type:'object',properties:{rohstoff:{type:'string',enum:['money','food','wood','stone','metal','oil']},menge:{type:'number'}}}};
  for(const k of keys) props[k]={type:'string',enum:ACTIONS};
  const schema={type:'object',properties:props,required:['schwerpunkt','forschung',...keys,'begruendung']};
  return {system:sys, user:L.join('\n'), schema};
}
/** Antwort des Modells (Text) in ein Objekt verwandeln – auch wenn es Text drumherum schreibt */
export function parseDecision(txt: string){
  if(!txt) return null;
  const t=txt.replace(/<think>[\s\S]*?<\/think>/g,'').replace(/```(json)?/g,'');
  const a=t.indexOf('{'), b=t.lastIndexOf('}'); if(a<0||b<=a) return null;
  try{ return JSON.parse(t.slice(a,b+1)); }catch(e){ return null; }
}
/** Entscheidung prüfen und umsetzen. Gibt die ausgeführten Schritte zurück (für das Protokoll). */
export function applyDecision(pid, d, opt:{ttl?:number, model?:string}={}){
  const ai=G.ais[pid], p=G.players[pid], done=[]; if(!ai||!d||typeof d!=='object') return {ok:false, done:['ungültige Antwort']};
  const others=MAJORS.filter(o=>o!==pid);
  const focus=FOCI.includes(d.schwerpunkt)?d.schwerpunkt:'wachstum';
  const research=researchOptions(pid).includes(d.forschung)?d.forschung:null;
  const raid=TARGETS.includes(d.angriffsziel)&&d.angriffsziel!=='keins'?d.angriffsziel:null;
  const reason=String(d.begruendung||'').slice(0,240);
  ai.llm={t:G.t, ttl:opt.ttl||STRATEGIST.ttl, model:opt.model||'', focus, research, raid, reason, n:(ai.llm&&ai.llm.n||0)+1};
  done.push(`Schwerpunkt ${focus}`); if(research) done.push(`Forschung ${RESEARCH[research].name}`); else if(d.forschung&&d.forschung!=='keine') done.push(`Forschung „${d.forschung}“ verworfen`);
  const met=o=>G.known[pid][o]&&G.known[o][pid];
  for(const o of others){ const a=d[slug(o)]; if(!ACTIONS.includes(a)||a==='nichts'||!G.buildings.some(b=>!b.dead&&b.owner===o)) continue;
    const war=atWar(pid,o), n=G.players[o].short;
    if(a==='krieg_erklaeren'){
      const gate=o===0?G.diff.grace:AI_WAR.minT*0.5;
      if(!war&&met(o)&&G.t>gate&&G.t>ai.cool){ setWar(pid,o,true,pid); ai.cool=G.t+60; ai.nextRaid=0; done.push(`Krieg gegen ${n}`); } else done.push(`Krieg gegen ${n} (noch) nicht möglich`); }
    else if(a==='frieden_anbieten'){
      const since=(ai.warSince||{})[o];
      if(war&&G.t>ai.peaceCool&&(since===undefined||G.t-since>AI_WAR.minDur)){ ai.peaceCool=G.t+120; aiOfferPeace(pid,o); done.push(`Friedensangebot an ${n}`); } }
    else if(a==='fordern'){
      const f=d.forderung||{}, res=['money','food','wood','stone','metal','oil'].includes(f.rohstoff)?f.rohstoff:'money';
      const lim=STRATEGIST.demand[res==='money'?'money':'res'], amt=Math.max(lim[0],Math.min(lim[1],Math.round((Number(f.menge)||lim[0])/10)*10));
      if(!war&&met(o)&&G.t>ai.cool&&G.t>G.diff.grace&&!(o===0&&G.offer)){ ai.cool=G.t+150; aiDemand(pid,o,res,amt); done.push(`Forderung an ${n}: ${amt} ${res==='money'?'$':RES[res].name}`); } }
    else if(a==='geschenk'){
      if(!war&&met(o)&&p.res.money>=STRATEGIST.gift+300&&G.t>(ai.giftCool||0)){ ai.giftCool=G.t+90; p.res.money-=STRATEGIST.gift;
        if(o===0){ G.players[0].res.money+=STRATEGIST.gift; msg(`🎁 ${p.short} schickt Aldoria ein Geschenk: ${STRATEGIST.gift} $.`,'#9fd88a'); }
        else { G.players[o].res.money+=STRATEGIST.gift; addAtt(o,pid,8); }
        done.push(`Geschenk an ${n}`); } }
  }
  if(d.miliz==='geschenk'&&G.known[pid][2]&&!G.militiaWar[pid]&&p.res.money>=600&&G.t>(ai.milGiftCool||0)){ ai.milGiftCool=G.t+60; p.res.money-=300; G.attitude[pid]=Math.min(100,(G.attitude[pid]||0)+12); done.push('Geschenk an die Miliz'); }
  if(raid) done.push(`Angriffsziel ${BUILDINGS[raid]?BUILDINGS[raid].name.replace(/­/g,''):raid}`);
  ai.llm.done=done;
  return {ok:true, done};
}
/** Sollstärke der Armee je nach Schwerpunkt */
export const focusArmy = ai => !llmActive(ai)?1:({ruestung:1.4, verteidigung:1.15, forschung:0.8, wachstum:0.85})[ai.llm.focus]||1;
export const focusDefense = ai => llmActive(ai)&&ai.llm.focus==='verteidigung'?1.6:1;
