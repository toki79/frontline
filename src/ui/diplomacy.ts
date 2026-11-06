import { fmt } from '../core/util';
import { AIS, AI_CHAR, INTEL, REGION, RES, RESEARCH, TRADE, TRIBUTE, hasTech, isAI } from '../data/config';
import { armyEstimate, intelChance, intelLevel, knows, researchIntel } from '../sim/intel';
import { demandTribute, evalTribute, landOffer, tributeOf, waiveTribute } from '../sim/tribute';
import { rr } from '../render/draw';
import { TRADES, aiQuotes, marketOpen, marketTrend, trade, tradeAI, tradeTerms } from '../sim/market';
import { G } from '../sim/state';
import { addAtt, atWar, attOf, findBuilding, foesOf, setWar, spawnUnit, updateRel } from '../sim/world';
import { cancelContract, evalContract, hasEmbassy, proposeContract } from '../sim/trade';
import { $ } from '../ui/dom';
import { costHtml, f1 } from '../ui/format';
import { msg } from '../core/events';
import { dealText, pactList, pactWith } from '../sim/pacts';
import { openChat } from '../ui/chat';
import { llmCfg, ready } from '../ui/llm';

/* =====================================================================
   Diplomatie (Spieler)
   ===================================================================== */
export function relLabel(pid){
  if(isAI(pid)) return G.beaten&&G.beaten[pid]?['Besiegt','neutral']:atWar(0,pid)?['Krieg','feind']:['Frieden','frieden'];
  const r=G.rel[0][2]; return r==='feind'?['Krieg','feind']:r==='verbündet'?['Verbündet','verbündet']:['Neutral','neutral'];
}
export function quote(pid){
  if(isAI(pid)){
    const ai=G.ais[pid], S=AI_CHAR[pid].say, r=(ai.rat&&ai.rat[0])??1;
    if(atWar(0,pid)) return r>1.5?S.war:r>0.8?S.talk:S.lose;
    if(ai.leads&&ai.leads[0]) return S.lead;
    if(ai.need) return S.need;
    if(attOf(pid,0)>30) return S.friend;
    return S.base;
  }
  const a=G.attitude[0], al=G.militiaAlly;
  if(!findBuilding(2,'bunker')) return '„Der Bunker ist gefallen. Wir sind nur noch versprengte Kämpfer.“';
  if(G.militiaWar[0]) return '„Ihr habt auf unsere Leute geschossen. Das vergessen wir nicht.“';
  if(al===0) return '„Unsere Kämpfer stehen an Eurer Seite, Kommandant.“';
  if(al>0){ const n=G.players[al].short; return a>30?`„${n} zahlt gut … aber Eure Freundschaft hat Gewicht.“`:`„Wir stehen zu unserem Wort gegenüber ${n}.“`; }
  if(a<-20) return '„Wir trauen Aldoria nicht. Geht.“';
  if(a<20) return '„Die Miliz von Belgor bleibt neutral. Handeln können wir trotzdem.“';
  if(a<50) return '„Eure Gaben wurden bemerkt. Vielleicht können wir reden.“';
  return '„Ihr habt unser Vertrauen. Ein Bündnis wäre denkbar.“';
}
export function attBar(v){const w=Math.abs(v)/2, left=v>=0?50:50-w, col=v>=30?'#5aa86a':v>=0?'#a9a35a':'#b5503f';return `<div class="bar"><i style="left:${left}%;width:${w}%;background:${col}"></i></div>`;}
export function btn(a,l,en,bg?){return `<button data-a="${a}" ${en?'':'disabled'} ${bg?`style="background:${bg}"`:''}>${l}</button>`;}
export function renderDiplo(){
  const p=G.players[0]; let h='';
  const unknown=(name,txt)=>`<div class="party"><h3><span class="dot" style="background:#555"></span>${name}<span class="badge">unbekannt</span></h3><div class="barl"><span>${txt}</span></div></div>`;
  for(const pid of AIS){
    if(!G.known[0][pid]){ h+=unknown('Unbekannte Macht','Irgendwo im Tal soll eine weitere Stadt liegen. Erkunde es – mit Truppen, Spionage- oder Reaper-Drohnen –, um Kontakt aufzunehmen.'); continue; }
    h+=aiPartyHtml(pid); }
  // Miliz
  if(!G.known[0][2]) h+=unknown('Unbekannte Gruppe','Gerüchte sprechen von Bewaffneten auf einer Flussinsel in der Mitte des Tals.');
  else { const f=G.players[2], [lab,cls]=relLabel(2), alive=!!findBuilding(2,'bunker');
    h+=`<div class="party"><h3><span class="dot" style="background:${f.col}"></span>${f.name}<span class="badge b-${cls}">${lab}</span></h3>
      <div class="lead">${f.leader}</div><div class="quote">${quote(2)}</div>
      <div class="barl"><span>Ansehen bei der Miliz: Aldoria</span><span>${Math.round(G.attitude[0])}</span></div>${attBar(G.attitude[0])}`+
      AIS.filter(o=>G.known[0][o]).map(o=>`<div class="barl"><span>${G.players[o].short} (Geheimdienst)</span><span>${Math.round(G.attitude[o])}</span></div>${attBar(G.attitude[o])}`).join('');
    if(marketOpen(0)){
      h+=`<h4>Markt${G.attitude[0]>=30?' · Freundschaftspreis +20 %':''}</h4><div class="row">`;
      for(const k in TRADES){ const {give,get}=tradeTerms(0,k); let ok=true; for(const r in give) if(p.res[r]<give[r]) ok=false;
        h+=btn('t_'+k,`${costHtml(give)} → ${costHtml(get)}${marketTrend(k)}`,ok); }
      h+='</div><div class="barl"><span>Jeder Verkauf drückt den Preis, jeder Kauf treibt ihn hoch. Die Preise erholen sich langsam – auch die anderen Mächte handeln hier.</span>';
      h+='</div>';
    }
    h+='<h4>Beziehung</h4><div class="row">';
    if(G.militiaWar[0]) h+=btn('peace2','Frieden anbieten ($500)',alive&&p.res.money>=500);
    else {
      h+=btn('gift2','Geschenk ($300)',alive&&p.res.money>=300);
      h+=btn('merc','Söldner anheuern ($600)',alive&&p.res.money>=600&&G.t>=G.mercCooldown);
      h+=G.militiaAlly===0?btn('unally','Bündnis kündigen',true):btn('ally','Bündnis vorschlagen',alive);
      h+=btn('war2','Krieg erklären',true,'#5a221c');
    }
    h+='</div></div>'; }
  $('#diploBody').innerHTML=h;
}
// ---------- KI-Macht (Kastrova, Veloria) ----------
const B=(pid,act,l,en,bg?)=>btn(`p${pid}|${act}`,l,en,bg);
const lead=pid=>G.players[pid].leader;
function aiPartyHtml(pid){
  const p=G.players[0], A=G.players[pid], [lab,cls]=relLabel(pid), war=atWar(0,pid), att=attOf(pid,0);
  if(G.beaten&&G.beaten[pid]) return `<div class="party"><h3><span class="dot" style="background:${A.col}"></span>${A.name}<span class="badge">besiegt</span></h3><div class="barl"><span>Die Stadt liegt in Trümmern.</span></div></div>`;
  const others=AIS.filter(o=>o!==pid&&G.known[0][o]).map(o=>`${atWar(pid,o)?'⚔ Krieg':'Frieden'} mit ${G.players[o].short}`).join(' · ');
  let h=`<div class="party"><h3><span class="dot" style="background:${A.col}"></span>${A.name}<span class="badge b-${cls}">${lab}</span></h3>
      <div class="lead">${A.leader} · ${AI_CHAR[pid].label} · ${fmt(A.pop)} Einwohner${others?' · '+others:''}</div><div class="quote">${quote(pid)}</div>
      <div class="barl"><span>Haltung gegenüber Aldoria</span><span>${Math.round(att)}</span></div>${attBar(att)}
      <div class="barl" style="margin-top:6px"><span>Reich an: ${G.profile[pid].rich.map(r=>RES[r].icon+' '+RES[r].name).join(', ')} · Engpass: ${G.profile[pid].scarce.map(r=>RES[r].icon+' '+RES[r].name).join(', ')}</span></div>
      <h4>Handel mit ${A.short}</h4>`;
  if(war) h+='<div class="barl"><span>Im Krieg wird nicht gehandelt.</span></div>';
  else { const qs=aiQuotes(pid);
    if(!qs.length) h+=`<div class="barl"><span>${A.short} hat gerade weder Bedarf noch Überschuss.</span></div>`;
    else { h+='<div class="row">';
      for(const q of qs){ const ic=RES[q.res].icon;
        if(q.side==='buy') h+=B(pid,`ai_buy_${q.res}`,`Verkaufen: ${q.amt} ${ic} → $${q.price}${q.urgent?' 🔥':''}`,p.res[q.res]>=q.amt);
        else h+=B(pid,`ai_sell_${q.res}`,`Kaufen: ${q.amt} ${ic} für $${q.price}`,p.res.money>=q.price); }
      h+=`</div><div class="barl"><span>Preise richten sich nach Vorrat und Engpass von ${A.short}. 🔥 = dringend gesucht. Handel verbessert die Beziehung.</span></div>`; } }
  { const pc=pactWith(pid), sworn=pactList().find(q=>q.kind==='joint'&&q.join&&q.target===pid);
    h+=`<h4>🤝 Geheimabsprachen</h4>`;
    if(pc) h+=`<div class="barl" style="color:#9fd88a"><span>Abmachung: ${dealText(pid,pc)} – noch ${Math.max(1,Math.round((pc.until-G.t)/60))} min.</span></div>`;
    if(sworn) h+=`<div class="barl" style="color:#ffb38a"><span>Ihr habt ${G.players[sworn.f].short} zugesagt, gegen ${A.short} zu kämpfen – Frieden mit ${A.short} wäre Wortbruch.</span></div>`;
    h+=`<div class="row">${B(pid,'chat',`💬 Verhandeln mit ${lead(pid)}${ready(llmCfg.ais[pid])?' (frei)':''}`,true,'#2a3a52')}</div>`;
    if(!pc&&!war) h+=`<div class="barl"><span>Bündnis gegen die dritte Macht, Nichtangriffspakt oder Lagebericht aushandeln.</span></div>`; }
  h+=intelHtml(pid);
  h+=contractHtml(pid);
  h+=tributeHtml(pid);
  h+='<h4>Beziehung</h4><div class="row">';
  const brk=pactList().some(q=>q.kind==='joint'&&q.join&&q.target===pid)?' (Wortbruch!)':'';
  if(war){ h+=B(pid,'peace','Frieden anbieten'+brk,true)+B(pid,'peacet','Frieden + $400'+brk,p.res.money>=400); }
  else { h+=B(pid,'gift','Geschenk ($200)',p.res.money>=200)+B(pid,'food','Nahrung schenken (🌾100)',p.res.food>=100)+B(pid,'war',pactWith(pid)?'Krieg erklären (bricht die Abmachung!)':'Krieg erklären',true,'#5a221c'); }
  return h+'</div></div>';
}
// ---------- Geheimdienst: Lagebericht ----------
function intelHtml(pid){
  const n=G.players[pid].short, l=intelLevel(0), ch=Math.round(intelChance(0,pid)*100), K=knows(0,pid);
  let h=`<h4>🕵 Lagebericht</h4><div class="barl"><span>${l?`Nachrichtendienst Stufe ${l}`:'Kein Nachrichtendienst – nur Gerüchte'} · Quellenlage ${ch} %${G.embassy[0][pid]?' (mit Botschaft)':''}${hasTech(G.players[pid],'counterintel')&&l?' · Spionageabwehr erschwert die Arbeit':''}</span></div>`;
  if(!l) h+=`<div class="barl"><span>Ein <b>Nachrichtendienst</b> (Gebäude → Militär & Geheimdienst) meldet, was ${n} erforscht, baut und plant – mit Empfehlung für eure Verteidigung. Stufe II schätzt die Truppen, Stufe III sieht die laufende Forschung.</span></div>`;
  const tech=Object.keys(K.tech).filter(k=>RESEARCH[k]).map(k=>`${RESEARCH[k].icon} ${RESEARCH[k].name}`), units=Object.entries(K.units).map(([k,c])=>`${c}× ${INTEL.units[k]||k}`);
  if(tech.length) h+=`<div class="barl"><span>Bekannte Technik: ${tech.join(', ')}</span></div>`;
  if(units.length) h+=`<div class="barl"><span>Gesichtet: ${units.join(', ')}</span></div>`;
  const rs=researchIntel(0,pid); if(rs&&RESEARCH[rs]) h+=`<div class="barl"><span>Forscht gerade: ${RESEARCH[rs].icon} ${RESEARCH[rs].name}${INTEL.threats[rs]?' ⚠':''}</span></div>`;
  const est=armyEstimate(0,pid); if(est) h+=`<div class="barl"><span>Truppen (geschätzt): 🪖 ${est.inf} Infanterie · 🚙 ${est.veh} Fahrzeuge · 🛡 ${est.heavy} Panzer · ✈ ${est.air} Luft · 🚀 ${est.missile} Raketen/Artillerie</span></div>`;
  if(K.plan&&G.t-K.plan.t<300) h+=`<div class="barl" style="color:#ffb38a"><span>⚠ Angriffspläne gemeldet${K.plan.target?` – Ziel vermutlich euer ${K.plan.target}`:''}</span></div>`;
  const L=((G.intel&&G.intel.log)||[]).filter(r=>r.tgt===pid).slice(0,3);
  for(const r of L) h+=`<div class="intelRep"><span class="dim">vor ${Math.max(1,Math.round((G.t-r.t)/60))} min</span> ${r.txt.replace(/^🕵 Geheimdienst: /,'')}${r.counter?`<br>➜ ${r.counter}`:''}</div>`;
  return h;
}
// ---------- Tribut fordern ----------
const tgs={}; export const tgOf=pid=>tgs[pid]||(tgs[pid]={kind:'money', lvl:1, rec:false});
const tribAmt=tg=>tg.kind==='land'?0:(tg.kind==='money'?TRIBUTE.money:TRIBUTE.res)[tg.lvl];
const unit=k=>k==='money'?'$':RES[k].icon;
function tributeHtml(pid){
  const tg=tgOf(pid), n=G.players[pid].short, tr=tributeOf(pid); let h='<h4>👑 Tribut fordern</h4>';
  if(tr) h+=`<div class="barl"><span>${n} zahlt jede Minute ${tr.amt} ${unit(tr.res)} (bisher ${fmt(tr.paid)})</span>${B(pid,'tw','Verzichten',true,'#4a2a22')}</div>`;
  const sel=(k,v,cur,lab)=>B(pid,`tg_${k}_${v}`,lab,true,String(cur)===String(v)?'#4a6a2a':undefined);
  h+='<div class="row">'+[['money','💰 Geld'],...['food','wood','stone','metal','oil'].map(r=>[r,RES[r].icon]),['land','🏳 Land']].map(([k,l])=>sel('kind',k,tg.kind,l)).join('')+'</div>';
  if(tg.kind==='land'){ const L=landOffer(pid); h+=`<div class="barl"><span>${L.length?`${n} soll abtreten: ${L.map(b=>b.def.name.replace(/­/g,'')).join(', ')} (Gebäude nahe eurer Grenze, samt Bewohnern)`:`${n} hat kein Gebiet, das es abtreten könnte.`}</span></div>`; }
  else { const A=(tg.kind==='money'?TRIBUTE.money:TRIBUTE.res);
    h+='<div class="row">'+A.map((a,i)=>sel('lvl',i,tg.lvl,`${a} ${unit(tg.kind)}`)).join('')+sel('rec','0',tg.rec?'1':'0','einmalig')+sel('rec','1',tg.rec?'1':'0','jede Minute')+'</div>'; }
  const e=evalTribute(pid,tg.kind,tribAmt(tg),tg.kind!=='land'&&tg.rec), wait=Math.ceil(((G.tribCool||{})[pid]||0)-G.t), last=(G.tribLast||{})[pid];
  h+=`<div class="barl"><span>${e.ok?`✓ ${n} würde wohl nachgeben`:`✗ ${n} würde ablehnen: `+e.reasons.join(', ')} · Furcht ${f1(e.fear)} / Schmerz ${f1(Math.min(e.pain,9))}</span></div>`;
  if(last) h+=`<div class="tribres ${last.ok?'ok':'no'}">${last.txt}</div>`;
  h+=`<div class="row">${B(pid,'tg_go',wait>0?`Nächste Forderung in ${wait} s Spielzeit`:tr&&tg.rec&&tg.kind!=='land'?'Dauertribut läuft schon':'👑 Tribut fordern',wait<=0&&!(tr&&tg.rec&&tg.kind!=='land'))}</div>`;
  h+=`<div class="barl"><span>Furcht entsteht durch eure militärische Übermacht, eine Atomrakete, einen für ${n} verlorenen Krieg, einen Krieg an anderer Front oder ein Bündnis mit der Miliz. Wer nachgibt, ist gekränkt (Haltung sinkt) und sinnt eine Weile auf Rache. Eine abgelehnte Forderung verärgert – ohne Macht dahinter kann sie Krieg auslösen. Im Krieg ist ein angenommener Tribut zugleich der Friedensschluss.</span></div>`;
  return h;
}
// ---------- Handelsverträge ----------
const cgs={}; export const cgOf=pid=>cgs[pid]||(cgs[pid]={give:'food',ga:100,get:'metal',ra:50});
function contractHtml(pid){
  const p=G.players[0], cg=cgOf(pid), n=G.players[pid].short; let h='<h4>📜 Handelsverträge</h4>';
  const mine=G.contracts.filter(c=>c.a===0&&c.b===pid);
  for(const c of mine) h+=`<div class="barl"><span>Jede Minute: ${c.give.amt} ${RES[c.give.res].icon} → gegen ${c.get.amt} ${RES[c.get.res].icon} · ${c.done} Lieferungen${c.miss[0]||c.miss[1]?` · Ausfälle ${c.miss[0]}/${c.miss[1]}`:''}</span>${B(pid,'cx_'+c.id,'Kündigen',true,'#4a2a22')}</div>`;
  if(!hasEmbassy(0,pid)) return h+`<div class="barl"><span>Für Verträge braucht ihr eine <b>Botschaft</b>: Diplomat im Handelskontor ausbilden, auswählen und das Rathaus von ${n} antippen.</span></div>`;
  if(atWar(0,pid)) return h+'<div class="barl"><span>Im Krieg keine Verträge.</span></div>';
  if(!findBuilding(0,'kontor')) return h+'<div class="barl"><span>Ohne eigenes Handelskontor fahren keine Karawanen.</span></div>';
  const rs=['food','wood','stone','metal','oil'], sel=(k,v,cur,lab)=>B(pid,`cg_${k}_${v}`,lab,true,cur===v?'#4a6a2a':undefined);
  h+='<div class="barl"><span>Neuer Vertrag – wir liefern jede Minute:</span></div><div class="row">'+rs.map(r=>sel('give',r,cg.give,RES[r].icon)).join('')+TRADE.amounts.map(a=>sel('ga',a,cg.ga,String(a))).join('')+'</div>';
  h+='<div class="barl"><span>… und bekommen dafür:</span></div><div class="row">'+rs.map(r=>sel('get',r,cg.get,RES[r].icon)).join('')+TRADE.amounts.map(a=>sel('ra',a,cg.ra,String(a))).join('')+'</div>';
  const e=evalContract(pid,{res:cg.give,amt:cg.ga},{res:cg.get,amt:cg.ra});
  h+=`<div class="barl"><span>${e.ok?`✓ ${n} würde wohl zustimmen`:`✗ ${n} lehnt ab: `+e.reasons.join(', ')} (Bewertung ${Math.round(e.ratio*100)} %)</span></div><div class="row">${B(pid,'cg_propose','📜 Vertrag vorschlagen',p.res[cg.give]>=cg.ga)}</div>`;
  h+='<div class="barl"><span>Karawanen fahren zwischen den Handelshäusern und können von Räubern oder im Krieg überfallen werden – Begleitschutz (🛡) hilft. Wer zweimal nicht liefert, verliert den Vertrag.</span></div>';
  return h;
}
export function peaceChance(pid,tribute){
  const ai=G.ais[pid], r=(ai.rat&&ai.rat[0])??1; let s=(ai.need?-1:0)+(ai.leads&&ai.leads[0]?-1.2:0)+(r<1?1:0)+(r<0.6?0.8:0)+(ai.lootSince>150?0.6:0)+attOf(pid,0)/50+(tribute?1:0)+(G.t-ai.lastCombat>60?0.4:0)+AI_CHAR[pid].peace+(foesOf(pid).length>1?0.8:0);
  return s>=0.5;
}
/** Antwort unten im Fenster anzeigen (klebt sichtbar am unteren Rand) und kurz aufblinken lassen */
function say(t){ const el=$('#reply'); el.textContent=t||''; el.classList.remove('flash'); void el.offsetWidth; if(t) el.classList.add('flash'); }
/** Aktion gegenüber einer KI-Macht */
function aiAction(pid,a){
  const p=G.players[0], A=G.players[pid], L=lead(pid), ai=G.ais[pid]; let r='';
  if(a.startsWith('ai_')){ const [,side,res]=a.split('_'); const rr=tradeAI(pid,side==='buy'?'buy':'sell',res);
    return {ok:side==='buy'?`${L}: „Genau das brauchten wir. Ein gutes Geschäft für beide.“`:`${L}: „Abgemacht. Die Lieferung ist unterwegs.“`,krieg:'Kein Handel im Krieg.',kein:'Das Angebot gilt nicht mehr.',arm:'Dafür reichen eure Vorräte nicht.',pleite:`${L}: „Unsere Kasse ist leer.“`}[rr]; }
  if(a.startsWith('cg_')){ const [,k,v]=a.split('_'), cg=cgOf(pid);
    if(k==='propose'){ const res=proposeContract(0,pid,{res:cg.give,amt:cg.ga},{res:cg.get,amt:cg.ra}) as any;
      return res.ok?`${L}: „Abgemacht. Jede Minute ${cg.ga} ${RES[cg.give].icon} gegen ${cg.ra} ${RES[cg.get].icon}.“`:`${L}: „Nein.“ (${res.reasons.join(', ')})`; }
    if(k==='give'||k==='get') cg[k]=v; else cg[k]=Number(v); return ''; }
  if(a==='tw'){ waiveTribute(pid); return `${L}: „${A.short} nimmt Euren Verzicht zur Kenntnis.“`; }
  if(a.startsWith('tg_')){ const [,k,v]=a.split('_'), tg=tgOf(pid);
    if(k==='go'){ const wasWar=atWar(0,pid), res=demandTribute(pid,tg.kind,tribAmt(tg),tg.kind!=='land'&&tg.rec);
      return {ok:wasWar?`${L}: „… ${A.short} beugt sich. Die Waffen ruhen.“`:`${L}: „… ${A.short} beugt sich. Diesmal.“`,nein:`${L}: „Nein. ${A.short} zahlt keinen Tribut an Aldoria.“`,krieg:`${L}: „Ihr wagt es, uns zu drohen? Dann sprechen die Waffen!“`,wartet:'Wartet ab, bevor Ihr erneut fordert.'}[res]; }
    if(k==='kind') tg.kind=v; else if(k==='lvl') tg.lvl=Number(v); else if(k==='rec') tg.rec=v==='1'; return ''; }
  if(a.startsWith('cx_')){ const c=G.contracts.find(c=>c.id===Number(a.slice(3))); if(c) cancelContract(c,0); return 'Vertrag gekündigt.'; }
  switch(a){
    case 'chat': openChat(pid); return '';
    case 'gift': p.res.money-=200; addAtt(pid,0,12*AI_CHAR[pid].gifts); return `${L}: „${A.short} nimmt Eure Aufmerksamkeit zur Kenntnis.“`;
    case 'food': p.res.food-=100; A.res.food+=100; addAtt(pid,0,ai.need==='food'?20:8); return ai.need==='food'?`${L}: „Das kommt zur rechten Zeit. Wir vergessen das nicht.“`:`${L}: „Danke. Unsere Speicher sind allerdings gut gefüllt.“`;
    case 'war': setWar(0,pid,true,0); addAtt(pid,0,-60); return `${L}: „Dann wird ${A.short} antworten.“`;
    case 'peace': case 'peacet': {
      const trib=a==='peacet';
      if(peaceChance(pid,trib)){ if(trib){p.res.money-=400;A.res.money+=400;} setWar(0,pid,false,0); ai.att[0]=Math.max(attOf(pid,0),-10); return `${L}: „Einverstanden. Die Waffen ruhen.“`; }
      return ai.leads&&ai.leads[0]?`${L}: „Solange Aldoria uns über den Kopf wächst, gibt es keinen Frieden.“`:`${L}: „Abgelehnt. Wir sind noch nicht fertig mit Euch.“`; }
  }
  return r;
}
export function diploAction(a){
  const p=G.players[0]; let r='';
  if(/^p\d+\|/.test(a)){ const i=a.indexOf('|'); r=aiAction(Number(a.slice(1,i)),a.slice(i+1)); say(r); renderDiplo(); return; }
  if(a.startsWith('t_')){ const k=a.slice(2); r=trade(0,k)?'Händler der Miliz: „Gutes Geschäft.“':'Händler der Miliz: „Dafür reicht es nicht.“'; say(r); renderDiplo(); return; }
  switch(a){
    case 'gift2': p.res.money-=300; G.attitude[0]=Math.min(100,G.attitude[0]+15);
      r=G.attitude[0]>=50?'Hauptmann Dorin: „Großzügig. Sprecht mit uns über ein Bündnis.“':'Hauptmann Dorin: „Wir nehmen Euer Geschenk an.“'; break;
    case 'merc':
      if(G.attitude[0]<20){r='Hauptmann Dorin: „Unsere Männer kämpfen nicht für Fremde.“ (Ansehen ab 20 nötig)';break;}
      { const b=findBuilding(2,'bunker'); p.res.money-=600; G.mercCooldown=G.t+60; for(let i=0;i<3;i++) spawnUnit(0,'militia',b);
        r='Hauptmann Dorin: „Drei Trupps warten auf der Insel auf Eure Befehle.“ (kosten keine Einwohner)'; } break;
    case 'ally':
      if(G.attitude[0]>=50&&(G.militiaAlly===-1||G.attitude[0]>=G.attitude[G.militiaAlly]+25)){
        const sw=G.militiaAlly>0?G.players[G.militiaAlly].short:''; G.militiaAlly=0; updateRel();
        r=sw?`Hauptmann Dorin: „Das Gold von ${sw} war nicht genug. Wir wechseln die Seite!“`:'Hauptmann Dorin: „Abgemacht. Im Krieg kämpft die Miliz mit Aldoria.“';
        msg('Bündnis mit der Grenzmiliz geschlossen!','#9fd88a');
      } else if(G.militiaAlly>0){ const n=G.players[G.militiaAlly].short; r=`Hauptmann Dorin: „Wir sind an ${n} gebunden. Ihr müsstet deutlich mehr bieten.“ (Ansehen 25 über ${n} nötig)`; }
      else r='Hauptmann Dorin: „Dafür kennen wir Euch noch nicht gut genug.“ (Ansehen ab 50 nötig)';
      break;
    case 'unally': G.militiaAlly=-1; G.attitude[0]=Math.max(-100,G.attitude[0]-30); updateRel(); r='Hauptmann Dorin: „So endet es also. Lebt wohl.“'; break;
    case 'war2': G.militiaWar[0]=true; G.attitude[0]=-100; if(G.militiaAlly===0) G.militiaAlly=-1; updateRel(); r='Hauptmann Dorin: „Dann sehen wir uns auf dem Schlachtfeld.“'; msg('Krieg gegen die Grenzmiliz erklärt.','#ff8a7a'); break;
    case 'peace2': p.res.money-=500; G.militiaWar[0]=false; G.attitude[0]=-30; updateRel(); r='Hauptmann Dorin: „Wir nehmen an. Aber wir beobachten Euch.“'; break;
  }
  say(r); renderDiplo();
}
