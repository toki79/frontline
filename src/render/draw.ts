import { FEAT, TILE } from '../data/config';
import { G } from '../sim/state';

export function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
/* =====================================================================
   Zeichnen
   ===================================================================== */
export function drawUnitShape(c,type,col,dark,x,y,ang,tur,hpf){
  c.save(); c.translate(x,y);
  if(type==='inf'||type==='at'||type==='militia'){
    const n=Math.max(1,Math.ceil(hpf*3-0.01)), offs=[[4,0],[-3,-5],[-3,5]];
    c.rotate(ang);
    for(let i=0;i<n;i++){const [ox,oy]=offs[i];
      c.fillStyle='rgba(0,0,0,.28)'; c.beginPath(); c.arc(ox+1.5,oy+1.5,3.5,0,7); c.fill();
      const tube=type==='at'&&i===0;
      c.strokeStyle='#1d1d1a'; c.lineWidth=tube?2.8:1.3; c.beginPath(); c.moveTo(ox-(tube?4:0),oy+1.6); c.lineTo(ox+(tube?8:7),oy+1.6); c.stroke();
      c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=1.2; c.beginPath(); c.arc(ox,oy,3.5,0,7); c.fill(); c.stroke();
      c.fillStyle=type==='militia'?'#5a4a2c':'#3c4a2c'; c.beginPath(); c.arc(ox,oy,1.9,0,7); c.fill();
    }
  } else if(type==='worker'){
    // Bauarbeiter: gelber Helm, beim Arbeiten schwingt der Hammer (hpf<0 = arbeitet)
    const work=hpf<0, t=G?G.t:0;
    c.rotate(ang);
    c.fillStyle='rgba(0,0,0,.28)'; c.beginPath(); c.arc(1.5,1.5,3.4,0,7); c.fill();
    if(work){ const sw=Math.sin(t*14+x)*0.9; c.save(); c.rotate(sw); c.strokeStyle='#6b4a2a'; c.lineWidth=1.4; c.beginPath(); c.moveTo(0,1); c.lineTo(7,1); c.stroke();
      c.fillStyle='#5a5a55'; c.fillRect(6,-1,2.5,4); c.restore(); }
    else { c.strokeStyle='#6b4a2a'; c.lineWidth=1.2; c.beginPath(); c.moveTo(-1,3); c.lineTo(5,4); c.stroke(); }
    c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=1; c.beginPath(); c.arc(0,0,3.8,0,7); c.fill(); c.stroke();
    c.fillStyle='#f2c230'; c.strokeStyle='#8a6a10'; c.beginPath(); c.arc(0,0,2.5,0,7); c.fill(); c.stroke();
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
  } else if(type==='mlrs'){
    c.rotate(ang);
    c.fillStyle='rgba(0,0,0,.3)'; rr(c,-10,-5,23,12,2); c.fill();
    c.fillStyle='#2b2b26'; for(const wx of [-9,-3,5]){c.fillRect(wx,-7,4,2.2);c.fillRect(wx,4.8,4,2.2);}
    c.fillStyle=col; c.strokeStyle=dark; c.lineWidth=1; rr(c,-11,-5.5,22,11,2); c.fill(); c.stroke();
    c.fillStyle='#bcd6e6'; c.fillRect(8,-3.5,1.5,7);
    c.rotate(tur-ang); c.fillStyle='#4a4d42'; c.strokeStyle='#22231f'; c.fillRect(-9,-5,13,10); c.strokeRect(-9,-5,13,10);
    c.fillStyle='#1d1d1a'; for(let i=0;i<3;i++)for(let j=0;j<2;j++) c.beginPath(), c.arc(-6+i*4,-2.5+j*5,1.3,0,7), c.fill();
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
export function drawBuildingShape(c,type,col,dark,px,py,w,h,tur,extra?){
  const W=w*TILE,H=h*TILE, tt=G?G.t:0;
  c.save(); c.translate(px,py);
  c.fillStyle='rgba(0,0,0,.32)'; c.fillRect(4,4,W,H);
  c.fillStyle=type==='farm'?'#7a6842':type==='house'?'#7f8a5a':'#8e8c80'; c.fillRect(1,1,W-2,H-2);
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
      break;
    case 'farm':
      for(let i=0;i<7;i++){ c.fillStyle=i%2?'#a69b4c':'#8f8a3c'; c.fillRect(4+i*((W-40)/7),4,(W-40)/7-1,H-8); }
      roof(W-32,6,26,22); box(W-32,H-22,26,16,'#9a8a70','#5e5440');
      c.fillStyle='#d8c06a'; c.beginPath(); c.arc(W-19,H-14,5,0,7); c.fill();
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
export function drawFeature(c,f,px,py,dirs,S){
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
