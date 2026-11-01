import { fmt } from '../core/util';
import { REGION, RES, TRADE, TRIBUTE } from '../data/config';
import { demandTribute, evalTribute, landOffer, waiveTribute } from '../sim/tribute';
import { rr } from '../render/draw';
import { TRADES, aiQuotes, marketOpen, marketTrend, trade, tradeAI, tradeTerms } from '../sim/market';
import { G } from '../sim/state';
import { findBuilding, setWar, spawnUnit, updateRel } from '../sim/world';
import { cancelContract, evalContract, hasEmbassy, proposeContract } from '../sim/trade';
import { $ } from '../ui/dom';
import { costHtml, f1 } from '../ui/format';
import { msg } from '../core/events';

/* =====================================================================
   Diplomatie (Spieler)
   ===================================================================== */
export function relLabel(pid){
  if(pid===1) return G.war?['Krieg','feind']:['Frieden','frieden'];
  const r=G.rel[0][2]; return r==='feind'?['Krieg','feind']:r==='verbündet'?['Verbündet','verbündet']:['Neutral','neutral'];
}
export function quote(pid){
  if(pid===1){
    const ai=G.ai;
    if(G.war) return ai.ratio>1.5?'„Ihr habt es so gewollt. Kastrova holt sich, was es braucht.“':ai.ratio>0.8?'„Der Krieg kostet beide Seiten. Wir könnten reden – zu unseren Bedingungen.“':'„… Vielleicht war dieser Krieg ein Fehler.“';
    if(ai.lead) return '„Aldoria wächst zu schnell. Das beobachten wir mit großer Sorge.“';
    if(ai.need) return '„Unsere Vorräte sind knapp. Ein guter Nachbar würde helfen.“';
    if(G.aiAtt>30) return '„Aldoria ist ein verlässlicher Nachbar. So soll es bleiben.“';
    return '„Kastrova wünscht Frieden – solange er uns nützt.“';
  }
  const a=G.attitude[0];
  if(!findBuilding(2,'bunker')) return '„Der Bunker ist gefallen. Wir sind nur noch versprengte Kämpfer.“';
  if(G.militiaWar[0]) return '„Ihr habt auf unsere Leute geschossen. Das vergessen wir nicht.“';
  if(G.militiaAlly===0) return '„Unsere Kämpfer stehen an Eurer Seite, Kommandant.“';
  if(G.militiaAlly===1) return a>30?'„Kastrova zahlt gut … aber Eure Freundschaft hat Gewicht.“':'„Wir stehen zu unserem Wort gegenüber Kastrova.“';
  if(a<-20) return '„Wir trauen Aldoria nicht. Geht.“';
  if(a<20) return '„Die Miliz von Belgor bleibt neutral. Handeln können wir trotzdem.“';
  if(a<50) return '„Eure Gaben wurden bemerkt. Vielleicht können wir reden.“';
  return '„Ihr habt unser Vertrauen. Ein Bündnis wäre denkbar.“';
}
export function attBar(v){const w=Math.abs(v)/2, left=v>=0?50:50-w, col=v>=30?'#5aa86a':v>=0?'#a9a35a':'#b5503f';return `<div class="bar"><i style="left:${left}%;width:${w}%;background:${col}"></i></div>`;}
export function btn(a,l,en,bg?){return `<button data-a="${a}" ${en?'':'disabled'} ${bg?`style="background:${bg}"`:''}>${l}</button>`;}
export function renderDiplo(){
  const p=G.players[0], A=G.players[1]; let h='';
  const unknown=(name,txt)=>`<div class="party"><h3><span class="dot" style="background:#555"></span>${name}<span class="badge">unbekannt</span></h3><div class="barl"><span>${txt}</span></div></div>`;
  // Kastrova
  if(!G.known[0][1]) h+=unknown('Unbekannte Macht','Irgendwo jenseits des Flusses soll eine zweite Stadt liegen. Erkunde das Tal – mit Truppen, Spionage- oder Reaper-Drohnen –, um Kontakt aufzunehmen.');
  else { const [lab,cls]=relLabel(1);
    h+=`<div class="party"><h3><span class="dot" style="background:${A.col}"></span>${A.name}<span class="badge b-${cls}">${lab}</span></h3>
      <div class="lead">${A.leader} · ${fmt(A.pop)} Einwohner</div><div class="quote">${quote(1)}</div>
      <div class="barl"><span>Haltung gegenüber Aldoria</span><span>${Math.round(G.aiAtt)}</span></div>${attBar(G.aiAtt)}
      <div class="barl" style="margin-top:6px"><span>Reich an: ${G.profile[1].rich.map(r=>RES[r].icon+' '+RES[r].name).join(', ')} · Engpass: ${G.profile[1].scarce.map(r=>RES[r].icon+' '+RES[r].name).join(', ')}</span></div>
      <h4>Handel mit Kastrova</h4>`;
    if(G.war) h+='<div class="barl"><span>Im Krieg wird nicht gehandelt.</span></div>';
    else { const qs=aiQuotes();
      if(!qs.length) h+='<div class="barl"><span>Kastrova hat gerade weder Bedarf noch Überschuss.</span></div>';
      else { h+='<div class="row">';
        for(const q of qs){ const ic=RES[q.res].icon;
          if(q.side==='buy') h+=btn(`ai_buy_${q.res}`,`Verkaufen: ${q.amt} ${ic} → $${q.price}${q.urgent?' 🔥':''}`,p.res[q.res]>=q.amt);
          else h+=btn(`ai_sell_${q.res}`,`Kaufen: ${q.amt} ${ic} für $${q.price}`,p.res.money>=q.price); }
        h+='</div><div class="barl"><span>Preise richten sich nach Kastrovas Vorrat und Engpass. 🔥 = dringend gesucht. Handel verbessert die Beziehung.</span></div>'; } }
    h+=contractHtml();
    h+=tributeHtml();
    h+='<h4>Beziehung</h4><div class="row">';
    if(G.war){ h+=btn('peace1','Frieden anbieten',true)+btn('peace1t','Frieden + $400',p.res.money>=400); }
    else { h+=btn('gift1','Geschenk ($200)',p.res.money>=200)+btn('food1','Nahrung schenken (🌾100)',p.res.food>=100)+btn('war1','Krieg erklären',true,'#5a221c'); }
    h+='</div></div>'; }
  // Miliz
  if(!G.known[0][2]) h+=unknown('Unbekannte Gruppe','Gerüchte sprechen von Bewaffneten auf einer Flussinsel in der Mitte des Tals.');
  else { const f=G.players[2], [lab,cls]=relLabel(2), alive=!!findBuilding(2,'bunker');
    h+=`<div class="party"><h3><span class="dot" style="background:${f.col}"></span>${f.name}<span class="badge b-${cls}">${lab}</span></h3>
      <div class="lead">${f.leader}</div><div class="quote">${quote(2)}</div>
      <div class="barl"><span>Ansehen bei der Miliz: Aldoria</span><span>${Math.round(G.attitude[0])}</span></div>${attBar(G.attitude[0])}
      <div class="barl"><span>Kastrova (Geheimdienst)</span><span>${Math.round(G.attitude[1])}</span></div>${attBar(G.attitude[1])}`;
    if(marketOpen(0)){
      h+=`<h4>Markt${G.attitude[0]>=30?' · Freundschaftspreis +20 %':''}</h4><div class="row">`;
      for(const k in TRADES){ const {give,get}=tradeTerms(0,k); let ok=true; for(const r in give) if(p.res[r]<give[r]) ok=false;
        h+=btn('t_'+k,`${costHtml(give)} → ${costHtml(get)}${marketTrend(k)}`,ok); }
      h+='</div><div class="barl"><span>Jeder Verkauf drückt den Preis, jeder Kauf treibt ihn hoch. Die Preise erholen sich langsam – auch Kastrova handelt hier.</span>';
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
// ---------- Tribut fordern ----------
export const tg={kind:'money', lvl:1, rec:false};
const tribAmt=()=>tg.kind==='land'?0:(tg.kind==='money'?TRIBUTE.money:TRIBUTE.res)[tg.lvl];
const unit=k=>k==='money'?'$':RES[k].icon;
function tributeHtml(){
  let h='<h4>👑 Tribut fordern</h4>';
  if(G.tribute) h+=`<div class="barl"><span>Kastrova zahlt jede Minute ${G.tribute.amt} ${unit(G.tribute.res)} (bisher ${fmt(G.tribute.paid)})</span>${btn('tw','Verzichten',true,'#4a2a22')}</div>`;
  const sel=(k,v,cur,lab)=>btn(`tg_${k}_${v}`,lab,true,String(cur)===String(v)?'#4a6a2a':undefined);
  h+='<div class="row">'+[['money','💰 Geld'],...['food','wood','stone','metal','oil'].map(r=>[r,RES[r].icon]),['land','🏳 Land']].map(([k,l])=>sel('kind',k,tg.kind,l)).join('')+'</div>';
  if(tg.kind==='land'){ const L=landOffer(); h+=`<div class="barl"><span>${L.length?`Kastrova soll abtreten: ${L.map(b=>b.def.name.replace(/\u00AD/g,'')).join(', ')} (Gebäude nahe eurer Grenze, samt Bewohnern)`:'Kastrova hat kein Gebiet, das es abtreten könnte.'}</span></div>`; }
  else { const A=(tg.kind==='money'?TRIBUTE.money:TRIBUTE.res);
    h+='<div class="row">'+A.map((a,i)=>sel('lvl',i,tg.lvl,`${a} ${unit(tg.kind)}`)).join('')+sel('rec','0',tg.rec?'1':'0','einmalig')+sel('rec','1',tg.rec?'1':'0','jede Minute')+'</div>'; }
  const e=evalTribute(tg.kind,tribAmt(),tg.kind!=='land'&&tg.rec), wait=Math.ceil((G.tribCool||0)-G.t);
  h+=`<div class="barl"><span>${e.ok?'✓ Kastrova würde wohl nachgeben':'✗ Kastrova würde ablehnen: '+e.reasons.join(', ')} · Furcht ${f1(e.fear)} / Schmerz ${f1(Math.min(e.pain,9))}</span></div>`;
  if(G.tribLast) h+=`<div class="tribres ${G.tribLast.ok?'ok':'no'}">${G.tribLast.txt}</div>`;
  h+=`<div class="row">${btn('tg_go',wait>0?`Nächste Forderung in ${wait} s Spielzeit`:G.tribute&&tg.rec&&tg.kind!=='land'?'Dauertribut läuft schon':'👑 Tribut fordern',wait<=0&&!(G.tribute&&tg.rec&&tg.kind!=='land'))}</div>`;
  h+='<div class="barl"><span>Furcht entsteht durch eure militärische Übermacht, eine Atomrakete, einen für Kastrova verlorenen Krieg oder ein Bündnis mit der Miliz. Wer nachgibt, ist gekränkt (Haltung sinkt) und sinnt eine Weile auf Rache. Eine abgelehnte Forderung verärgert – ohne Macht dahinter kann sie Krieg auslösen. Im Krieg ist ein angenommener Tribut zugleich der Friedensschluss.</span></div>';
  return h;
}
// ---------- Handelsverträge ----------
export const cg={give:'food',ga:100,get:'metal',ra:50};
function contractHtml(){
  const p=G.players[0]; let h='<h4>📜 Handelsverträge</h4>';
  const mine=G.contracts.filter(c=>c.a===0&&c.b===1);
  for(const c of mine) h+=`<div class="barl"><span>Jede Minute: ${c.give.amt} ${RES[c.give.res].icon} → gegen ${c.get.amt} ${RES[c.get.res].icon} · ${c.done} Lieferungen${c.miss[0]||c.miss[1]?` · Ausfälle ${c.miss[0]}/${c.miss[1]}`:''}</span>${btn('cx_'+c.id,'Kündigen',true,'#4a2a22')}</div>`;
  if(!hasEmbassy(0,1)) return h+'<div class="barl"><span>Für Verträge braucht ihr eine <b>Botschaft</b>: Diplomat im Handelskontor ausbilden, auswählen und das Rathaus Kastrovas antippen.</span></div>';
  if(G.war) return h+'<div class="barl"><span>Im Krieg keine Verträge.</span></div>';
  if(!findBuilding(0,'kontor')) return h+'<div class="barl"><span>Ohne eigenes Handelskontor fahren keine Karawanen.</span></div>';
  const rs=['food','wood','stone','metal','oil'], sel=(k,v,cur,lab)=>btn(`cg_${k}_${v}`,lab,true,cur===v?'#4a6a2a':undefined);
  h+='<div class="barl"><span>Neuer Vertrag – wir liefern jede Minute:</span></div><div class="row">'+rs.map(r=>sel('give',r,cg.give,RES[r].icon)).join('')+TRADE.amounts.map(a=>sel('ga',a,cg.ga,String(a))).join('')+'</div>';
  h+='<div class="barl"><span>… und bekommen dafür:</span></div><div class="row">'+rs.map(r=>sel('get',r,cg.get,RES[r].icon)).join('')+TRADE.amounts.map(a=>sel('ra',a,cg.ra,String(a))).join('')+'</div>';
  const e=evalContract(1,{res:cg.give,amt:cg.ga},{res:cg.get,amt:cg.ra});
  h+=`<div class="barl"><span>${e.ok?'✓ Kastrova würde wohl zustimmen':'✗ Kastrova lehnt ab: '+e.reasons.join(', ')} (Bewertung ${Math.round(e.ratio*100)} %)</span></div><div class="row">${btn('cg_propose','📜 Vertrag vorschlagen',p.res[cg.give]>=cg.ga)}</div>`;
  h+='<div class="barl"><span>Karawanen fahren zwischen den Handelshäusern und können von Räubern oder im Krieg überfallen werden – Begleitschutz (🛡) hilft. Wer zweimal nicht liefert, verliert den Vertrag.</span></div>';
  return h;
}
export function peaceChance(tribute){
  const ai=G.ai; let s=(ai.need?-1:0)+(ai.lead?-1.2:0)+(ai.ratio<1?1:0)+(ai.ratio<0.6?0.8:0)+(ai.lootSince>150?0.6:0)+G.aiAtt/50+(tribute?1:0)+(G.t-ai.lastCombat>60?0.4:0);
  return s>=0.5;
}
/** Antwort unten im Fenster anzeigen (klebt sichtbar am unteren Rand) und kurz aufblinken lassen */
function say(t){ const el=$('#reply'); el.textContent=t||''; el.classList.remove('flash'); void el.offsetWidth; if(t) el.classList.add('flash'); }
export function diploAction(a){
  const p=G.players[0]; let r='';
  if(a.startsWith('ai_')){ const [,side,res]=a.split('_'); const rr=tradeAI(side==='buy'?'buy':'sell',res);
    r={ok:side==='buy'?'Marschall Varek: „Genau das brauchten wir. Ein gutes Geschäft für beide.“':'Marschall Varek: „Abgemacht. Die Lieferung ist unterwegs.“',krieg:'Kein Handel im Krieg.',kein:'Das Angebot gilt nicht mehr.',arm:'Dafür reichen eure Vorräte nicht.',pleite:'Marschall Varek: „Unsere Kasse ist leer.“'}[rr];
    say(r); renderDiplo(); return; }
  if(a.startsWith('cg_')){ const [,k,v]=a.split('_');
    if(k==='propose'){ const res=proposeContract(0,1,{res:cg.give,amt:cg.ga},{res:cg.get,amt:cg.ra}) as any;
      r=res.ok?`Marschall Varek: „Abgemacht. Jede Minute ${cg.ga} ${RES[cg.give].icon} gegen ${cg.ra} ${RES[cg.get].icon}.“`:`Marschall Varek: „Nein.“ (${res.reasons.join(', ')})`; }
    else { if(k==='give'||k==='get') cg[k]=v; else cg[k]=Number(v); }
    say(r); renderDiplo(); return; }
  if(a==='tw'){ waiveTribute(); say('Marschall Varek: „Kastrova nimmt Euren Verzicht zur Kenntnis.“'); renderDiplo(); return; }
  if(a.startsWith('tg_')){ const [,k,v]=a.split('_');
    if(k==='go'){ const wasWar=G.war, res=demandTribute(tg.kind,tribAmt(),tg.kind!=='land'&&tg.rec);
      r={ok:wasWar?'Marschall Varek: „… Kastrova beugt sich. Die Waffen ruhen.“':'Marschall Varek: „… Kastrova beugt sich. Diesmal.“',nein:'Marschall Varek: „Nein. Kastrova zahlt keinen Tribut an Aldoria.“',krieg:'Marschall Varek: „Ihr wagt es, uns zu drohen? Dann sprechen die Waffen!“',wartet:'Wartet ab, bevor Ihr erneut fordert.'}[res]; }
    else if(k==='kind') tg.kind=v; else if(k==='lvl') tg.lvl=Number(v); else if(k==='rec') tg.rec=v==='1';
    say(r); renderDiplo(); return; }
  if(a.startsWith('cx_')){ const c=G.contracts.find(c=>c.id===Number(a.slice(3))); if(c) cancelContract(c,0); say('Vertrag gekündigt.'); renderDiplo(); return; }
  if(a.startsWith('t_')){ const k=a.slice(2); r=trade(0,k)?'Händler der Miliz: „Gutes Geschäft.“':'Händler der Miliz: „Dafür reicht es nicht.“'; say(r); renderDiplo(); return; }
  switch(a){
    case 'gift1': p.res.money-=200; G.aiAtt=Math.min(100,G.aiAtt+12); r='Marschall Varek: „Kastrova nimmt Eure Aufmerksamkeit zur Kenntnis.“'; break;
    case 'food1': p.res.food-=100; G.players[1].res.food+=100; G.aiAtt=Math.min(100,G.aiAtt+(G.ai.need==='food'?20:8)); r=G.ai.need==='food'?'Marschall Varek: „Das kommt zur rechten Zeit. Wir vergessen das nicht.“':'Marschall Varek: „Danke. Unsere Speicher sind allerdings gut gefüllt.“'; break;
    case 'war1': setWar(true,0); G.aiAtt=-60; r='Marschall Varek: „Dann wird Kastrova antworten.“'; break;
    case 'peace1': case 'peace1t': {
      const trib=a==='peace1t';
      if(peaceChance(trib)){ if(trib){p.res.money-=400;G.players[1].res.money+=400;} setWar(false); G.aiAtt=Math.max(G.aiAtt,-10); r='Marschall Varek: „Einverstanden. Die Waffen ruhen.“'; }
      else r=G.ai.lead?'Marschall Varek: „Solange Aldoria uns über den Kopf wächst, gibt es keinen Frieden.“':'Marschall Varek: „Abgelehnt. Wir sind noch nicht fertig mit Euch.“';
      break; }
    case 'gift2': p.res.money-=300; G.attitude[0]=Math.min(100,G.attitude[0]+15);
      r=G.attitude[0]>=50?'Hauptmann Dorin: „Großzügig. Sprecht mit uns über ein Bündnis.“':'Hauptmann Dorin: „Wir nehmen Euer Geschenk an.“'; break;
    case 'merc':
      if(G.attitude[0]<20){r='Hauptmann Dorin: „Unsere Männer kämpfen nicht für Fremde.“ (Ansehen ab 20 nötig)';break;}
      { const b=findBuilding(2,'bunker'); p.res.money-=600; G.mercCooldown=G.t+60; for(let i=0;i<3;i++) spawnUnit(0,'militia',b);
        r='Hauptmann Dorin: „Drei Trupps warten auf der Insel auf Eure Befehle.“ (kosten keine Einwohner)'; } break;
    case 'ally':
      if(G.attitude[0]>=50&&(G.militiaAlly===-1||G.attitude[0]>=G.attitude[1]+25)){
        const sw=G.militiaAlly===1; G.militiaAlly=0; updateRel();
        r=sw?'Hauptmann Dorin: „Kastrovas Gold war nicht genug. Wir wechseln die Seite!“':'Hauptmann Dorin: „Abgemacht. Im Krieg kämpft die Miliz mit Aldoria.“';
        msg('Bündnis mit der Grenzmiliz geschlossen!','#9fd88a');
      } else if(G.militiaAlly===1) r='Hauptmann Dorin: „Wir sind an Kastrova gebunden. Ihr müsstet deutlich mehr bieten.“ (Ansehen 25 über Kastrova nötig)';
      else r='Hauptmann Dorin: „Dafür kennen wir Euch noch nicht gut genug.“ (Ansehen ab 50 nötig)';
      break;
    case 'unally': G.militiaAlly=-1; G.attitude[0]=Math.max(-100,G.attitude[0]-30); updateRel(); r='Hauptmann Dorin: „So endet es also. Lebt wohl.“'; break;
    case 'war2': G.militiaWar[0]=true; G.attitude[0]=-100; if(G.militiaAlly===0) G.militiaAlly=-1; updateRel(); r='Hauptmann Dorin: „Dann sehen wir uns auf dem Schlachtfeld.“'; msg('Krieg gegen die Grenzmiliz erklärt.','#ff8a7a'); break;
    case 'peace2': p.res.money-=500; G.militiaWar[0]=false; G.attitude[0]=-30; updateRel(); r='Hauptmann Dorin: „Wir nehmen an. Aber wir beobachten Euch.“'; break;
  }
  say(r); renderDiplo();
}
