import { $$ } from './dom';
import { fmt } from '../core/util';
import { BUILDINGS, ECON, REGION, RES, T } from '../data/config';
import { distTo } from '../sim/combat';
import { aiQuotes, marketOpen, needLevel } from '../sim/market';
import { G, regionText } from '../sim/state';
import { countBuildings, hostile, visibleUnit } from '../sim/world';
import { $ } from '../ui/dom';
import { f1 } from '../ui/format';
import { cmd, refreshCmds } from '../ui/input';
import { siteLacks } from '../sim/build';
import { openDiplo } from '../ui/menus';
import { msg } from '../core/events';
import { buildClick, setTab } from '../ui/panel';

/* =====================================================================
   Berater: meldet den wichtigsten Engpass
   ===================================================================== */
export const settings={tips:true};
export function setTipsOpt(on){ settings.tips=on; try{localStorage.setItem('frontlinie.tips',on?'1':'0');}catch(e){} $$('.optTips').forEach(c=>c.checked=on); updateAdvisor(); }
export const advEl=$('#advisor'); let advCur=null;
export function advise(){
  const p=G.players[0], A=G.players[1], ai=G.ai, has=t=>countBuildings(0,t,true);
  const sites=G.buildings.filter(b=>!b.dead&&b.owner===0&&b.site), busy=sites.length>=2;
  const workers=G.units.filter(u=>!u.dead&&u.owner===0&&u.def.worker).length;
  const army=G.units.filter(u=>!u.dead&&u.owner===0&&u.def.weapon).length;
  const B=k=>({label:BUILDINGS[k].name+' bauen',fn:()=>{setTab('bau');$('#panel').classList.remove('min');buildClick(k);}});
  const T=[];
  // Bedrohungen zuerst
  if(G.war){ let near=0; for(const u of G.units){ if(u.dead||u.owner===0||!hostile(0,u.owner)) continue; for(const b of G.buildings) if(!b.dead&&b.owner===0&&distTo(u,b)<6){near++;break;} }
    if(near) T.push({p:100,txt:`<b>${near} feindliche Einheiten in der Stadt!</b> Wähle deine Truppen (◎ Alle) und tippe den Gegner an.`,act:{label:'◎ Alle wählen',fn:()=>cmd('all')}}); }
  if(p.res.food<=0) T.push({p:95,txt:'<b>Hungersnot!</b> Die Bevölkerung schrumpft. Baue einen Bauernhof oder kaufe Nahrung am Milizmarkt.',act:busy?{label:'🤝 Markt',fn:openDiplo}:B('farm')});
  const trainW={label:'Bauarbeiter ausbilden',fn:()=>{setTab('truppen');$('#panel').classList.remove('min');buildClick('worker');}};
  if(!workers) T.push({p:sites.length?92:58,txt:`<b>Keine Bauarbeiter!</b> Ohne sie entsteht kein Gebäude und keine Straße. Bilde am Rathaus neue aus (Reiter Truppen).`,act:trainW});
  else if(sites.length>workers&&G.t>30) T.push({p:36,txt:`<b>${sites.length} Baustellen, aber nur ${workers} Bauarbeiter.</b> Mehr Arbeiter bauen schneller (bis zu 4 je Baustelle).`,act:trainW});
  const sc=r=>G.profile[0].scarce.includes(r);
  if(!has('lumber')&&p.res.wood<150&&sc('wood')) T.push({p:p.res.wood<60?70:40,txt:'<b>Holz wird knapp</b> – eure Region hat kaum Wald. Kauft Holz am Milizmarkt oder bei Kastrova, oder baut euch zum nächsten Wald vor.',act:{label:'🤝 Holz kaufen',fn:openDiplo}});
  else if(!has('lumber')&&p.res.wood<150) T.push({p:p.res.wood<60?78:48,txt:'<b>Holz wird knapp</b> und es gibt keinen Holzfäller. Baue ihn am Waldrand (Wald wird gelb markiert).',act:B('lumber')});
  else if(p.res.wood<50&&has('lumber')<3&&G.t>120) T.push({p:42,txt:'<b>Holzmangel:</b> Wohnhäuser und Bauernhöfe brauchen Holz. Ein weiterer Holzfäller oder eine Straße zum vorhandenen hilft.',act:B('lumber')});
  if(!has('quarry')&&p.res.stone<120&&G.t>25&&sc('stone')) T.push({p:p.res.stone<50?66:38,txt:'<b>Stein wird knapp</b> – in Stadtnähe gibt es keine Felsen. Kauft Stein am Markt oder bei Kastrova, oder erobert die Felsen weiter draußen.',act:{label:'🤝 Stein kaufen',fn:openDiplo}});
  else if(!has('quarry')&&p.res.stone<120&&G.t>25) T.push({p:p.res.stone<50?74:44,txt:'<b>Kein Steinbruch:</b> Stein brauchst du für Straßen, Kraftwerk, Industrie und Stellungen. Baue ihn direkt an den hellen Felsbrocken.',act:B('quarry')});
  { const far=G.buildings.filter(b=>!b.dead&&!b.site&&b.owner===0&&(b.eff??1)<0.7).sort((a,c)=>a.eff-c.eff)[0];
    const planned=G.road.some((r,i)=>r===1&&G.roadOwner[i]===1);
    if(far&&!planned&&G.t>60) T.push({p:far.eff<0.5?46:30,txt:`<b>${far.def.name}: weiter Transportweg</b> – nur ${Math.round(far.eff*100)} % kommen im Lager an. Eine Straße oder ein Lagerhaus in der Nähe holt mehr heraus.`,act:{label:'🛣 Straße planen',fn:()=>{G.sel=[far];cmd('road');}}}); }
  { const w=G.buildings.find(b=>!b.dead&&b.site&&b.owner===0&&siteLacks(b));
    if(w){ const m=siteLacks(w), src=m==='wood'?'lumber':m==='stone'?'quarry':'mine';
      T.push({p:62,txt:`<b>Baustelle ${w.def.name} wartet auf ${RES[m].name}.</b> ${G.profile[0].scarce.includes(m)?`Eure Region hat kaum ${RES[m].name} – kauft es am Markt oder bei Kastrova.`:`Baue ${BUILDINGS[src].name} oder kaufe ${RES[m].name} am Markt.`}`,act:G.profile[0].scarce.includes(m)||has(src)?{label:'🤝 Kaufen',fn:openDiplo}:B(src)}); } }
  if(G.road.some((r,i)=>r===1&&G.roadOwner[i]===1)&&p.res.stone<2) T.push({p:41,txt:'<b>Straßenbau steht:</b> Für jedes Straßenfeld brauchen die Arbeiter Stein.',act:has('quarry')||G.profile[0].scarce.includes('stone')?{label:'🤝 Stein kaufen',fn:openDiplo}:B('quarry')});
  if((p.happy??1)<0.55&&p.moodWhy&&p.moodWhy.length){ const w=p.moodWhy.slice().sort((a,b)=>b.amt-a.amt)[0];
    T.push({p:p.happy<0.4?88:58,txt:`<b>Die Einwohner sind unzufrieden (${Math.round(p.happy*100)} %).</b> Hauptgrund: ${w.txt}. Das kostet Steuern und Wachstum${p.happy<0.4?' – erste Familien wandern ab':''}.`}); }
  { const c=G.buildings.find(c=>!c.dead&&c.type==='camp'&&G.buildings.some(b=>!b.dead&&b.owner===0&&!b.def.def&&Math.hypot(c.x-b.x,c.y-b.y)<16));
    if(c) T.push({p:34,txt:'<b>Räuberlager in der Nähe.</b> Räuber überfallen unbegleitete Arbeiter, Laster und Außenposten. Schick Truppen (◎ Alle, dann Lager antippen) oder begleite Arbeiter mit 🛡.',act:{label:'◎ Truppen wählen',fn:()=>cmd('all')}}); }
  if(p.broke) T.push({p:82,txt:'<b>Die Kasse ist leer!</b> Unterhalt, Sold und Verwaltung übersteigen die Einnahmen – Betriebe laufen nur halb so schnell. Weniger Truppen, Überflüssiges abreißen, mehr Einwohner oder Handel.',act:{label:'🤝 Handeln',fn:openDiplo}});
  { const full=['food','wood','stone','metal','oil'].filter(r=>p.res[r]>=p.store-1);
    if(full.length) T.push({p:37,txt:`<b>Lager voll:</b> ${full.map(r=>RES[r].icon+' '+RES[r].name).join(', ')} (${fmt(p.store)}). Was nicht hineinpasst, geht verloren. Ein Lagerhaus schafft Platz, ein Handelskontor macht Überschuss zu Geld.`,act:has('kontor')?B('depot'):B('kontor')}); }
  { const f=G.buildings.find(b=>!b.dead&&!b.site&&b.owner===0&&b.type==='farm'&&(b.fieldF??1)<0.6);
    if(f) T.push({p:39,txt:`<b>Bauernhof mit zu wenig Äckern</b> (Ertrag ${Math.round((f.fieldF??1)*100)} %). Ein Hof braucht freie Fläche um sich herum, am besten grüne Wiese – nicht zubauen.`,act:B('farm')}); }
  if(p.foodRate<0&&p.res.food>0) T.push({p:p.res.food/-p.foodRate<90?85:p.res.food/-p.foodRate<240?45:22,txt:`<b>Nahrung sinkt</b> (${f1(p.foodRate)}/s) – in ca. ${Math.round(p.res.food/-p.foodRate)} s ist der Vorrat leer. Ein Bauernhof ernährt 125 Einwohner.`,act:B('farm')});
  if(p.use>p.power) T.push({p:80,txt:'<b>Strommangel:</b> Bauen, Wachstum und Verteidigung laufen nur halb so schnell.',act:B('power')});
  if(p.pop>=p.cap-3) T.push({p:70,txt:'<b>Wohnraum voll</b> – die Stadt wächst nicht mehr. Ein Wohnhaus bringt Platz für 50 Einwohner.',act:B('house')});
  if(p.growQ<0.8&&p.pop<p.cap-3) T.push({p:p.growQ<0.6?60:42,txt:`<b>Schlechte Wohnlage bremst das Wachstum</b> (Wohnqualität ${Math.round(p.growQ*100)} %): Lärm von Industrie oder enge Bebauung. Baue Wohnhäuser mit Freiraum drumherum, abseits von Kraftwerk, Mine, Raffinerie und Fahrzeugwerk.`,act:B('house')});
  else if(p.pop>=p.cap-15&&!busy) T.push({p:35,txt:'Der <b>Wohnraum</b> wird bald knapp – plane das nächste Wohnhaus.',act:B('house')});
  if(p.power-p.use<15&&p.use<=p.power&&!busy) T.push({p:33,txt:'<b>Strom</b> wird knapp – das nächste Wohnhaus oder die nächste Mine könnte zu Mangel führen.',act:B('power')});
  if(p.rate&&p.rate.mines>0&&p.rate.mines===p.rate.minesEmpty) T.push({p:55,txt:'Deine <b>Mine ist erschöpft</b>. Baue eine neue direkt an anderen grauen Erzfelsen.',act:B('mine')});
  if(!has('mine')&&G.t>90&&p.res.metal<120&&sc('metal')) T.push({p:40,txt:'<b>Kein Metall:</b> In Stadtnähe gibt es kaum Erz. Kauft Metall am Milizmarkt oder bei Kastrova – oder baut euch zu den Erzfelsen weiter draußen vor.',act:{label:'🤝 Metall kaufen',fn:openDiplo}});
  else if(!has('mine')&&G.t>90&&p.res.metal<120) T.push({p:45,txt:'<b>Kein Metall-Nachschub.</b> Ohne Metall keine Panzer, kein Fahrzeugwerk. Baue eine Mine direkt an den grauen Erzfelsen.',act:B('mine')});
  if(G.attitude[1]>=30&&G.militiaAlly===-1&&G.attitude[1]>G.attitude[0]&&!G.militiaWar[0]) T.push({p:G.attitude[1]>=48?75:40,txt:`<b>Kastrova umwirbt die Miliz</b> (Ansehen ${Math.round(G.attitude[1])} gegen eures ${Math.round(G.attitude[0])}). Ab 60 verbündet sie sich mit Kastrova. Schick ein Geschenk.`,act:{label:'🤝 Diplomatie',fn:openDiplo}});
  if(!G.war&&ai.lead&&army<6) T.push({p:50,txt:'<b>Kastrova wird misstrauisch</b>, weil ihr schneller wachst. Baue Verteidigung (Kaserne, MK-Stellung) oder besänftige mit Geschenken.',act:has('barracks')?B('turret'):B('barracks')});
  if(!G.war&&(ai.ratio||0)>2.2&&G.t>120) T.push({p:38,txt:'<b>Kastrova ist militärisch deutlich stärker.</b> Rechne mit Forderungen. Ein paar eigene Truppen machen dich weniger erpressbar.',act:has('barracks')?{label:'Truppen',fn:()=>{setTab('truppen');$('#panel').classList.remove('min');}}:B('barracks')});
  if(!has('refinery')&&G.t>240&&!busy) T.push({p:30,txt:'<b>Kein Öl:</b> Ohne Raffinerie keine Fahrzeuge. Öl lässt sich außerdem am Markt gegen Geld tauschen.',act:B('refinery')});
  if(!G.war){ const qs=aiQuotes(); const good=qs.find(q=>q.side==='buy'&&p.res[q.res]>=q.amt*2&&!G.profile[0].scarce.includes(q.res));
    if(good) T.push({p:good.urgent?40:24,txt:`<b>Kastrova sucht ${RES[good.res].name}</b> und zahlt $${good.price} für ${good.amt} ${RES[good.res].icon}. Ihr habt genug – Handel bringt Geld und Frieden.`,act:{label:'🤝 Handeln',fn:openDiplo}});
    const offer=qs.find(q=>q.side==='sell'&&G.profile[0].scarce.includes(q.res)), sc=offer&&offer.res;
    if(offer&&needLevel(0,sc)>=1.2) T.push({p:44,txt:`<b>Euer Engpass: ${RES[sc].name}.</b> Kastrova verkauft gerade ${offer.amt} ${RES[sc].icon} für $${offer.price}.`,act:{label:'🤝 Kaufen',fn:openDiplo}}); }
  if(p.fuelShort) T.push({p:72,txt:'<b>Treibstoffmangel!</b> Eure Fahrzeuge fahren und schießen nur halb so schnell. Raffinerie und Tanklaster bauen oder Öl kaufen.',act:{label:'🤝 Markt',fn:openDiplo}});
  { const ed=G.units.filter(u=>!u.dead&&u.def.cls==='air'&&hostile(0,u.owner)&&visibleUnit(u)).length, aa=G.buildings.filter(b=>!b.dead&&b.owner===0&&(b.type==='flak'||b.type==='sentry'||b.type==='turret')).length;
    if(ed>=1&&aa<2) T.push({p:66,txt:`<b>${ed} feindliche Drohne${ed>1?'n':''}!</b> Panzer und Panzerabwehr treffen keine Drohnen. Baue Flugabwehr, Selbstschussanlagen oder MK-Stellungen.`,act:{label:'Flugabwehr',fn:()=>{setTab('vert');$('#panel').classList.remove('min');buildClick('flak');}}}); }
  if(G.war){ const defs=G.buildings.filter(b=>!b.dead&&b.owner===0&&b.def.def&&b.def.weapon).length;
    if(defs<2) T.push({p:52,txt:'<b>Krieg:</b> Verteidigung ist günstiger als Angriff. Gräben mit Infanterie, Stacheldraht davor und ein paar Selbstschussanlagen halten viel auf.',act:{label:'Verteidigung',fn:()=>{setTab('vert');$('#panel').classList.remove('min');}}}); }
  if(G.t<70) T.push({p:31,txt:`<b>Eure Region:</b> ${regionText(0)}. Kastrova hat genau das, was euch fehlt – handelt (🤝) oder holt es euch.`});
  if(!countBuildings(0,'kontor')&&(p.res.oil>600||p.res.food>1000||p.res.metal>600)) T.push({p:34,txt:`<b>Überschuss im Lager</b> (🛢 ${fmt(p.res.oil)} · 🌾 ${fmt(p.res.food)} · ⛏ ${fmt(p.res.metal)}). Ein Handelskontor exportiert ihn laufend gegen Geld.`,act:B('kontor')});
  if(p.res.oil>300&&marketOpen(0)) T.push({p:20,txt:`<b>${fmt(p.res.oil)} Öl</b> auf Lager. Am Milizmarkt bekommst du Geld dafür.`,act:{label:'🤝 Markt',fn:openDiplo}});
  if(!sites.length&&G.t>20&&p.res.money>=300) T.push({p:28,txt:'<b>Keine Baustelle offen.</b> Deine Bauarbeiter warten – jeder Bauauftrag bringt die Stadt voran.',act:{label:'Gebäude',fn:()=>{setTab('bau');$('#panel').classList.remove('min');}}});
  if(G.mode==='race'&&p.pop>=ECON.target*0.85) T.push({p:15,txt:`Nur noch <b>${Math.ceil(ECON.target-p.pop)} Einwohner</b> bis zum Sieg! Kastrova wird jetzt alles versuchen, euch aufzuhalten.`});
  T.sort((a,b)=>b.p-a.p);
  if(T[0]) T[0].u=T[0].p>=75;
  return T[0]||null;
}
export function updateAdvisor(){
  if(!G||!settings.tips||G.over){advEl.classList.add('hidden');return;}
  const t=advise(); advCur=t;
  if(!t){advEl.classList.add('hidden');return;}
  advEl.classList.remove('hidden'); advEl.classList.toggle('urgent',!!t.u);
  $('#advText').innerHTML=t.txt;
  const b=$('#advAct'); b.style.display=t.act?'block':'none'; if(t.act) b.textContent=t.act.label;
}

export function init(){
try{ const v=localStorage.getItem('frontlinie.tips'); if(v!==null) settings.tips=v==='1'; }catch(e){}
$$('.optTips').forEach(c=>{c.checked=settings.tips;c.addEventListener('change',()=>setTipsOpt(c.checked));});
$('#advAct').addEventListener('click',()=>{ if(advCur&&advCur.act&&G&&!G.over){ advCur.act.fn(); setTimeout(updateAdvisor,50);} });
$('#advX').addEventListener('click',()=>{ setTipsOpt(false); msg('Spieltipps aus – wieder einschalten über ❓ oder Menü.'); });
}
