import { $$ } from './dom';
import { fmt } from '../core/util';
import { BUILDINGS, DEF, ECON, FACTIONS, FEATURES, RES, RESEARCH, TILE, UNITS, isDefType } from '../data/config';
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

/* =====================================================================
   Bauleiste
   ===================================================================== */
export const ui: any={tab:'bau',btns:{}};
export function setTab(t){ui.tab=t;$$('.tabs [data-tab]').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));buildPanel();}
export function drawIcon(cvs,type){
  const c=cvs.getContext('2d'); c.clearRect(0,0,84,84); c.save(); c.scale(2,2);
  const f=FACTIONS[0];
  if(RESEARCH[type]){ c.font='26px sans-serif'; c.textAlign='center'; c.fillText('🎓',21,28); c.font='bold 11px sans-serif'; c.fillStyle='#e9d27a'; c.fillText('Stufe '+RESEARCH[type].level,21,40); }
  else if(FEATURES[type]&&FEATURES[type].road){ c.translate(5,5); c.fillStyle='#6f7e45'; c.fillRect(0,0,32,32); drawRoad(c,0,0,[[1,-1],[-1,1]],32,false); }
  else if(FEATURES[type]){ c.translate(5,5); drawFeature(c,FEATURES[type].id,0,0,[[1,-1],[-1,1]],32); }
  else if(UNITS[type]){ c.translate(21,21); c.scale(1.45,1.45); drawUnitShape(c,type,f.col,f.dark,0,0,-0.5,-0.5,1); }
  else { const d=BUILDINGS[type], s=38/(Math.max(d.w,d.h)*TILE); c.translate(21-d.w*TILE*s/2,21-d.h*TILE*s/2); c.scale(s,s); drawBuildingShape(c,type,f.col,f.dark,0,0,d.w,d.h,-0.6); }
  c.restore();
}
export function buildPanel(){
  const box=$('#items'); box.innerHTML=''; ui.btns={};
  const list= ui.tab==='bau' ? ['road', ...Object.keys(BUILDINGS).filter(k=>BUILDINGS[k].buildable!==false&&!BUILDINGS[k].def), ...Object.keys(RESEARCH)]
            : ui.tab==='vert' ? ['wall','wire','trench','sentry','turret','flak']
            : Object.keys(UNITS).filter(k=>UNITS[k].prod);
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
    G.placing=G.placing===k?null:k; G.sel=[]; refreshCmds(); return; }
  const miss=missingReq(0,k);
  if(miss.length){msg('Benötigt: '+miss.join(', '),'#ffb38a');return;}
  if(BUILDINGS[k]){   // Gebäude: direkt in den Platzier-Modus, bezahlt wird beim Setzen der Baustelle
    if(G.placing===k){ G.placing=null; refreshCmds(); return; }
    const lack=lacking(0,k);
    if(lack.length){msg('Es fehlt: '+lack.map(r=>RES[r].name).join(', '),'#ffb38a');return;}
    G.placing=k; G.sel=[]; refreshCmds(); return; }
  if(RESEARCH[k]){ if(p.tech>=RESEARCH[k].level){msg('Bereits erforscht.');return;} if(p.q.research.length){msg('Die Universität forscht bereits.','#ffb38a');return;} }
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
    if(RESEARCH[k]&&p.tech>=RESEARCH[k].level){ b.el.classList.add('locked'); b.st.textContent='✓ erforscht'; continue; }
    b.st.textContent=G.placing===k?(isDefType(k)?'Feld antippen…':'Bauplatz antippen…'):miss.length?'benötigt: '+miss.join(', '):'';
  }
  $('#rMoney').textContent='$'+fmt(p.res.money);
  $('#rFood').textContent=fmt(p.res.food);
  const fr=$('#rFoodRate'); fr.textContent=(p.foodRate>=0?'+':'')+p.foodRate.toFixed(1); fr.classList.toggle('neg',p.foodRate<0);
  $('#rMetal').textContent=fmt(p.res.metal);
  $('#rWood').textContent=fmt(p.res.wood);
  $('#rStone').textContent=fmt(p.res.stone);
  for(const [r,id] of [['food','#rFood'],['metal','#rMetal'],['oil','#rOil']]){ const el=$(id).parentElement; el.classList.toggle('scarce',G.profile[0].scarce===r); el.classList.toggle('rich',G.profile[0].rich===r); }
  $('#rOil').textContent=fmt(p.res.oil);
  const pw=$('#power'); pw.textContent=`⚡ ${p.use}/${p.power}`; pw.classList.toggle('low',p.use>p.power);
  $('#popMe').textContent=`${Math.floor(p.pop)}/${p.cap}`;
  const goalMe=G.mode==='race'?ECON.target:nextMilestone(p.pop), goalAi=G.mode==='race'?ECON.target:nextMilestone(A.pop);
  $('#popMeBar').style.width=Math.min(100,p.pop/goalMe*100)+'%';
  $('#popAi').textContent=Math.floor(A.pop);
  $('#popAiBar').style.width=Math.min(100,A.pop/goalAi*100)+'%';
  const st=$('#stance'); st.textContent=G.war?'⚔ Krieg':'Frieden'; st.style.background=G.war?'#7a2219':'#2a4f7a';
}

export function init(){
// Höhe der oberen Leiste (bricht auf schmalen Handys um) für die Lage von Bevölkerungsleiste, Meldungen und Minikarte
{ const top=$('#top'), set=()=>document.documentElement.style.setProperty('--toph',top.offsetHeight+'px');
  set(); addEventListener('resize',set); if('ResizeObserver' in window) new ResizeObserver(set).observe(top); }
$$('.tabs [data-tab]').forEach(b=>b.addEventListener('click',()=>{setTab(b.dataset.tab);$('#panel').classList.remove('min');}));
$('#bFold').addEventListener('click',()=>{const p=$('#panel');p.classList.toggle('min');$('#bFold').textContent=p.classList.contains('min')?'▴':'▾';});
}
