import { MAJORS, TILE } from '../data/config';
import { G } from '../sim/state';
import { hash } from '../core/util';

/* =====================================================================
   Stimmung: Bürger und Karren in der Stadt, Wolkenschatten, Tag und Nacht
   ---------------------------------------------------------------------
   Reine Darstellung ohne Einfluss auf das Spiel. Die Passanten laufen
   zwischen Gebäuden derselben Stadt hin und her; sie werden vor den
   Gebäuden gezeichnet und verschwinden so „in“ den Häusern.
   ===================================================================== */
type Walker={o:number,x:number,y:number,tx:number,ty:number,sp:number,cart:boolean,col:string,wait:number};
let walkers:Walker[]=[], game=null, lastT=0, seedT=0;
const CLOTH=['#c9b48a','#8a6a4a','#a04a3a','#4a6a8a','#6a8a4a','#d8d0c0','#7a5a7a','#b8873a'];
const civil=b=>!b.dead&&!b.site&&!b.def.def&&b.type!=='wall'&&b.type!=='camp'&&b.type!=='bunker';
function pick(owner,near?){ const L=G.buildings.filter(b=>b.owner===owner&&civil(b)&&(!near||Math.hypot(b.x-near.x,b.y-near.y)<14)); return L.length?L[Math.floor(Math.random()*L.length)]:null; }
const door=b=>({x:b.x+(Math.random()-.5)*b.w*0.5,y:b.ty+b.h+0.15});
/** Passanten bewegen und zeichnen (im Bodendurchgang, vor den Gebäuden) */
export function drawWalkers(c,vis,tileVis,z){
  const now=performance.now()/1000, dt=Math.min(0.1,now-lastT); lastT=now;
  if(game!==G){ game=G; walkers=[]; seedT=0; }
  if(z<0.55) return;                                   // weit herausgezoomt: zu klein, um sie zu sehen
  if(!G.paused&&now-seedT>1.5){ seedT=now;              // Bestand an die Stadtgröße anpassen
    for(const o of MAJORS){ const want=Math.min(34,Math.floor(G.players[o].pop/22)), have=walkers.filter(w=>w.o===o).length;
      if(have<want){ const a=pick(o); const b=a&&pick(o,a); if(a&&b&&a!==b){ const s=door(a), t=door(b); walkers.push({o,x:s.x,y:s.y,tx:t.x,ty:t.y,sp:0.7+Math.random()*0.5,cart:Math.random()<0.16,col:CLOTH[Math.floor(Math.random()*CLOTH.length)],wait:0}); } }
      else if(have>want+2){ const i=walkers.findIndex(w=>w.o===o); if(i>=0) walkers.splice(i,1); } } }
  for(const w of walkers){
    if(!G.paused){ if(w.wait>0){ w.wait-=dt; if(w.wait<=0){ const b=pick(w.o,w); if(b){ const t=door(b); w.tx=t.x; w.ty=t.y; } } }
      else { const dx=w.tx-w.x, dy=w.ty-w.y, d=Math.hypot(dx,dy); if(d<0.15) w.wait=1+Math.random()*5; else { const s=Math.min(d,w.sp*(w.cart?0.8:1)*dt); w.x+=dx/d*s; w.y+=dy/d*s; } } }
    if(w.wait>0||!vis(w.x,w.y)||(G.fog&&tileVis(w.x,w.y)<2)) continue;
    const x=w.x*TILE, y=w.y*TILE, a=Math.atan2(w.ty-w.y,w.tx-w.x), bob=Math.sin(now*9+w.sp*40)*0.5;
    c.fillStyle='rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x+1,y+1.5,w.cart?4.5:2,w.cart?2.5:1.3,0,0,7); c.fill();
    if(w.cart){ c.save(); c.translate(x,y); c.rotate(a); c.fillStyle='#7a5a36'; c.fillRect(-5,-2.5,7,5); c.fillStyle='#caa24a'; c.fillRect(-4,-1.6,5,3.2);   // Karren mit Ladung
      c.fillStyle='#2a2420'; c.fillRect(-4,-3.4,2.4,1); c.fillRect(-4,2.4,2.4,1); c.fillStyle=w.col; c.beginPath(); c.arc(4,0,1.7,0,7); c.fill(); c.restore(); }
    else { c.fillStyle=w.col; c.beginPath(); c.arc(x,y+bob*0.3,1.9,0,7); c.fill(); c.fillStyle='#e6c9a0'; c.beginPath(); c.arc(x+Math.cos(a)*0.6,y+Math.sin(a)*0.6+bob*0.3,1,0,7); c.fill(); }
  }
}
/* ---------- Tageszeit ---------- */
let nightOn=true; try{ nightOn=localStorage.getItem('frontlinie.night')!=='0'; }catch(e){}
export const nightOpt=()=>nightOn;
export function setNightOpt(on:boolean){ nightOn=on; try{ localStorage.setItem('frontlinie.night',on?'1':'0'); }catch(e){} }
export const DAY={len:720, night:0.22, dusk:0.08, dark:0.34};   // 12 min je Tag, davon gut ein Fünftel Nacht
/** 0 = heller Tag … 1 = tiefe Nacht */
export function nightLevel(){
  if(!G||!nightOn) return 0;
  const p=((G.t+DAY.len*0.3)%DAY.len)/DAY.len, n0=1-DAY.night-DAY.dusk*2;   // Start am Vormittag
  if(p<n0) return 0; if(p<n0+DAY.dusk) return (p-n0)/DAY.dusk; if(p<1-DAY.dusk) return 1; return (1-p)/DAY.dusk;
}
let glow:HTMLCanvasElement=null;
function glowSprite(){ if(glow) return glow; glow=document.createElement('canvas'); glow.width=glow.height=64; const g=glow.getContext('2d'), gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,214,130,.55)'); gr.addColorStop(0.4,'rgba(255,190,100,.2)'); gr.addColorStop(1,'rgba(255,170,80,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64); return glow; }
/** Wolkenschatten, Abendrot, Nacht und Lichter – über Gelände, Gebäuden und Einheiten, unter dem Nebel */
export function drawSky(c,x0,y0,w,h,vis,lit:(b)=>boolean,units){
  const now=performance.now()/1000;
  // Wolkenschatten: große weiche Flecken ziehen langsam nach Osten
  for(let i=0;i<7;i++){ const span=220*TILE, cx=((hash(i*3,7)*span+now*(9+i*1.7))%span)-30*TILE, cy=hash(i,11)*150*TILE, rx=(9+hash(i,3)*8)*TILE, ry=rx*0.55;
    if(cx+rx<x0||cx-rx>x0+w||cy+ry<y0||cy-ry>y0+h) continue;
    const g=c.createRadialGradient(cx,cy,rx*0.2,cx,cy,rx); g.addColorStop(0,'rgba(10,16,28,.13)'); g.addColorStop(1,'rgba(10,16,28,0)');
    c.save(); c.translate(cx,cy); c.scale(1,ry/rx); c.translate(-cx,-cy); c.fillStyle=g; c.beginPath(); c.arc(cx,cy,rx,0,7); c.fill(); c.restore(); }
  const n=nightLevel(); if(n<=0) return;
  if(n<1){ c.fillStyle=`rgba(255,120,50,${Math.sin(n*Math.PI)*0.1})`; c.fillRect(x0,y0,w,h); }   // Abend- und Morgenrot
  c.fillStyle=`rgba(12,20,52,${n*DAY.dark})`; c.fillRect(x0,y0,w,h);
  // Lichter: Fenster und Scheinwerfer leuchten durch die Dunkelheit
  const s=glowSprite(); c.globalCompositeOperation='lighter'; c.globalAlpha=n;
  for(const b of G.buildings){ if(b.dead||b.site||b.def.def||b.type==='wall'||!vis(b.x,b.y,4)||!lit(b)) continue;
    const r=Math.max(b.w,b.h)*TILE*0.95; c.drawImage(s,b.x*TILE-r,(b.ty+b.h)*TILE-r*0.9,r*2,r*1.6); }
  for(const u of units){ if(u.def.cls!=='veh') continue; const r=TILE*0.9, hx=u.x*TILE+Math.cos(u.angle)*TILE*0.7, hy=u.y*TILE+Math.sin(u.angle)*TILE*0.7; c.drawImage(s,hx-r,hy-r,r*2,r*2); }
  c.globalAlpha=1; c.globalCompositeOperation='source-over';
}
