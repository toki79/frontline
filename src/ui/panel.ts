import { $$ } from './dom';
import { fmt } from '../core/util';
import { BUILDINGS, DEF, ECON, FACTIONS, FEATURES, NUKE, RES, RESEARCH, TILE, UNITS, hasTech, isDefType } from '../data/config';
import { drawBuildingShape, drawFeature, drawRoad, drawUnitShape } from '../render/draw';
import { canAfford, lacking } from '../sim/costs';
import { nextMilestone } from '../sim/economy';
import { cancelItem, enqueue, missingReq, queueName } from '../sim/production';
import { G } from '../sim/state';
import { $ } from '../ui/dom';
import { costHtml } from '../ui/format';
import { refreshCmds } from '../ui/input';
import { msg } from '../core/events';
import { hideTip, showTip, tipFor } from '../ui/tooltips';
import { openTree } from '../ui/tree';

/* =====================================================================
   Bauleiste
   ===================================================================== */
export const ui: any={tab:'bau',btns:{},cat:{}};
// Kategorien je Reiter (Filter-Chips über den Bauknöpfen)
export const CATS = {
  bau: [['alle','Alle'],['wohnen','🏠 Wohnen',['house','block']],['versorgung','🌾 Nahrung & ⚡ Strom',['farm','greenhouse','power','npp']],
        ['rohstoffe','⛏ Rohstoffe',['lumber','forester','quarry','mine','refinery','derrick']],['wege','🛣 Wege, Lager, Handel',['road','depot','kontor']],
        ['stadtleben','🎭 Stadtleben',['park','theater','pool','stadium','firest']],['militaer','🪖 Militär',['barracks','factory','droneshop']],
        ['hightech','🎓 Wissen & Hightech',['university','datacenter','enrich','silo']]],
  truppen: [['alle','Alle'],['zivil','👷 Zivil',['worker','volunteer','diplomat','truck']],['inf','🪖 Infanterie',['inf','at']],
        ['fahrz','🚜 Fahrzeuge',['ifv','mbt','mlrs','spaag','jammer']],['drohnen','🛸 Drohnen',['drone','spy','reaper']]],
  vert: [['alle','Alle'],['pio','👷 Pioniere & Sperren',['pioneer','wall','wire','trench','atmine']],['stell','🎯 Stellungen',['sentry','turret','flak','gbunker']]],
  forsch: [['alle','Alle'],['offen','Offen'],['fertig','✓ Erforscht']],
};
export function setTab(t){ui.tab=t;$$('.tabs [data-tab]').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));buildPanel();}
function renderChips(){
  const cs=CATS[ui.tab]||[], cur=ui.cat[ui.tab]||'alle';
  $('#chips').innerHTML=cs.map(([k,l])=>`<button data-cat="${k}" class="${k===cur?'on':''}">${l}</button>`).join('')+(ui.tab==='forsch'?'<button data-tree="1">🌳 Baum zeigen</button>':'');
}
export function drawIcon(cvs,type){
  const c=cvs.getContext('2d'); c.clearRect(0,0,84,84); c.save(); c.scale(2,2);
  const f=FACTIONS[0];
  if(RESEARCH[type]){ const R=RESEARCH[type]; c.font='26px sans-serif'; c.textAlign='center'; c.fillText(R.icon||'🎓',21,R.level?28:31); if(R.level){ c.font='bold 11px sans-serif'; c.fillStyle='#e9d27a'; c.fillText('Stufe '+R.level,21,40); } }
  else if(type==='nuke'){ c.font='30px sans-serif'; c.textAlign='center'; c.fillText('🚀',21,31); }
  else if(FEATURES[type]&&FEATURES[type].road){ c.translate(5,5); c.fillStyle='#6f7e45'; c.fillRect(0,0,32,32); drawRoad(c,0,0,[[1,-1],[-1,1]],32,false); }
  else if(FEATURES[type]){ c.translate(5,5); drawFeature(c,FEATURES[type].id,0,0,[[1,-1],[-1,1]],32); }
  else if(UNITS[type]){ c.translate(21,21); c.scale(1.45,1.45); drawUnitShape(c,type,f.col,f.dark,0,0,-0.5,-0.5,1); }
  else { const d=BUILDINGS[type], s=38/(Math.max(d.w,d.h)*TILE); c.translate(21-d.w*TILE*s/2,21-d.h*TILE*s/2); c.scale(s,s); drawBuildingShape(c,type,f.col,f.dark,0,0,d.w,d.h,-0.6); }
  c.restore();
}
export function buildPanel(){
  const box=$('#items'); box.innerHTML=''; ui.btns={}; renderChips();
  let list= ui.tab==='bau' ? ['road', ...Object.keys(BUILDINGS).filter(k=>BUILDINGS[k].buildable!==false&&!BUILDINGS[k].def)]
            : ui.tab==='forsch' ? [...Object.keys(RESEARCH), 'nuke']
            : ui.tab==='vert' ? ['pioneer','wall','wire','trench','atmine','sentry','turret','flak','gbunker']
            : ['worker','volunteer',...Object.keys(UNITS).filter(k=>UNITS[k].prod&&!UNITS[k].stored&&k!=='worker'&&k!=='volunteer')];
  // Filter nach Kategorie, dann sortieren: verfügbar zuerst, gesperrt danach, Erforschtes ans Ende
  const cat=(CATS[ui.tab]||[]).find(c=>c[0]===(ui.cat[ui.tab]||'alle'));
  if(cat&&cat[2]) list=list.filter(k=>cat[2].includes(k));
  if(G&&ui.tab==='forsch'){ const p=G.players[0]; if(cat&&cat[0]==='offen') list=list.filter(k=>!(RESEARCH[k]&&hasTech(p,k))); if(cat&&cat[0]==='fertig') list=list.filter(k=>RESEARCH[k]&&hasTech(p,k)); }
  if(G){ const p=G.players[0], rank=k=>RESEARCH[k]&&hasTech(p,k)?2:missingReq(0,k).length?1:0;
    list=list.map((k,i)=>[k,i]).sort((a: any,b: any)=>rank(a[0])-rank(b[0])||a[1]-b[1]).map(a=>a[0]) as string[]; }
  if(!list.length) box.innerHTML='<div style="padding:20px;color:var(--dim);font-size:13px">Nichts in dieser Kategorie.</div>';
  for(const k of list){
    const d=DEF(k), el=document.createElement('button'); el.className='it';
    el.innerHTML=`<canvas width="84" height="84"></canvas><span class="n">${d.name}</span><span class="c">${costHtml(d.cost)}</span><div class="pr"></div><span class="q"></span><span class="st"></span>`;
    drawIcon(el.querySelector('canvas'),k);
    let lp=null, swallow=false;
    el.addEventListener('pointerenter',e=>{ if(e.pointerType==='mouse') showTip(tipFor(k),el); });
    el.addEventListener('pointerdown',e=>{swallow=false; if(e.pointerType==='mouse') return;
      lp=setTimeout(()=>{swallow=true; if(G&&cancelItem(0,k)) msg(d.name+' abgebrochen, Kosten erstattet.'); else showTip(tipFor(k),el,6000);},500);});
    const clr=()=>{clearTimeout(lp);};
    el.addEventListener('pointerup',clr); el.addEventListener('pointercancel',clr);
    el.addEventListener('pointerleave',e=>{clr(); if(e.pointerType==='mouse') hideTip();});
    el.addEventListener('contextmenu',e=>{e.preventDefault();clr();if(!swallow&&G&&cancelItem(0,k))msg(d.name+' abgebrochen, Kosten erstattet.');swallow=true;});
    el.addEventListener('click',()=>{ if(swallow){swallow=false;return;} if(!G||G.over) return; buildClick(k); });
    box.appendChild(el);
    ui.btns[k]={el,pr:el.querySelector('.pr'),q:el.querySelector('.q'),st:el.querySelector('.st')};
  }
  updatePanel();
}
export function buildClick(k){
  const p=G.players[0];
  if(isDefType(k)){ const miss=missingReq(0,k); if(miss.length){msg('Benötigt: '+miss.join(', '),'#ffb38a');return;}
    G.placing=G.placing===k?null:k; G.roadStart=null; G.sel=[]; refreshCmds(); return; }
  const miss=missingReq(0,k);
  if(miss.length){msg('Benötigt: '+miss.join(', '),'#ffb38a');return;}
  if(BUILDINGS[k]){   // Gebäude: direkt in den Platzier-Modus, bezahlt wird beim Setzen der Baustelle
    if(G.placing===k){ G.placing=null; refreshCmds(); return; }
    const lack=lacking(0,k);
    if(lack.length){msg('Es fehlt: '+lack.map(r=>RES[r].name).join(', '),'#ffb38a');return;}
    G.placing=k; G.sel=[]; refreshCmds(); return; }
  if(k==='nuke'&&(p.nukes||0)+p.q.silo.length>=NUKE.maxStock){msg(`Höchstens ${NUKE.maxStock} Atomraketen gleichzeitig.`,'#ffb38a');return;}
  if(k==='nuke'&&p.q.silo.length){msg('Im Silo wird bereits eine Rakete gebaut.','#ffb38a');return;}
  if(RESEARCH[k]){ if(hasTech(p,k)){msg('Bereits erforscht.');return;} if(p.q.research.length){msg('Die Universität forscht bereits.','#ffb38a');return;} }
  const lack=lacking(0,k);
  if(lack.length){msg('Es fehlt: '+lack.map(r=>r==='pop'?`Einwohner (mind. ${ECON.minPop} müssen bleiben)`:RES[r].name).join(', '),'#ffb38a');return;}
  enqueue(0,k);
}
export function updatePanel(){
  if(!G) return; const p=G.players[0], A=G.players[1];
  for(const [k,b] of (Object.entries(ui.btns) as [string, any][])){
    const qn=queueName(k), q=qn?p.q[qn]:[], miss=missingReq(0,k);
    const sites=BUILDINGS[k]?G.buildings.filter(x=>!x.dead&&x.site&&x.owner===0&&x.type===k).length:0;
    const n=q.filter(i=>i.type===k).length+sites, cur=q[0]&&q[0].type===k?q[0]:null;
    b.el.classList.toggle('ready',G.placing===k);
    b.el.classList.toggle('locked',miss.length>0);
    b.el.classList.toggle('poor',!miss.length&&!canAfford(0,k)&&!n);
    b.pr.style.width=cur?(cur.t/cur.time*100)+'%':'0';
    b.q.style.display=n>0&&!isDefType(k)?'block':'none'; b.q.textContent=String(n);
    if(RESEARCH[k]&&hasTech(p,k)){ b.el.classList.add('locked','done'); b.st.textContent='✓ erforscht'; continue; }
    if(k==='nuke'&&p.nukes>0&&!cur){ b.st.textContent=`☢ ${p.nukes} bereit – Silo wählen`; continue; }
    if(cur&&cur.stalled){ b.st.textContent=cur.stalled; continue; }
    b.st.textContent=G.placing===k?(isDefType(k)?'Feld antippen…':'Bauplatz antippen…'):miss.length?'benötigt: '+miss.join(', '):'';
  }
  $('#rMoney').textContent='$'+fmt(p.res.money);
  $('#rFood').textContent=fmt(p.res.food);
  const fr=$('#rFoodRate'); fr.textContent=(p.foodRate>=0?'+':'')+p.foodRate.toFixed(1); fr.classList.toggle('neg',p.foodRate<0);
  $('#rMetal').textContent=fmt(p.res.metal);
  $('#rWood').textContent=fmt(p.res.wood);
  $('#rStone').textContent=fmt(p.res.stone);
  for(const [r,id] of [['food','#rFood'],['wood','#rWood'],['stone','#rStone'],['metal','#rMetal'],['oil','#rOil']]) $(id).parentElement.classList.toggle('full',p.res[r]>=p.store-1);
  $('#rMoney').classList.toggle('broke',!!p.broke);
  for(const [r,id] of [['food','#rFood'],['wood','#rWood'],['stone','#rStone'],['metal','#rMetal'],['oil','#rOil']]){ const el=$(id).parentElement; el.classList.toggle('scarce',G.profile[0].scarce.includes(r)); el.classList.toggle('rich',G.profile[0].rich.includes(r)); }
  $('#rOil').textContent=fmt(p.res.oil);
  const pw=$('#power'); pw.textContent=`⚡ ${p.use}/${p.power}`; pw.classList.toggle('low',p.use>p.power);
  $('#popMe').textContent=`${Math.floor(p.pop)}/${p.cap}`;
  { const h=p.happy??0.8, el=$('#happy'); el.textContent=`${h>=0.75?'😊':h>=0.5?'😐':h>=0.35?'😟':'😠'} ${Math.round(h*100)} %`; el.classList.toggle('low',h<0.5); }
  const goalMe=G.mode==='race'?ECON.target:nextMilestone(p.pop), goalAi=G.mode==='race'?ECON.target:nextMilestone(A.pop);
  $('#popMeBar').style.width=Math.min(100,p.pop/goalMe*100)+'%';
  $('#popAi').textContent=G.known[0][1]?String(Math.floor(A.pop)):'???';
  $('#popAiBar').style.width=G.known[0][1]?Math.min(100,A.pop/goalAi*100)+'%':'0';
  $('#popAiBar').closest('.pb').querySelector('.nm').textContent=G.known[0][1]?'👥 Kastrova':'👥 ???';
  const st=$('#stance'); st.textContent=!G.known[0][1]?'unbekannt':G.war?'⚔ Krieg':'Frieden'; st.style.background=!G.known[0][1]?'#3a3a34':G.war?'#7a2219':'#2a4f7a';
}

export function init(){
// Höhe der oberen Leiste (bricht auf schmalen Handys um) für die Lage von Bevölkerungsleiste, Meldungen und Minikarte
{ const top=$('#top'), set=()=>document.documentElement.style.setProperty('--toph',top.offsetHeight+'px');
  set(); addEventListener('resize',set); if('ResizeObserver' in window) new ResizeObserver(set).observe(top); }
$$('.tabs [data-tab]').forEach(b=>b.addEventListener('click',()=>{setTab(b.dataset.tab);$('#panel').classList.remove('min');}));
$('#chips').addEventListener('click',e=>{ const t=(e.target as HTMLElement).closest('button') as HTMLElement; if(!t) return;
  if(t.dataset.tree){ openTree(); return; } ui.cat[ui.tab]=t.dataset.cat; buildPanel(); $('#items').scrollLeft=0; });
$('#bFold').addEventListener('click',()=>{const p=$('#panel');p.classList.toggle('min');$('#bFold').textContent=p.classList.contains('min')?'▴':'▾';});
}
