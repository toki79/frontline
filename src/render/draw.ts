import { FEAT, TILE } from '../data/config';
import { G } from '../sim/state';

export function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
/* =====================================================================
   Zeichnen
   ===================================================================== */
export function drawUnitShape(c,type,col,dark,x,y,ang,tur,hpf){
  c.save(); c.translate(x,y);
  if(type==='inf'||type==='at'||type==='militia'||type==='bandit'||type==='volunteer'||type==='para'){
    const n=Math.max(1,Math.ceil(hpf*3-0.01)), offs=[[4,0],[-3,-5],[-3,5]];
    c.rotate(ang);
    for(let i=0;i<n;i++){const [ox,oy]=offs[i];
      c.fillStyle='rgba(0,0,0,.28)'; c.beginPath(); c.arc(ox+1.5,oy+1.5,3.5,0,7); c.fill();
      const tube=type==='at'&&i===0;
      c.strokeStyle='#1d1d1a'; c.lineWidth=tube?2.8:1.3; c.beginPath(); c.moveTo(ox-(tube?4:0),oy+1.6); c.lineTo(ox+(tube?8:7),oy+1.6); c.stroke();
      c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=1.2; c.beginPath(); c.arc(ox,oy,3.5,0,7); c.fill(); c.stroke();
      c.fillStyle=type==='militia'?'#5a4a2c':type==='bandit'?'#2a2622':type==='volunteer'?'#8a6a4a':type==='para'?'#6a3a5a':'#3c4a2c'; c.beginPath(); c.arc(ox,oy,1.9,0,7); c.fill();
    }
  } else if(type==='diplomat'){   // Diplomat: Anzug und Hut
    c.rotate(ang); c.fillStyle='rgba(0,0,0,.28)'; c.beginPath(); c.arc(1.5,1.5,3.4,0,7); c.fill();
    c.fillStyle='#2a2a30'; c.strokeStyle='#111'; c.lineWidth=1; c.beginPath(); c.arc(0,0,3.6,0,7); c.fill(); c.stroke();
    c.fillStyle=col; c.beginPath(); c.arc(0,0,2.2,0,7); c.fill(); c.fillStyle='#e8e0c8'; c.fillRect(2,-0.8,2.5,1.6);
  } else if(type==='worker'||type==='pioneer'){
    // Bauarbeiter: gelber Helm, beim Arbeiten schwingt der Hammer (hpf<0 = arbeitet)
    const work=hpf<0, t=G?G.t:0;
    c.rotate(ang);
    c.fillStyle='rgba(0,0,0,.28)'; c.beginPath(); c.arc(1.5,1.5,3.4,0,7); c.fill();
    if(work){ const sw=Math.sin(t*14+x)*0.9; c.save(); c.rotate(sw); c.strokeStyle='#6b4a2a'; c.lineWidth=1.4; c.beginPath(); c.moveTo(0,1); c.lineTo(7,1); c.stroke();
      c.fillStyle='#5a5a55'; c.fillRect(6,-1,2.5,4); c.restore(); }
    else { c.strokeStyle='#6b4a2a'; c.lineWidth=1.2; c.beginPath(); c.moveTo(-1,3); c.lineTo(5,4); c.stroke(); }
    c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=1; c.beginPath(); c.arc(0,0,3.8,0,7); c.fill(); c.stroke();
    if(type==='pioneer'){ c.fillStyle='#5a6236'; c.strokeStyle='#2a2e18'; c.beginPath(); c.arc(0,0,2.7,0,7); c.fill(); c.stroke(); c.fillStyle='#e0c040'; c.fillRect(-1,-3.6,2,1.6); }
    else { c.fillStyle='#f2c230'; c.strokeStyle='#8a6a10'; c.beginPath(); c.arc(0,0,2.5,0,7); c.fill(); c.stroke(); }
  } else if(type==='spaag'||type==='jammer'){
    c.rotate(ang);
    c.fillStyle='rgba(0,0,0,.3)'; rr(c,-9,-5,21,12,3); c.fill();
    c.fillStyle='#2b2b26'; c.fillRect(-10,-7,20,3); c.fillRect(-10,4,20,3);
    c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=1.1; rr(c,-10,-6,20,12,2.5); c.fill(); c.stroke();
    if(type==='spaag'){ c.rotate(tur-ang); c.fillStyle=dark; c.fillRect(1,-3.2,12,1.6); c.fillRect(1,1.6,12,1.6);
      c.fillStyle=col; rr(c,-5,-4.5,10,9,2); c.fill(); c.strokeStyle=dark; c.stroke();
      c.strokeStyle='#cfd8d0'; c.lineWidth=1.2; c.beginPath(); c.arc(-2,0,3.2,-1.2,1.2); c.stroke(); }   // Radarschüssel
    else { c.fillStyle='#4a4d42'; c.fillRect(-7,-4,9,8); c.strokeStyle='#1d1d1a'; c.lineWidth=1.3;
      c.beginPath(); c.moveTo(-3,0); c.lineTo(-3,-9); c.moveTo(-6,-7); c.lineTo(0,-7); c.moveTo(-5,-5); c.lineTo(-1,-5); c.stroke();   // Antennen
      const t=G?G.t:0; c.strokeStyle=`rgba(140,200,255,${0.25+0.25*Math.sin(t*6)})`; c.beginPath(); c.arc(-3,-9,4+((t*8)%6),0,7); c.stroke(); }
  } else if(type==='ifv'||type==='mbt'){
    const big=type==='mbt', L=big?24:20, Wd=big?16:13;
    c.rotate(ang);
    c.fillStyle='rgba(0,0,0,.3)'; rr(c,-L/2+2,-Wd/2+2,L,Wd,3); c.fill();
    c.fillStyle='#2b2b26'; c.fillRect(-L/2,-Wd/2-1,L,3.2); c.fillRect(-L/2,Wd/2-2.2,L,3.2);
    c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=1.2; rr(c,-L/2+1,-Wd/2+1.5,L-2,Wd-3,2.5); c.fill(); c.stroke();
    c.fillStyle='rgba(255,255,255,.12)'; c.fillRect(-L/2+3,-Wd/2+3,L-8,2);
    c.rotate(tur-ang);
    c.fillStyle=dark;
    if(big){ c.fillRect(3,-1.6,15,3.2); c.fillStyle=col; c.beginPath(); c.arc(0,0,6.5,0,7); c.fill(); c.strokeStyle=dark; c.stroke(); c.fillStyle=dark; c.beginPath(); c.arc(-1.5,-1.5,1.6,0,7); c.fill(); }
    else { c.fillRect(2,-0.9,11,1.8); c.fillStyle=col; rr(c,-4,-3.8,8,7.6,1.5); c.fill(); c.strokeStyle=dark; c.stroke(); }
  } else if(type==='spy'||type==='reaper'){
    const t=G?G.t:0, big=type==='reaper';
    c.fillStyle='rgba(0,0,0,.18)'; c.save(); c.translate(14,18); c.rotate(ang); c.scale(big?1:0.6,big?1:0.6);   // Schatten weit unten = große Höhe
    c.beginPath(); c.moveTo(10,0); c.lineTo(-8,-2); c.lineTo(-8,2); c.closePath(); c.fill(); c.fillRect(-1,-13,4,26); c.restore();
    c.translate(0,-6+Math.sin(t*2+x)*0.8); c.rotate(ang);
    if(big){ c.fillStyle='#8f938a'; c.strokeStyle='#3c3f39'; c.lineWidth=1;
      c.beginPath(); c.moveTo(12,0); c.lineTo(-10,-2.2); c.lineTo(-10,2.2); c.closePath(); c.fill(); c.stroke();   // Rumpf
      c.fillRect(-1,-14,4,28); c.strokeRect(-1,-14,4,28);                                                          // Tragflächen
      c.beginPath(); c.moveTo(-9,0); c.lineTo(-13,-5); c.moveTo(-9,0); c.lineTo(-13,5); c.lineWidth=2; c.stroke();  // V-Leitwerk
      c.fillStyle=col; c.fillRect(-1,-14,4,4); c.fillRect(-1,10,4,4); c.fillStyle='#222'; c.fillRect(6,-1,3,2); }
    else { c.strokeStyle='#2a2a26'; c.lineWidth=1.4; c.beginPath(); c.moveTo(-4,-4); c.lineTo(4,4); c.moveTo(4,-4); c.lineTo(-4,4); c.stroke();
      for(const [rx,ry] of [[-4,-4],[4,-4],[-4,4],[4,4]]){ c.fillStyle='rgba(220,220,220,.4)'; c.beginPath(); c.arc(rx,ry,2.6,0,7); c.fill(); }
      c.fillStyle=col; c.strokeStyle=dark; c.beginPath(); c.arc(0,0,2.8,0,7); c.fill(); c.stroke();
      c.fillStyle='#9fd0ff'; c.beginPath(); c.arc(1.2,0,1.1,0,7); c.fill(); }
  } else if(type==='drone'){
    const t=G?G.t:0;
    c.fillStyle='rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(6,9,5,3,0,0,7); c.fill();   // Schatten am Boden
    c.translate(0,-3+Math.sin(t*6+x)*1); c.rotate(ang);
    c.strokeStyle='#222'; c.lineWidth=1.6; c.beginPath(); c.moveTo(-5,-5); c.lineTo(5,5); c.moveTo(5,-5); c.lineTo(-5,5); c.stroke();
    for(const [rx,ry] of [[-5,-5],[5,-5],[-5,5],[5,5]]){ c.fillStyle='rgba(200,200,200,.45)'; c.beginPath(); c.arc(rx,ry,3.2,0,7); c.fill(); c.strokeStyle='#333'; c.lineWidth=0.8; c.stroke(); }
    c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=1; rr(c,-3,-2.5,6,5,1.2); c.fill(); c.stroke();
    c.fillStyle='#ffd040'; c.fillRect(2,-1,2,2);
  } else if(type==='apc'||type==='amphib'){   // Transporter: Radpanzer bzw. Schwimmrumpf mit Luken
    c.rotate(ang); const amph=type==='amphib';
    c.fillStyle='rgba(0,0,0,.3)'; rr(c,-10,-5,23,12,3); c.fill();
    if(!amph){ c.fillStyle='#2b2b26'; for(const wx of [-8,-3,2,7]){ c.beginPath(); c.arc(wx,-5.5,2.2,0,7); c.fill(); c.beginPath(); c.arc(wx,5.5,2.2,0,7); c.fill(); } }
    c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=1; c.beginPath();
    if(amph){ c.moveTo(13,0); c.lineTo(8,-6); c.lineTo(-11,-6); c.lineTo(-11,6); c.lineTo(8,6); c.closePath(); } else rr(c,-11,-5.5,22,11,3);
    c.fill(); c.stroke(); c.fillStyle='rgba(0,0,0,.25)'; c.fillRect(-7,-3,5,6); c.fillRect(-1,-3,5,6);
    if(amph){ c.fillStyle='rgba(120,180,220,.6)'; c.fillRect(-12,-7,2,14); }
    c.rotate(tur-ang); c.fillStyle='#4a4d42'; c.beginPath(); c.arc(3,0,3,0,7); c.fill(); c.fillStyle='#22231f'; c.fillRect(4,-0.8,8,1.6);
  } else if(type==='swarm'){   // Drohnenschwarm: kleine Drohnen, Anzahl nach Zustand
    const t=G?G.t:0, n=Math.max(1,Math.ceil(hpf*8));
    for(let i=0;i<n;i++){ const a=i*2.4+t*1.5, r=3+((i*7)%5), ox=Math.cos(a)*r, oy=Math.sin(a)*r*0.8-3+Math.sin(t*7+i)*0.8;
      c.fillStyle='rgba(0,0,0,.2)'; c.beginPath(); c.arc(ox+3,oy+8,1.6,0,7); c.fill();
      c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=0.8; c.beginPath(); c.arc(ox,oy,2,0,7); c.fill(); c.stroke();
      c.strokeStyle='rgba(30,30,30,.7)'; c.beginPath(); c.moveTo(ox-2.6,oy-2.6); c.lineTo(ox+2.6,oy+2.6); c.moveTo(ox+2.6,oy-2.6); c.lineTo(ox-2.6,oy+2.6); c.stroke(); }
  } else if(type==='jet'){   // Jagdbomber: Deltaflügel, Schatten versetzt
    c.fillStyle='rgba(0,0,0,.22)'; c.save(); c.translate(7,10); c.rotate(ang); c.beginPath(); c.moveTo(11,0); c.lineTo(-8,-8); c.lineTo(-5,0); c.lineTo(-8,8); c.closePath(); c.fill(); c.restore();
    c.rotate(ang); c.fillStyle='#8a9098'; c.strokeStyle='#3a3e44'; c.lineWidth=1; c.beginPath(); c.moveTo(12,0); c.lineTo(-8,-9); c.lineTo(-5,0); c.lineTo(-8,9); c.closePath(); c.fill(); c.stroke();
    c.fillStyle=col; c.fillRect(-6,-1.5,12,3); c.fillStyle='#bcd6e6'; c.fillRect(5,-1,3,2); c.fillStyle='#ffb040'; c.fillRect(-9,-1,2,2);
  } else if(type==='tel'){   // Raketenträger: langer Lkw mit aufgerichteter Rakete
    c.rotate(ang);
    c.fillStyle='rgba(0,0,0,.3)'; rr(c,-12,-5,26,12,2); c.fill();
    c.fillStyle='#2b2b26'; for(const wx of [-10,-5,0,6]){c.fillRect(wx,-7,3.5,2.2);c.fillRect(wx,4.8,3.5,2.2);}
    c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=1; rr(c,-13,-5.5,26,11,2); c.fill(); c.stroke();
    c.fillStyle='#bcd6e6'; c.fillRect(10,-3.5,1.5,7);
    c.fillStyle='#d8d4c4'; c.strokeStyle='#55534a'; rr(c,-11,-2,18,4,2); c.fill(); c.stroke(); c.fillStyle='#c0392b'; c.fillRect(5,-2,2.5,4);
  } else if(type==='mlrs'){
    c.rotate(ang);
    c.fillStyle='rgba(0,0,0,.3)'; rr(c,-10,-5,23,12,2); c.fill();
    c.fillStyle='#2b2b26'; for(const wx of [-9,-3,5]){c.fillRect(wx,-7,4,2.2);c.fillRect(wx,4.8,4,2.2);}
    c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=1; rr(c,-11,-5.5,22,11,2); c.fill(); c.stroke();
    c.fillStyle='#bcd6e6'; c.fillRect(8,-3.5,1.5,7);
    c.rotate(tur-ang); c.fillStyle='#4a4d42'; c.strokeStyle='#22231f'; c.fillRect(-9,-5,13,10); c.strokeRect(-9,-5,13,10);
    c.fillStyle='#1d1d1a'; for(let i=0;i<3;i++)for(let j=0;j<2;j++) c.beginPath(), c.arc(-6+i*4,-2.5+j*5,1.3,0,7), c.fill();
  } else if(type==='caravan'){   // Handelskarawane: Planenlaster mit Kisten
    c.rotate(ang);
    c.fillStyle='rgba(0,0,0,.3)'; rr(c,-10,-4.5,22,11,2); c.fill();
    c.fillStyle='#2b2b26'; for(const wx of [-8,-2,7]){c.fillRect(wx,-6.5,3.5,2);c.fillRect(wx,4.5,3.5,2);}
    c.fillStyle='#b9a77a'; c.strokeStyle='#5e5236'; c.lineWidth=1; rr(c,-11,-5.5,16,11,2); c.fill(); c.stroke();
    c.strokeStyle='#8a7a52'; c.beginPath(); for(const k of [-7,-3,1]){ c.moveTo(k,-5.5); c.lineTo(k,5.5); } c.stroke();
    c.fillStyle=col; c.strokeStyle=dark; rr(c,6,-5,6,10,1.5); c.fill(); c.stroke();
  } else if(type==='truck'){
    c.rotate(ang);
    c.fillStyle='rgba(0,0,0,.3)'; rr(c,-10,-4.5,22,11,2); c.fill();
    c.fillStyle='#2b2b26'; for(const wx of [-8,-2,7]){c.fillRect(wx,-6.5,3.5,2);c.fillRect(wx,4.5,3.5,2);}
    c.fillStyle='#9ea29a'; c.strokeStyle='#4a4d47'; c.lineWidth=1; rr(c,-11,-5.5,16,11,4.5); c.fill(); c.stroke();
    c.fillStyle='rgba(255,255,255,.3)'; c.fillRect(-9,-3.5,12,1.6);
    c.fillStyle=col; c.strokeStyle=dark; rr(c,6,-5,6,10,1.5); c.fill(); c.stroke();
    c.fillStyle='#bcd6e6'; c.fillRect(10,-3.5,1.5,7);
  }
  c.restore();
}
export function drawBuildingShape(c,type,col,dark,px,py,w,h,tur,extra?,lvl=1){
  const W=w*TILE,H=h*TILE, tt=G?G.t:0;
  c.save(); c.translate(px,py);
  c.fillStyle='rgba(0,0,0,.32)'; c.fillRect(4,4,W,H);
  c.fillStyle=type==='farm'?'#7a6842':type==='house'?'#7f8a5a':type==='park'?'#5f8a3e':'#8e8c80'; c.fillRect(1,1,W-2,H-2);
  c.strokeStyle='#5e5d55'; c.lineWidth=1; c.strokeRect(1.5,1.5,W-3,H-3);
  const box=(x,y,ww,hh,f,s?)=>{c.fillStyle=f;c.fillRect(x,y,ww,hh);if(s){c.strokeStyle=s;c.strokeRect(x+0.5,y+0.5,ww-1,hh-1);}};
  const roof=(x,y,ww,hh)=>{box(x,y,ww,hh,col,dark);c.fillStyle='rgba(0,0,0,.22)';c.fillRect(x,y+hh/2,ww,hh/2);c.strokeStyle=dark;c.beginPath();c.moveTo(x,y+hh/2);c.lineTo(x+ww,y+hh/2);c.stroke();};
  switch(type){
    case 'hq':
      box(6,10,W-12,H-18,col,dark); box(10,14,W-20,H-26,dark);
      c.fillStyle='rgba(255,255,255,.15)'; c.fillRect(10,14,W-20,4);
      c.fillStyle='#cfcfc6'; c.beginPath(); c.arc(W-18,18,8,0,7); c.fill(); c.strokeStyle='#666'; c.stroke();
      c.strokeStyle='#555'; c.beginPath(); c.moveTo(W-18,18); c.lineTo(W-18+Math.cos(tt)*8,18+Math.sin(tt)*8); c.stroke();
      c.strokeStyle='#333'; c.lineWidth=1.5; c.beginPath(); c.moveTo(14,22); c.lineTo(14,4); c.stroke();
      c.fillStyle=col; c.fillRect(14,4,10,6);
      box(W/2-8,H-10,16,8,'#444');
      break;
    case 'house':
      roof(4,4,26,20); roof(W-28,H-24,24,20);
      c.fillStyle='#5e7a3e'; c.beginPath(); c.arc(W-14,14,6,0,7); c.fill(); c.beginPath(); c.arc(12,H-12,5,0,7); c.fill();
      c.fillStyle='#e8d890'; c.fillRect(9,26,4,3); c.fillRect(W-22,H-3,4,2);
      if(lvl>=2){ box(W/2-9,H/2-11,18,22,'#b9b2a0','#6a6455'); roof(W/2-10,H/2-14,20,9);   // aufgestocktes Stadthaus
        c.fillStyle='#4a5a6a'; c.fillRect(W/2-6,H/2-3,4,4); c.fillRect(W/2+2,H/2-3,4,4); c.fillRect(W/2-6,H/2+4,4,4); c.fillRect(W/2+2,H/2+4,4,4); }
      if(lvl>=3){ box(3,H/2-6,12,H/2+2,'#b0a996','#6a6455'); box(W-15,3,12,H/2+2,'#b0a996','#6a6455');   // Mehrfamilienhaus: Anbauten
        c.fillStyle='#4a5a6a'; for(const [wx,wy] of [[6,H/2-2],[6,H/2+5],[W-12,7],[W-12,14]]) c.fillRect(wx,wy,4,3); }
      break;
    case 'farm':
      for(let i=0;i<7;i++){ c.fillStyle=i%2?'#a69b4c':'#8f8a3c'; c.fillRect(4+i*((W-40)/7),4,(W-40)/7-1,H-8); }
      roof(W-32,6,26,22); box(W-32,H-22,26,16,'#9a8a70','#5e5440');
      c.fillStyle='#d8c06a'; c.beginPath(); c.arc(W-19,H-14,5,0,7); c.fill();
      if(lvl>=2){ for(const sx of lvl>=3?[W-44,W-54]:[W-44]){ c.fillStyle='#c9c6bb'; c.beginPath(); c.arc(sx,12,6,0,7); c.fill(); c.strokeStyle='#6d6a60'; c.stroke();   // Silos
        c.fillStyle='#9a978c'; c.beginPath(); c.arc(sx,12,2.5,0,7); c.fill(); } }
      if(lvl>=3){ box(W-56,H-20,24,14,'#9fc8b8','#5f8a7a'); c.fillStyle='#4f8a3a'; for(let yy=H-17;yy<H-8;yy+=4) c.fillRect(W-53,yy,18,2); }   // Treibhaus
      break;
    case 'mine':
      box(3,3,W-6,H-6,'#7a776e','#4c4b45');
      c.fillStyle='#2a2824'; c.fillRect(8,H-24,22,16);
      c.strokeStyle='#3a332c'; c.lineWidth=2.5; c.beginPath(); c.moveTo(10,H-24); c.lineTo(20,8); c.lineTo(30,H-24); c.stroke();
      c.strokeStyle='#c49a3a'; c.lineWidth=2; c.beginPath(); c.arc(20,10,5,0,7); c.stroke();
      c.save(); c.translate(20,10); c.rotate(tt*3); c.beginPath(); c.moveTo(-5,0); c.lineTo(5,0); c.moveTo(0,-5); c.lineTo(0,5); c.stroke(); c.restore();
      c.fillStyle='#9a9890'; c.beginPath(); c.moveTo(W-28,H-6); c.lineTo(W-18,H-20); c.lineTo(W-6,H-6); c.closePath(); c.fill();
      box(W-22,5,16,10,col,dark);
      if(extra) { c.fillStyle='rgba(0,0,0,.45)'; c.fillRect(1,1,W-2,H-2); }
      break;
    case 'lumber':
      box(4,H-20,W*0.5,16,'#7a5a38','#4a3420'); c.fillStyle='#5a3e24'; c.fillRect(4,H-20,W*0.5,4);   // Hütte
      box(W*0.5-6,H-16,6,6,col,dark);
      for(let i=0;i<3;i++)for(let j=0;j<3-i;j++){ const lx=W*0.58+j*7+i*3.5, ly=H-9-i*5.5;               // Stammstapel
        c.fillStyle='#8b6238'; c.beginPath(); c.arc(lx,ly,3.3,0,7); c.fill(); c.fillStyle='#c9a26a'; c.beginPath(); c.arc(lx,ly,1.8,0,7); c.fill(); }
      c.fillStyle='#365429'; c.beginPath(); c.arc(W*0.3,H*0.28,8,0,7); c.fill(); c.fillStyle='#4b6e36'; c.beginPath(); c.arc(W*0.27,H*0.24,3.5,0,7); c.fill();
      c.fillStyle='#6b4a2a'; c.beginPath(); c.arc(W*0.72,H*0.28,4,0,7); c.fill(); c.fillStyle='#b08a5a'; c.beginPath(); c.arc(W*0.72,H*0.28,2.5,0,7); c.fill();   // Baumstumpf
      if(extra) { c.fillStyle='rgba(0,0,0,.4)'; c.fillRect(1,1,W-2,H-2); }
      break;
    case 'quarry':
      c.fillStyle='#a49a84'; c.fillRect(3,3,W-6,H-6);
      c.fillStyle='#857b66'; c.beginPath(); c.moveTo(6,6); c.lineTo(W-10,8); c.lineTo(W-14,H*0.55); c.lineTo(10,H*0.5); c.closePath(); c.fill();   // Abbruchkante
      c.fillStyle='#6d6553'; c.beginPath(); c.moveTo(12,12); c.lineTo(W-18,13); c.lineTo(W-20,H*0.45); c.lineTo(15,H*0.42); c.closePath(); c.fill();
      for(const [bx,by] of [[W-20,H-14],[W-12,H-10],[W-16,H-20]]){ c.fillStyle='#c8c2b2'; c.fillRect(bx,by,7,6); c.strokeStyle='#7a7466'; c.strokeRect(bx+0.5,by+0.5,6,5); }   // Quader
      c.strokeStyle='#3a3a34'; c.lineWidth=2; c.beginPath(); c.moveTo(8,H-6); c.lineTo(8,H-24); c.lineTo(22,H-24); c.stroke();   // Kran
      c.lineWidth=1; c.beginPath(); c.moveTo(20,H-24); c.lineTo(20,H-16+Math.sin(tt*1.5)*3); c.stroke();
      box(10,H-12,12,8,col,dark);
      if(extra) { c.fillStyle='rgba(0,0,0,.4)'; c.fillRect(1,1,W-2,H-2); }
      break;
    case 'camp':   // Räuberlager: Zelte, Lagerfeuer, Palisade
      c.fillStyle='#6a5a3e'; c.fillRect(1,1,W-2,H-2);
      c.strokeStyle='#4a3a22'; c.lineWidth=2; c.setLineDash([3,2]); c.strokeRect(2,2,W-4,H-4); c.setLineDash([]);
      for(const [tx2,ty2,s2] of [[10,12,9],[W-12,14,8],[14,H-12,8]]){ c.fillStyle='#8a7a5a'; c.beginPath(); c.moveTo(tx2-s2,ty2+s2*0.7); c.lineTo(tx2,ty2-s2*0.7); c.lineTo(tx2+s2,ty2+s2*0.7); c.closePath(); c.fill();
        c.strokeStyle='#3a3020'; c.lineWidth=1; c.stroke(); c.fillStyle='#2a2216'; c.fillRect(tx2-1.5,ty2+s2*0.1,3,s2*0.6); }
      { const fl=0.7+0.3*Math.sin(tt*9); c.fillStyle='#3a3530'; c.beginPath(); c.arc(W-14,H-13,5,0,7); c.fill();
        c.fillStyle=`rgba(255,${Math.floor(140+60*fl)},40,.95)`; c.beginPath(); c.arc(W-14,H-14,3.2*fl,0,7); c.fill(); }
      c.fillStyle=dark; c.fillRect(W/2-1,4,2,10); c.fillStyle='#222'; c.fillRect(W/2+1,4,7,5);
      break;
    case 'power':
      for(const [cx,cy,r] of [[W*0.3,H*0.36,12],[W*0.68,H*0.62,11]]){c.fillStyle='rgba(0,0,0,.3)';c.beginPath();c.arc(cx+2,cy+2,r,0,7);c.fill();
        c.fillStyle='#bdbcb2';c.beginPath();c.arc(cx,cy,r,0,7);c.fill();c.fillStyle='#5a5952';c.beginPath();c.arc(cx,cy,r*0.58,0,7);c.fill();}
      box(4,H-11,W*0.45,7,col,dark);
      c.fillStyle='#e8d65a'; c.fillRect(W-12,6,5,8);
      break;
    case 'refinery':
      box(4,4,W*0.42,H-16,col,dark); box(8,8,W*0.42-8,6,dark);
      for(const [cx,cy,r] of [[W*0.6,H*0.33,9],[W*0.83,H*0.33,8]]){c.fillStyle='#cbc9be';c.beginPath();c.arc(cx,cy,r,0,7);c.fill();c.strokeStyle='#77756c';c.stroke();c.fillStyle='rgba(0,0,0,.15)';c.beginPath();c.arc(cx+2,cy+2,r*0.6,0,7);c.fill();}
      c.strokeStyle='#555'; c.lineWidth=2; c.beginPath(); c.moveTo(W*0.42+4,H*0.33); c.lineTo(W*0.6-9,H*0.33); c.stroke();
      c.fillStyle='#4d4c46'; c.fillRect(W/2-16,H-11,32,9);
      c.fillStyle='#d8c040'; for(let i=0;i<4;i++) c.fillRect(W/2-14+i*8,H-10,4,7);
      break;
    case 'barracks':
      for(const yy of [5,H/2+1]){ box(5,yy,W-10,H/2-7,'#6c7046','#3f4229'); c.strokeStyle='#4b4e30'; c.beginPath(); c.moveTo(5,yy+(H/2-7)/2); c.lineTo(W-5,yy+(H/2-7)/2); c.stroke(); }
      box(W-12,3,8,6,col,dark);
      break;
    case 'factory':
      box(3,3,W-6,H-14,col,dark);
      c.fillStyle=dark; for(let x=6;x<W-8;x+=12){c.globalAlpha=.45;c.fillRect(x,5,8,H-19);c.globalAlpha=1;}
      box(W/2-14,H-14,28,12,'#3d3c37'); c.fillStyle='#d8c040'; c.fillRect(W/2-14,H-4,28,2);
      break;
    case 'wall':
      c.fillStyle='#7d7b73'; c.fillRect(1,1,W-2,H-2); c.fillStyle='#93918a'; c.fillRect(3,3,W-6,H-10);
      c.strokeStyle='#55534d'; c.beginPath(); c.moveTo(1,H/2); c.lineTo(W-1,H/2); c.moveTo(W/2,1); c.lineTo(W/2,H/2); c.stroke();
      c.fillStyle=col; c.fillRect(W/2-3,H-5,6,3);
      break;
    case 'kontor':
      box(3,8,W-6,H-14,'#8a7a5a','#4f4533'); c.fillStyle='#6b5d42'; c.fillRect(3,8,W-6,5);
      for(const [cx2,cy2] of [[8,H-20],[18,H-20],[8,H-12],[W-16,H-12]]){ c.fillStyle='#b08a52'; c.fillRect(cx2,cy2,8,7); c.strokeStyle='#6e5530'; c.strokeRect(cx2+0.5,cy2+0.5,7,6); }
      c.fillStyle='#2b2b26'; c.beginPath(); c.arc(W-14,H-24,5,0,7); c.fill(); c.fillStyle='#c49a3a'; c.fillRect(W-16,H-30,4,6);
      box(W-12,2,8,5,col,dark);
      break;
    case 'university':
      box(4,4,W-8,H-12,'#b8ad92','#6e6650'); c.fillStyle='#8a5a3e'; c.fillRect(4,4,W-8,7);
      c.fillStyle='#ece5cf'; for(let i=0;i<6;i++) c.fillRect(10+i*((W-24)/5),12,4,H-24);
      c.fillStyle=col; c.fillRect(W/2-6,H-10,12,6);
      if(G){ const own=G.buildings.find(q=>q.type==='university'&&q.tx*TILE===Math.round(px)&&q.ty*TILE===Math.round(py)); const lv=own?G.players[own.owner].tech:1;
        c.fillStyle='#000a'; c.fillRect(W-24,H-12,20,10); c.fillStyle='#e9d27a'; c.font='bold 9px sans-serif'; c.fillText('S'+lv,W-20,H-4); }
      break;
    case 'block':   // Wohnblock: zwei Hochhausriegel mit Fensterreihen
      for(const [bx,by,bw,bh] of [[4,4,W/2-6,H-8],[W/2+2,10,W/2-6,H-14]]){ box(bx,by,bw,bh,'#a8a49a','#5c5a52');
        c.fillStyle='#4a5a6a'; for(let yy=by+4;yy<by+bh-3;yy+=6) for(let xx=bx+3;xx<bx+bw-3;xx+=5) c.fillRect(xx,yy,3,3); }
      c.fillStyle=col; c.fillRect(6,6,W/2-10,3); c.fillRect(W/2+4,12,W/2-10,3);
      break;
    case 'greenhouse':   // Gewächshaus: Glasdächer mit Pflanzenreihen
      for(let i=0;i<3;i++){ const x=4+i*(W-8)/3, ww=(W-8)/3-2; box(x,4,ww,H-8,'#9fc8b8','#5f8a7a');
        c.fillStyle='#4f8a3a'; for(let yy=8;yy<H-8;yy+=5) c.fillRect(x+3,yy,ww-6,2.5);
        c.fillStyle='rgba(255,255,255,.35)'; c.fillRect(x+1,5,2,H-10); }
      c.fillStyle=col; c.fillRect(W/2-4,H-6,8,3);
      break;
    case 'datacenter':   // Rechenzentrum: Serverhalle, Kühlaggregate, blinkende Lichter
      box(3,8,W-6,H-12,'#5d636b','#30343a');
      for(let i=0;i<4;i++){ c.fillStyle='#3a3f46'; c.fillRect(7+i*(W-14)/4,13,(W-14)/4-3,H-22);
        c.fillStyle=(Math.floor(tt*3+i)%3)?'#5ad06a':'#5ac8ff'; c.fillRect(9+i*(W-14)/4,16,2,2); c.fillRect(9+i*(W-14)/4,24,2,2); }
      for(const fx of [8,20,W-20]){ c.fillStyle='#8b9096'; c.beginPath(); c.arc(fx+4,6,4,0,7); c.fill(); c.strokeStyle='#30343a'; c.beginPath(); c.moveTo(fx+4,6); c.lineTo(fx+4+Math.cos(tt*9)*3.5,6+Math.sin(tt*9)*3.5); c.stroke(); }
      box(W-12,H-8,8,5,col,dark);
      break;
    case 'npp': {   // Kernkraftwerk: zwei Kühltürme mit Dampf, Reaktorkuppel
      for(const [kx,ky] of [[W*0.28,H*0.3],[W*0.28,H*0.72]]){ c.fillStyle='#b7b5ab'; c.beginPath(); c.arc(kx,ky,H*0.2,0,7); c.fill(); c.strokeStyle='#6a6860'; c.stroke();
        c.fillStyle='#55534d'; c.beginPath(); c.arc(kx,ky,H*0.13,0,7); c.fill();
        c.fillStyle='rgba(235,235,235,.55)'; for(let k=0;k<3;k++){ const a=(tt*0.6+k/3)%1; c.beginPath(); c.arc(kx+a*10,ky-a*14,5+a*6,0,7); c.fill(); } }
      c.fillStyle='#d6d2c4'; c.beginPath(); c.arc(W*0.72,H*0.45,H*0.2,0,7); c.fill(); c.strokeStyle='#6a6860'; c.stroke();
      c.fillStyle='#e8c230'; c.beginPath(); c.arc(W*0.72,H*0.45,5,0,7); c.fill(); c.fillStyle='#222'; c.font='bold 9px sans-serif'; c.textAlign='center'; c.fillText('☢',W*0.72,H*0.45+3);
      box(W*0.55,H*0.75,W*0.38,H*0.18,col,dark);
      break; }
    case 'enrich':   // Anreicherung: lange Halle mit Zentrifugenreihen
      box(3,4,W-6,H-8,'#7c7f74','#41433b');
      c.fillStyle='#c9ccc0'; for(let i=0;i<10;i++) for(let j=0;j<3;j++){ c.beginPath(); c.arc(10+i*(W-20)/9,12+j*(H-24)/2,2.6,0,7); c.fill(); }
      c.fillStyle='#e8c230'; c.fillRect(W-22,H-12,16,7); c.fillStyle='#222'; c.font='bold 8px sans-serif'; c.textAlign='center'; c.fillText('☢',W-14,H-6);
      box(6,H-10,10,5,col,dark);
      break;
    case 'silo': {   // Raketensilo: Betondeckel, im Besitz einer Rakete halb geöffnet
      const own=G&&G.buildings.find(q=>q.type==='silo'&&q.tx*TILE===Math.round(px)&&q.ty*TILE===Math.round(py)), armed=own&&G.players[own.owner].nukes>0;
      c.fillStyle='#6f6e66'; c.beginPath(); c.arc(W/2,H/2,W*0.4,0,7); c.fill(); c.strokeStyle='#3c3b36'; c.lineWidth=2; c.stroke(); c.lineWidth=1;
      c.fillStyle='#25251f'; c.beginPath(); c.arc(W/2,H/2,W*0.3,0,7); c.fill();
      c.fillStyle='#9a988d'; c.fillRect(W/2-W*0.3,H/2-W*0.3,W*0.6,armed?W*0.25:W*0.6);
      c.strokeStyle='#e8c230'; c.setLineDash([3,3]); c.beginPath(); c.arc(W/2,H/2,W*0.44,0,7); c.stroke(); c.setLineDash([]);
      if(armed){ c.fillStyle='#e0ded4'; c.beginPath(); c.arc(W/2,H/2+4,4,0,7); c.fill(); c.fillStyle='#c0392b'; c.beginPath(); c.arc(W/2,H/2+4,1.8,0,7); c.fill(); }
      box(W-12,H-8,8,5,col,dark);
      break; }
    case 'forester':   // Forsthaus: Blockhütte, Setzlingsbeete
      c.fillStyle='#6a7a42'; c.fillRect(2,2,W-4,H-4); roof(5,5,26,20);
      for(let i=0;i<3;i++) for(let j=0;j<2;j++){ c.fillStyle='#4a7a34'; c.beginPath(); c.arc(W-22+i*8,H-18+j*9,3,0,7); c.fill(); }
      c.fillStyle='#8a6a3a'; c.fillRect(8,H-12,16,6); c.fillStyle=col; c.fillRect(W-12,4,8,5);
      break;
    case 'airbase':   // Fliegerhorst: Startbahn, Hangars, Tower
      c.fillStyle='#5f6058'; c.fillRect(4,H/2-7,W-8,14); c.strokeStyle='#e8e4d8'; c.setLineDash([8,6]); c.beginPath(); c.moveTo(8,H/2); c.lineTo(W-8,H/2); c.stroke(); c.setLineDash([]);
      for(const hx of [8,40]){ c.fillStyle='#7a7e74'; c.beginPath(); c.arc(hx+12,14,12,Math.PI,0); c.fill(); c.fillRect(hx,14,24,4); }
      box(W-24,6,14,18,'#b9b2a0','#6a6455'); c.fillStyle='#4a6a8a'; c.fillRect(W-22,8,10,5);
      c.fillStyle=col; c.fillRect(W-24,H-12,12,6);
      break;
    case 'sam': {   // Flugabwehrraketen: Startgestell mit vier Röhren
      c.fillStyle='#8a8f7a'; c.beginPath(); c.arc(W/2,H/2,13,0,7); c.fill(); c.strokeStyle='#4f5345'; c.stroke();
      c.translate(W/2,H/2); c.rotate(tur); c.fillStyle='#4a4d42'; c.fillRect(-4,-7,14,14); c.fillStyle='#e8e4d8'; for(let i=0;i<2;i++)for(let j=0;j<2;j++) c.fillRect(-2+i*0,-6+j*7,12,2.5+0*i);
      c.fillStyle=col; c.beginPath(); c.arc(-5,0,3.5,0,7); c.fill();
      break; }
    case 'park':   // Park: Wege, Bäume, Brunnen
      c.strokeStyle='#c9b98a'; c.lineWidth=4; c.beginPath(); c.moveTo(2,H/2); c.lineTo(W-2,H/2); c.moveTo(W/2,2); c.lineTo(W/2,H-2); c.stroke(); c.lineWidth=1;
      for(const [tx2,ty2] of [[12,12],[W-12,12],[12,H-12],[W-12,H-12],[20,H/2-12],[W-20,H/2+12]]){ c.fillStyle='#2f5a24'; c.beginPath(); c.arc(tx2,ty2,6,0,7); c.fill(); c.fillStyle='#4a7a34'; c.beginPath(); c.arc(tx2-1.5,ty2-1.5,3.5,0,7); c.fill(); }
      c.fillStyle='#9ab'; c.beginPath(); c.arc(W/2,H/2,6,0,7); c.fill(); c.fillStyle='#6ab0ff'; c.beginPath(); c.arc(W/2,H/2,3.5+Math.sin(tt*3)*0.6,0,7); c.fill();
      break;
    case 'theater':   // Theater: Säulen, roter Vorhang, Kuppel
      box(4,6,W-8,H-10,'#c9b48a','#6e5e40'); c.fillStyle='#8a2a2a'; c.fillRect(10,H-20,W-20,12);
      c.fillStyle='#ece5cf'; for(let i=0;i<5;i++) c.fillRect(9+i*(W-22)/4,H-24,3,18);
      c.fillStyle='#7a8a9a'; c.beginPath(); c.arc(W/2,16,10,Math.PI,0); c.fill(); c.fillStyle=col; c.fillRect(W/2-2,2,4,6);
      break;
    case 'pool':   // Schwimmbad: Becken mit Bahnen, Liegewiese
      c.fillStyle='#6a9a4a'; c.fillRect(2,2,W-4,H-4); box(8,8,W-36,H-16,'#d8d4c8','#8a8678');
      c.fillStyle='#3a9ad8'; c.fillRect(11,11,W-42,H-22); c.strokeStyle='rgba(255,255,255,.6)'; for(let i=1;i<4;i++){ c.beginPath(); c.moveTo(11,11+i*(H-22)/4); c.lineTo(W-31,11+i*(H-22)/4); c.stroke(); }
      box(W-24,8,18,H-16,'#b9b2a0','#6a6455'); c.fillStyle=col; c.fillRect(W-20,12,10,5);
      break;
    case 'stadium': {   // Stadion: Ränge, Spielfeld, Flutlicht
      c.fillStyle='#8e8c80'; c.beginPath(); c.ellipse(W/2,H/2,W/2-3,H/2-3,0,0,7); c.fill(); c.strokeStyle='#5e5d55'; c.stroke();
      c.fillStyle='#a9a596'; c.beginPath(); c.ellipse(W/2,H/2,W/2-10,H/2-10,0,0,7); c.fill();
      c.fillStyle='#3f8a3a'; c.fillRect(W/2-22,H/2-14,44,28); c.strokeStyle='#e8e8e0'; c.strokeRect(W/2-21.5,H/2-13.5,43,27); c.beginPath(); c.moveTo(W/2,H/2-14); c.lineTo(W/2,H/2+14); c.stroke(); c.beginPath(); c.arc(W/2,H/2,5,0,7); c.stroke();
      for(const [lx,ly] of [[8,8],[W-8,8],[8,H-8],[W-8,H-8]]){ c.fillStyle='#ffe9a0'; c.beginPath(); c.arc(lx,ly,3,0,7); c.fill(); }
      c.fillStyle=col; c.fillRect(W/2-5,4,10,5);
      break; }
    case 'firest':   // Feuerwache: rotes Tor, Schlauchturm, Löschfahrzeug
      box(3,6,W-8,H-10,'#a84a3a','#5a2218'); c.fillStyle='#e8e0cf'; c.fillRect(7,H-18,W-26,12); c.fillStyle='#5a2218'; for(let i=1;i<3;i++) c.fillRect(7+i*(W-26)/3,H-18,1.5,12);
      box(W-14,2,10,22,'#c9c4b4','#6a6455'); c.fillStyle='#d83a2a'; c.fillRect(10,H-14,14,7); c.fillStyle='#ffd36a'; c.fillRect(21,H-14,3,3);
      c.fillStyle=col; c.fillRect(6,8,8,5);
      break;
    case 'derrick': {   // Bohrturm: Gittermast und nickende Pumpe
      box(3,3,W-6,H-6,'#7a7466','#4a463c');
      c.strokeStyle='#3a3630'; c.lineWidth=1.6; c.beginPath(); c.moveTo(8,H-6); c.lineTo(W/2-4,6); c.lineTo(W/2+2,H-6); c.moveTo(11,H-14); c.lineTo(W/2,H-14); c.moveTo(14,H-24); c.lineTo(W/2-2,H-24); c.stroke(); c.lineWidth=1;
      const nod=Math.sin(tt*2.5)*4; c.save(); c.translate(W-18,H/2+4); c.strokeStyle='#2b2b26'; c.lineWidth=3; c.beginPath(); c.moveTo(-10,nod); c.lineTo(10,-nod); c.stroke(); c.lineWidth=1; c.restore();
      c.fillStyle='#c49a3a'; c.fillRect(W-30,H/2+2+nod,5,7); c.fillStyle='#1a1410'; c.beginPath(); c.arc(W-12,H-10,4,0,7); c.fill();
      box(W-12,4,8,5,col,dark);
      break; }
    case 'droneshop':
      box(3,5,W-6,H-12,'#6d7258','#3f4229'); c.fillStyle='#4d523c'; c.beginPath(); c.arc(W/2,5,W/2-3,0,Math.PI); c.fill();
      c.save(); c.translate(W/2,H/2+2); c.strokeStyle='#222'; c.lineWidth=1.4; c.beginPath(); c.moveTo(-6,-6); c.lineTo(6,6); c.moveTo(6,-6); c.lineTo(-6,6); c.stroke();
      for(const [rx,ry] of [[-6,-6],[6,-6],[-6,6],[6,6]]){c.beginPath();c.arc(rx,ry,3,0,7);c.stroke();} c.restore();
      box(W-12,H-10,8,6,col,dark);
      break;
    case 'sentry':
      c.fillStyle='#8d8a7c'; c.beginPath(); c.arc(W/2,H/2,10,0,7); c.fill(); c.strokeStyle='#5b5850'; c.stroke();
      c.translate(W/2,H/2); c.rotate(tur); c.fillStyle='#232320'; c.fillRect(0,-1.2,12,2.4); c.fillStyle=col; c.strokeStyle=dark; c.beginPath(); c.arc(0,0,4,0,7); c.fill(); c.stroke();
      break;
    case 'flak':
      c.fillStyle='#8a8f7a'; c.beginPath(); c.arc(W/2,H/2,12,0,7); c.fill(); c.strokeStyle='#4f5345'; c.stroke();
      c.translate(W/2,H/2); c.rotate(tur); c.fillStyle='#232320'; c.fillRect(1,-3.5,13,2); c.fillRect(1,1.5,13,2);
      c.fillStyle=col; c.strokeStyle=dark; rr(c,-5,-5,9,10,2); c.fill(); c.stroke();
      break;
    case 'gbunker': {   // Grenzbunker: dicker Betonblock mit Schießscharten und Tarnnetz
      c.fillStyle='#5f5e57'; c.fillRect(2,2,W-4,H-4); box(5,5,W-10,H-10,'#8a887e','#4a4943');
      c.fillStyle='#6a7048'; for(let i=0;i<6;i++){ c.beginPath(); c.arc(8+i*(W-16)/5,8+(i%2)*4,4,0,7); c.fill(); }   // Tarnnetz
      c.fillStyle='#1d1d1a'; c.fillRect(W/2-10,H-9,20,3); c.fillRect(4,H/2-6,3,12); c.fillRect(W-7,H/2-6,3,12); c.fillRect(W/2-10,6,20,3);   // Schießscharten
      c.fillStyle=col; c.fillRect(W-14,H-14,8,6); c.strokeStyle=dark; c.strokeRect(W-13.5,H-13.5,7,5);
      c.translate(W/2,H/2); c.rotate(tur); c.fillStyle='#2a2a26'; c.fillRect(2,-2,15,4); c.fillStyle=col; c.strokeStyle=dark; c.beginPath(); c.arc(0,0,7,0,7); c.fill(); c.stroke();
      break; }
    case 'turret':
    case 'bunker':
      if(type==='turret'){ c.fillStyle='#a3926b'; c.beginPath(); c.arc(W/2,H/2,13,0,7); c.fill(); c.fillStyle='#7a6d4f'; c.beginPath(); c.arc(W/2,H/2,9,0,7); c.fill(); }
      else { box(4,4,W-8,H-8,'#7b7a72','#4c4b45'); box(8,8,W-16,H-16,'#6a6962'); c.fillStyle='#222'; c.fillRect(10,W/2-2,W-20,3); box(4,H-10,W-8,5,col); }
      c.translate(W/2,H/2); c.rotate(tur);
      c.fillStyle='#2a2a26'; c.fillRect(2,-1.6,type==='turret'?14:12,3.2);
      c.fillStyle=col; c.strokeStyle=dark; c.beginPath(); c.arc(0,0,type==='turret'?5.5:6,0,7); c.fill(); c.stroke();
      break;
  }
  c.restore();
}
// Graben / Stacheldraht: Linien von der Feldmitte zu gleichartigen Nachbarn (auch diagonal)
export function drawFeature(c,f,px,py,dirs,S,enemy?){
  if(f===FEAT.MINE){   // Panzermine: flache Scheibe mit Zünder
    const cx=px+S/2, cy=py+S/2; c.save();
    c.fillStyle='rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(cx+1,cy+1.5,S*0.24,S*0.17,0,0,7); c.fill();
    c.fillStyle=enemy?'#7a3a2a':'#4d5238'; c.strokeStyle='#22241a'; c.lineWidth=1; c.beginPath(); c.ellipse(cx,cy,S*0.24,S*0.17,0,0,7); c.fill(); c.stroke();
    c.fillStyle='#c8b040'; c.beginPath(); c.arc(cx,cy,S*0.06,0,7); c.fill();
    if(enemy){ c.strokeStyle='#ff5a3a'; c.lineWidth=1.5; c.beginPath(); c.arc(cx,cy,S*0.36,0,7); c.stroke(); }
    c.restore(); return; }
  const m=S/2, cx=px+m, cy=py+m;
  const segs=dirs.length?dirs:[[1,0],[-1,0]];
  const path=()=>{ c.beginPath(); for(const [dx,dy] of segs){ c.moveTo(cx,cy); c.lineTo(cx+dx*m,cy+dy*m); } };
  c.save(); c.lineCap='round';
  if(f===FEAT.TRENCH){
    path(); c.strokeStyle='#b39a68'; c.lineWidth=S*0.62; c.stroke();     // Sandsack-Rand
    path(); c.strokeStyle='#3f3020'; c.lineWidth=S*0.4; c.stroke();      // Grabensohle
    path(); c.strokeStyle='rgba(0,0,0,.25)'; c.lineWidth=S*0.14; c.stroke();
  } else if(f===FEAT.WIRE){
    for(const [dx,dy] of segs){ const L=m*Math.hypot(dx,dy), n=Math.max(2,Math.round(L/4)), ux=dx/Math.hypot(dx,dy), uy=dy/Math.hypot(dx,dy);
      c.strokeStyle='#26261f'; c.lineWidth=1.1; c.beginPath();
      for(let i=0;i<=n;i++){ const t=i/n*L, x=cx+ux*t, y=cy+uy*t; c.moveTo(x+3.2,y); c.arc(x,y,3.2,0,Math.PI*2); } c.stroke(); }
    c.fillStyle='#3a3a34'; c.fillRect(cx-1,cy-5,2,10);
  }
  c.restore();
}
/** Straße: Schotterband zu gleichartigen Nachbarn; geplante Straßen nur gestrichelt.
 *  pass 0 = Bankett, 1 = Schotter (erst alle Bankette, dann alle Decken – sonst entstehen Nähte); -1 = beides */
export function drawRoad(c,px,py,dirs,S,planned,pass=-1){
  const m=S/2, cx=px+m, cy=py+m;
  c.save(); c.lineCap='round';
  const path=()=>{ c.beginPath(); if(!dirs.length){ c.moveTo(cx-m*0.6,cy); c.lineTo(cx+m*0.6,cy); } for(const [dx,dy] of dirs){ c.moveTo(cx,cy); c.lineTo(cx+dx*m,cy+dy*m); } };
  if(planned){
    path(); c.strokeStyle='rgba(60,50,30,.35)'; c.lineWidth=S*0.5; c.stroke();                                   // abgesteckte Trasse
    c.lineCap='butt'; path(); c.strokeStyle='#f0d870'; c.lineWidth=S*0.08; c.setLineDash([S*0.16,S*0.12]); c.stroke(); c.setLineDash([]);
    c.fillStyle='#f0d870'; c.fillRect(cx-1.5,cy-1.5,3,3);                                                         // Pflock
  } else {
    if(pass!==1){ path(); c.strokeStyle='#5e5442'; c.lineWidth=S*0.62; c.stroke(); }     // Bankett
    if(pass!==0){ path(); c.strokeStyle='#9a8f78'; c.lineWidth=S*0.48; c.stroke();      // Schotter
      path(); c.strokeStyle='rgba(255,255,255,.10)'; c.lineWidth=S*0.06; c.stroke(); }
  }
  c.restore();
}
/** Baustelle: Fundament, das Gebäude wächst von unten nach oben, Gerüst darüber */
export function drawSite(c,b,col,dark){
  const px=b.tx*TILE, py=b.ty*TILE, W=b.w*TILE, H=b.h*TILE, k=b.progress||0;
  c.save();
  c.fillStyle='#6b5a3e'; c.fillRect(px+1,py+1,W-2,H-2);
  c.strokeStyle='#4a3d28'; c.lineWidth=1; c.setLineDash([4,3]); c.strokeRect(px+2.5,py+2.5,W-5,H-5); c.setLineDash([]);
  if(k>0.02){ c.save(); c.beginPath(); c.rect(px,py+H*(1-k),W,H*k+2); c.clip(); c.globalAlpha=0.85; drawBuildingShape(c,b.type,col,dark,px,py,b.w,b.h,b.tur); c.restore(); }
  // Gerüst
  c.strokeStyle='#c8a060'; c.lineWidth=1.2;
  for(let x=4;x<W-2;x+=10){ c.beginPath(); c.moveTo(px+x,py+3); c.lineTo(px+x,py+H-3); c.stroke(); }
  for(let y=6;y<H-2;y+=9){ c.beginPath(); c.moveTo(px+3,py+y); c.lineTo(px+W-3,py+y); c.stroke(); }
  c.strokeStyle='rgba(200,160,96,.6)'; c.beginPath(); c.moveTo(px+3,py+3); c.lineTo(px+W-3,py+H-3); c.stroke();
  // Material & Fortschritt
  c.fillStyle='#8b6238'; c.fillRect(px+W-12,py+H-8,9,5); c.fillStyle='#b8b2a2'; c.fillRect(px+4,py+H-8,7,5);
  c.fillStyle='#000a'; c.fillRect(px+3,py+H-4,W-6,3); c.fillStyle='#e8c84a'; c.fillRect(px+3,py+H-4,(W-6)*k,3);
  c.restore();
}
export function hpBar(c,x,y,w,f){c.fillStyle='#000b';c.fillRect(x-1,y-1,w+2,5);c.fillStyle=f>0.6?'#6fd05a':f>0.3?'#e3c23e':'#e0503a';c.fillRect(x,y,w*Math.max(0,f),3);}
