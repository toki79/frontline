import { TILE } from '../data/config';
import { G } from '../sim/state';
import { hash } from '../core/util';
import { rr } from './draw';

/* =====================================================================
   Gefechtsgrafik: Kettenspuren, Wracks, Trümmer, Explosionen, Rauch
   ---------------------------------------------------------------------
   Reine Darstellung. Spuren merkt sich der Renderer selbst (sie werden
   nicht gespeichert); Wracks und Trümmer liefert die Simulation als
   einfache Listen (G.wrecks, G.rubble).
   ===================================================================== */
type Track={x:number,y:number,a:number,w:number,t:number};
let tracks:Track[]=[], last=new WeakMap<object,{x:number,y:number}>(), game=null;
const TRACK_LIFE=14, TRACK_MAX=900;
/** Fahrzeug hat sich bewegt: Spurstück ablegen (nur sichtbare Bodenfahrzeuge) */
export function trackUnit(u){
  if(game!==G){ game=G; tracks=[]; last=new WeakMap(); }
  if(u.def.cls!=='veh') return false;
  const p=last.get(u); if(!p){ last.set(u,{x:u.x,y:u.y}); return false; }
  const d=Math.hypot(u.x-p.x,u.y-p.y); if(d<0.34) return false;
  if(d<3){ tracks.push({x:(u.x+p.x)/2,y:(u.y+p.y)/2,a:Math.atan2(u.y-p.y,u.x-p.x),w:u.def.size*TILE*0.52,t:G.t}); if(tracks.length>TRACK_MAX) tracks.splice(0,tracks.length-TRACK_MAX); }
  p.x=u.x; p.y=u.y; return true;
}
/** alles, was am Boden liegt: Spuren, Trümmer, Wracks (vor Gebäuden und Einheiten zeichnen) */
export function drawGround(c,vis,tileVis){
  if(game!==G){ game=G; tracks=[]; last=new WeakMap(); }
  // Kettenspuren
  if(tracks.length){ while(tracks.length&&G.t-tracks[0].t>TRACK_LIFE) tracks.shift();
    c.lineCap='butt';
    for(const s of tracks){ if(!vis(s.x,s.y)) continue; const a=(1-(G.t-s.t)/TRACK_LIFE)*0.3; if(a<=0.01) continue;
      const L=0.36*TILE, cx=s.x*TILE, cy=s.y*TILE, ca=Math.cos(s.a), sa=Math.sin(s.a);
      c.strokeStyle=`rgba(46,38,26,${a})`; c.lineWidth=2.6; c.beginPath();
      for(const o of [-s.w,s.w]){ const ox=-sa*o, oy=ca*o; c.moveTo(cx+ox-ca*L,cy+oy-sa*L); c.lineTo(cx+ox+ca*L,cy+oy+sa*L); }
      c.stroke(); } }
  // Trümmer zerstörter Gebäude
  if(G.rubble) for(const r of G.rubble){ if(!vis(r.x,r.y,4)||(G.fog&&tileVis(r.x,r.y)===0)) continue; const a=Math.min(1,(1-(G.t-r.t)/r.life)*2.5); if(a<=0) continue;
    const px=(r.x-r.w/2)*TILE, py=(r.y-r.h/2)*TILE, W=r.w*TILE, H=r.h*TILE; c.globalAlpha=a;
    c.fillStyle='rgba(52,46,38,.55)'; rr(c,px+2,py+2,W-4,H-4,6); c.fill();
    const n=Math.round(r.w*r.h*5);
    for(let i=0;i<n;i++){ const hx=hash(i*7+r.x*3,r.y*5+i), hy=hash(r.y*11+i,i*3+r.x), s=2+hash(i,r.x+r.y)*5;
      const x=px+4+hx*(W-8), y=py+4+hy*(H-8);
      c.fillStyle=i%3===0?'#8a8478':i%3===1?'#6a6458':'#4e4a42'; c.save(); c.translate(x,y); c.rotate(hx*6); c.fillRect(-s/2,-s/3,s,s*0.66); c.restore();
      if(i%5===0){ c.strokeStyle='#3a302a'; c.lineWidth=1.3; c.beginPath(); c.moveTo(x-5,y+hy*4); c.lineTo(x+6,y-hx*5); c.stroke(); } }   // Balken
    c.globalAlpha=1; }
  // Wracks
  if(G.wrecks) for(const w of G.wrecks){ if(!vis(w.x,w.y)||(G.fog&&tileVis(w.x,w.y)<2)) continue; const a=Math.min(1,(1-(G.t-w.t)/w.life)*3); if(a<=0) continue;
    const L=w.size*TILE*1.5, Wd=w.size*TILE*0.95; c.save(); c.globalAlpha=a; c.translate(w.x*TILE,w.y*TILE); c.rotate(w.a);
    c.fillStyle='rgba(20,18,14,.4)'; c.beginPath(); c.ellipse(0,0,L*0.8,Wd*0.9,0,0,7); c.fill();                       // Brandfleck
    c.fillStyle='#1f1d19'; c.fillRect(-L/2,-Wd/2-1,L*0.7,2.6); c.fillRect(-L/2+L*0.2,Wd/2-1.6,L*0.8,2.6);               // gerissene Ketten
    c.fillStyle='#3b3832'; c.strokeStyle='#17150f'; c.lineWidth=1; rr(c,-L/2+1,-Wd/2+1.5,L-2,Wd-3,2.5); c.fill(); c.stroke();
    c.fillStyle='#262420'; c.beginPath(); c.arc(1,0.5,Wd*0.28,0,7); c.fill();                                            // ausgebrannte Turmöffnung
    c.rotate(0.9+hash(w.x,w.y)*2); c.fillStyle='#33302a'; c.fillRect(Wd*0.2,Wd*0.3,L*0.45,2.4);                          // abgesprengtes Rohr
    c.restore(); }
}
/** Explosion: heller Kern, Feuerball, Druckwelle, Funken, aufsteigender Rauch */
export function drawBoom(c,e,k){
  const x=e.x*TILE, y=e.y*TILE, R=e.r*TILE, r=R*(0.35+0.9*Math.sqrt(k));
  if(R>9&&k<0.55){ c.strokeStyle=`rgba(255,235,190,${(0.55-k)*0.9})`; c.lineWidth=Math.max(1,R*0.12*(1-k)); c.beginPath(); c.arc(x,y,R*(0.5+k*2.2),0,7); c.stroke(); }   // Druckwelle
  const g=c.createRadialGradient(x,y,0,x,y,r); const a=1-k;
  g.addColorStop(0,`rgba(255,250,215,${a})`); g.addColorStop(0.35,`rgba(255,${Math.floor(205-110*k)},70,${a*0.95})`); g.addColorStop(0.75,`rgba(215,${Math.floor(90-50*k)},25,${a*0.7})`); g.addColorStop(1,'rgba(80,40,20,0)');
  c.fillStyle=g; c.beginPath(); c.arc(x,y,r,0,7); c.fill();
  if(R>6){ const n=R>18?9:6; c.strokeStyle=`rgba(255,220,130,${a*0.9})`; c.lineWidth=1.2; c.beginPath();   // Funken
    for(let i=0;i<n;i++){ const an=hash(e.x*13+i,e.y*7)*6.283, d0=R*(0.3+k*1.9)*(0.6+hash(i,e.x+e.y)*0.7), d1=d0+R*0.28*(1-k);
      c.moveTo(x+Math.cos(an)*d0,y+Math.sin(an)*d0+k*k*R*0.5); c.lineTo(x+Math.cos(an)*d1,y+Math.sin(an)*d1+k*k*R*0.5); }
    c.stroke(); }
  if(k>0.25){ const s=(k-0.25)/0.75; c.fillStyle=`rgba(58,54,50,${(1-s)*0.5})`;   // Rauchpilz
    for(let i=0;i<3;i++){ const ox=(hash(e.x+i,e.y*3)-0.5)*R*0.9; c.beginPath(); c.arc(x+ox+s*5,y-s*R*(0.7+i*0.25)-i*2,R*(0.35+s*0.45),0,7); c.fill(); } }
}
/** Mündungsfeuer: Stern mit hellem Kern */
export function drawFlash(c,e,k){
  const x=e.x*TILE, y=e.y*TILE, r=e.r*(1.2-k*0.5), a=1-k;
  const g=c.createRadialGradient(x,y,0,x,y,r*1.6); g.addColorStop(0,`rgba(255,252,225,${a})`); g.addColorStop(0.5,`rgba(255,200,90,${a*0.7})`); g.addColorStop(1,'rgba(255,140,40,0)');
  c.fillStyle=g; c.beginPath(); c.arc(x,y,r*1.6,0,7); c.fill();
  if(e.r>=4&&e.r<16){ c.strokeStyle=`rgba(255,240,180,${a})`; c.lineWidth=1.4; c.beginPath(); for(let i=0;i<4;i++){ const an=i*1.571+hash(e.x*9,e.y*5)*1.5; c.moveTo(x,y); c.lineTo(x+Math.cos(an)*r*2.1,y+Math.sin(an)*r*2.1); } c.stroke(); }
}
/** Rauch und Staub: weiche Ballen, die aufsteigen und zerfasern */
export function drawSmoke(c,e,k){
  const x=e.x*TILE+k*5, y=e.y*TILE-k*(e.k==='dust'?5:15), r=e.r*TILE*(0.55+k*1.1), a=(1-k)*(e.k==='dust'?0.3:e.col?0.55:0.42);
  const col=e.k==='dust'?'150,132,100':e.col?'28,26,23':e.steam?'225,228,230':'104,101,95';
  c.fillStyle=`rgba(${col},${a})`; c.beginPath(); c.arc(x,y,r,0,7); c.fill();
  c.fillStyle=`rgba(${col},${a*0.6})`; c.beginPath(); c.arc(x+r*0.55,y-r*0.35,r*0.62,0,7); c.arc(x-r*0.5,y+r*0.2,r*0.5,0,7); c.fill();
}
/** Leuchtspur: heller Kopf, verblassender Schweif */
export function drawTracer(c,e,k){
  const x1=e.x1*TILE,y1=e.y1*TILE,x2=e.x2*TILE,y2=e.y2*TILE, h=Math.min(1,k*1.6+0.25), t0=Math.max(0,h-0.35);
  const ax=x1+(x2-x1)*t0, ay=y1+(y2-y1)*t0, bx=x1+(x2-x1)*h, by=y1+(y2-y1)*h;
  c.globalAlpha=(1-k)*0.35; c.strokeStyle=e.col; c.lineWidth=1; c.beginPath(); c.moveTo(x1,y1); c.lineTo(bx,by); c.stroke();
  c.globalAlpha=1-k*0.6; c.lineWidth=1.8; c.beginPath(); c.moveTo(ax,ay); c.lineTo(bx,by); c.stroke();
  c.fillStyle='#fff8dc'; c.beginPath(); c.arc(bx,by,1.3,0,7); c.fill(); c.globalAlpha=1;
}
