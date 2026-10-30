import { renderTerrain, repaintTile } from './terrain';
import { hash, idx, inMap } from '../core/util';
import { BUILDINGS, FACTIONS, MAP_H, MAP_W, TILE, isDefType } from '../data/config';
import { VH, VW, cam, dpr } from '../render/camera';
import { drawBuildingShape, drawFeature, drawRoad, drawSite, drawUnitShape, hpBar, rr } from '../render/draw';
import { siteWorkers } from '../sim/build';
import { canPlace, canPlaceDef, tileBuildable } from '../sim/production';
import { G } from '../sim/state';
import { fxAdd } from '../sim/units';
import { housingQuality, knownBuilding, tileVis, visibleUnit } from '../sim/world';
import { ctx, cv, mctx, mini } from '../ui/dom';
import { input } from '../ui/input';

export function render(){
  const c=ctx; c.setTransform(1,0,0,1,0,0); c.fillStyle='#14170f'; c.fillRect(0,0,cv.width,cv.height);
  if(!G) return;
  if(!G.terrCanvas){ renderTerrain(); G.terrChanged.length=0; }   // Gelände wird einmal pro Karte vorgezeichnet
  while(G.terrChanged.length) repaintTile(G.terrChanged.pop());
  const z=cam.zoom*dpr; c.setTransform(z,0,0,z,-cam.x*z,-cam.y*z);
  c.drawImage(G.terrCanvas,0,0);
  const vx0=cam.x/TILE, vy0=cam.y/TILE, vx1=vx0+VW/cam.zoom/TILE, vy1=vy0+VH/cam.zoom/TILE;
  const tx0=Math.max(0,Math.floor(vx0)), ty0=Math.max(0,Math.floor(vy0)), tx1=Math.min(MAP_W-1,Math.ceil(vx1)), ty1=Math.min(MAP_H-1,Math.ceil(vy1));
  const vis=(x,y,m=2)=>x>vx0-m&&x<vx1+m&&y>vy0-m&&y<vy1+m;
  for(const s of G.scorch){ if(!vis(s.x,s.y)) continue; const a=Math.max(0,1-(G.t-s.t)/90)*0.45; if(a<=0) continue;
    c.fillStyle=`rgba(25,20,12,${a})`; c.beginPath(); c.arc(s.x*TILE,s.y*TILE,s.r*TILE,0,7); c.fill(); }
  // Straßen (fertig = Schotter, geplant = gestrichelt)
  for(const pass of [0,1,2]) for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++){ const r=G.road[idx(x,y)]; if(!r||(pass===2)!==(r===1)) continue;
    const on=(xx,yy)=>inMap(xx,yy)&&(r===2?G.road[idx(xx,yy)]===2:G.road[idx(xx,yy)]>0), dirs=[];
    for(const d of [[1,0],[-1,0],[0,1],[0,-1]]) if(on(x+d[0],y+d[1])) dirs.push(d);
    for(const d of [[1,1],[1,-1],[-1,1],[-1,-1]]) if(on(x+d[0],y+d[1])&&!on(x+d[0],y)&&!on(x,y+d[1])) dirs.push(d);
    drawRoad(c,x*TILE,y*TILE,dirs,TILE,r===1,pass); }
  if(G.placing&&isDefType(G.placing)){ c.fillStyle='rgba(120,240,120,.2)';
    for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++) if(canPlaceDef(0,G.placing,x,y)) c.fillRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2);
    if(G.hover){ const x=Math.floor(G.hover.x),y=Math.floor(G.hover.y); c.strokeStyle=canPlaceDef(0,G.placing,x,y)?'#9ff07a':'#ff6a5a'; c.lineWidth=2; c.strokeRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2); } }
  else if(G.placing){ const pd=BUILDINGS[G.placing];
    for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++) if(tileBuildable(0,x,y)){
      if(pd.cap){ const q=housingQuality(0,x,y,1,1).q; c.fillStyle=q>=0.9?'rgba(120,240,120,.26)':q>=0.6?'rgba(240,220,90,.28)':'rgba(240,130,70,.32)'; }
      else c.fillStyle='rgba(120,240,120,.24)';
      c.fillRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2); }
    const need=pd.needsOre?G.ore:pd.needsRock?G.rock:pd.needsForest?G.wood:null;
    if(need){ c.strokeStyle='rgba(255,230,120,.9)'; c.lineWidth=2;
      for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++) if(need[idx(x,y)]>0) c.strokeRect(x*TILE+2,y*TILE+2,TILE-4,TILE-4); } }
  // Gräben & Stacheldraht
  for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++){ const f=G.feat[idx(x,y)]; if(!f) continue;
    const dirs=[]; for(const d of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){ const xx=x+d[0],yy=y+d[1]; if(inMap(xx,yy)&&G.feat[idx(xx,yy)]===f) dirs.push(d); }
    drawFeature(c,f,x*TILE,y*TILE,dirs,TILE); }
  // Öl & Erz
  for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++){
    const i=idx(x,y), o=G.oil[i], h=hash(x,y), px=x*TILE, py=y*TILE;
    if(o>0){
      const a=0.3+0.55*Math.min(1,o/600), k=Math.min(1,0.55+o/1200);
      c.fillStyle=`rgba(32,24,16,${a})`; rr(c,px+16-15*k,py+16-15*k,30*k,30*k,9*k); c.fill();
      c.fillStyle=`rgba(12,10,8,${a})`; c.beginPath(); c.ellipse(px+16+(h-0.5)*8,py+16+(hash(y,x)-0.5)*8,8*k,5.5*k,h*3,0,7); c.fill();
      c.fillStyle=`rgba(120,110,150,${a*0.3})`; c.beginPath(); c.ellipse(px+13+(h-0.5)*8,py+14,3,1.4,0.4,0,7); c.fill();
      if(h<0.16){
        c.fillStyle='#5a5148'; c.fillRect(px+8,py+23,17,3);
        c.strokeStyle='#3a332c'; c.lineWidth=2; c.beginPath(); c.moveTo(px+12,py+24); c.lineTo(px+16,py+13); c.lineTo(px+20,py+24); c.stroke();
        const bob=Math.sin(G.t*2+h*40)*3; c.strokeStyle='#c49a3a'; c.lineWidth=2.5; c.beginPath(); c.moveTo(px+6,py+13+bob); c.lineTo(px+27,py+13-bob); c.stroke();
        c.fillStyle='#c49a3a'; c.fillRect(px+4,py+11+bob,4,6); }
    }
    const st=G.rock[i];
    if(st>0){   // Felsen (Stein): helle, runde Brocken
      const k=0.6+0.4*Math.min(1,st/1200);
      for(let j=0;j<4;j++){ const hx=hash(x*3+j,y*5), hy=hash(y*11+j,x*7), s=(5+hash(x*j+1,y)*5)*k, cx=px+5+hx*22, cy=py+5+hy*22;
        c.fillStyle='rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(cx+2,cy+2,s,s*0.8,hx*3,0,7); c.fill();
        c.fillStyle=j%2?'#c9bea3':'#b5aa8f'; c.beginPath(); c.ellipse(cx,cy,s,s*0.8,hx*3,0,7); c.fill();
        c.fillStyle='rgba(255,255,255,.22)'; c.beginPath(); c.ellipse(cx-s*0.3,cy-s*0.3,s*0.4,s*0.25,0,0,7); c.fill(); }
    }
    const r=G.ore[i];
    if(r>0){
      const k=0.55+0.45*Math.min(1,r/900);
      for(let j=0;j<3;j++){ const hx=hash(x*5+j,y*3), hy=hash(y*7+j,x*2), s=(6+hash(x+j,y*j)*5)*k;
        const cx=px+6+hx*20, cy=py+6+hy*20;
        c.fillStyle='rgba(0,0,0,.3)'; c.beginPath(); c.moveTo(cx-s+2,cy+2); c.lineTo(cx+2,cy-s+2); c.lineTo(cx+s+2,cy+2); c.lineTo(cx+2,cy+s*0.7+2); c.closePath(); c.fill();
        c.fillStyle=j%2?'#8f8d86':'#a3a199'; c.beginPath(); c.moveTo(cx-s,cy); c.lineTo(cx,cy-s); c.lineTo(cx+s,cy); c.lineTo(cx,cy+s*0.7); c.closePath(); c.fill();
        c.fillStyle='#c8d4e0'; c.fillRect(cx-1,cy-s*0.4,2.5,2); c.fillStyle='#b98a52'; c.fillRect(cx+s*0.3,cy-1,2,2); }
    }
  }
  for(const b of G.buildings){ if(b.dead||!vis(b.x,b.y,4)||!knownBuilding(b)) continue; const f=G.players[b.owner];
    const k=Math.min(1,(G.t-b.born)/0.4);
    c.save(); if(k<1){c.translate(b.x*TILE,b.y*TILE);c.scale(0.6+0.4*k,0.6+0.4*k);c.translate(-b.x*TILE,-b.y*TILE);c.globalAlpha=0.5+0.5*k;}
    if(b.readyT&&G.t<b.readyT) c.globalAlpha=0.55;
    if(b.site) drawSite(c,b,f.col,f.dark); else drawBuildingShape(c,b.type,f.col,f.dark,b.tx*TILE,b.ty*TILE,b.w,b.h,b.tur,b.empty); c.restore();
    if(b.type==='wall'){ c.fillStyle='#7d7b73'; for(const [dx,dy] of [[1,0],[0,1]]){ const xx=b.tx+dx,yy=b.ty+dy; if(!inMap(xx,yy)) continue; const o=G.occ[idx(xx,yy)]; if(!o) continue; const nb=G.buildings.find(q=>q.id===o); if(nb&&nb.type==='wall'&&nb.owner===b.owner) c.fillRect(b.tx*TILE+(dx?TILE-4:6),b.ty*TILE+(dy?TILE-4:6),dx?8:TILE-12,dy?8:TILE-12); } }
    if(b.readyT&&G.t<b.readyT){ const k2=1-(b.readyT-G.t)/b.def.time; c.strokeStyle='#d8c040'; c.lineWidth=1; c.setLineDash([3,3]); c.strokeRect(b.tx*TILE+1,b.ty*TILE+1,TILE-2,TILE-2); c.setLineDash([]);
      c.fillStyle='#000a'; c.fillRect(b.tx*TILE+2,b.ty*TILE+TILE-5,TILE-4,3); c.fillStyle='#d8c040'; c.fillRect(b.tx*TILE+2,b.ty*TILE+TILE-5,(TILE-4)*k2,3); }
    if(b.hp<b.maxHp*0.5&&Math.random()<0.08) fxAdd({k:'smoke',x:b.x+(Math.random()-.5)*b.w*0.6,y:b.y+(Math.random()-.5)*b.h*0.6,r:0.3,life:1.4});
  }
  for(const u of G.units){ if(u.dead||!vis(u.x,u.y)||!visibleUnit(u)) continue; const f=G.players[u.owner];
    drawUnitShape(c,u.type,f.col,f.dark,u.x*TILE,u.y*TILE,u.angle,u.tur,u.working?-1:u.hp/u.maxHp);
    if(u.def.harvester&&u.cargo>0){c.fillStyle='#1a1410';c.fillRect(u.x*TILE-6,u.y*TILE+9,12,3);c.fillStyle='#e8c84a';c.fillRect(u.x*TILE-6,u.y*TILE+9,12*u.cargo/u.def.harvester.cap,3);}
  }
  for(const p of G.projectiles){ if(tileVis(p.x,p.y)<2) continue; c.save(); c.translate(p.x*TILE,p.y*TILE); c.rotate(p.a||0);
    if(p.delay>0){c.restore();continue;}
    if(p.type==='shell'){c.fillStyle='#ffe08a';c.fillRect(-4,-1.2,8,2.4);}
    else if(p.type==='rocket'){c.fillStyle='#e8e2d0';c.fillRect(-5,-1.2,8,2.4);c.fillStyle='#ff9a30';c.fillRect(-8,-1.2,3,2.4);} else {c.fillStyle='#ddd';c.fillRect(-4,-1,7,2);c.fillStyle='#ffb040';c.fillRect(-6,-1,2,2);}
    c.restore(); }
  for(const e of G.fx){ if(e.age<0) continue; if(G.fog&&tileVis(e.x??e.x1,e.y??e.y1)<2) continue; const k=e.age/e.life;
    if(e.k==='tracer'){c.strokeStyle=e.col;c.globalAlpha=1-k;c.lineWidth=1.3;c.beginPath();c.moveTo(e.x1*TILE,e.y1*TILE);c.lineTo(e.x2*TILE,e.y2*TILE);c.stroke();c.globalAlpha=1;}
    else if(e.k==='flash'){c.fillStyle=`rgba(255,230,140,${1-k})`;c.beginPath();c.arc(e.x*TILE,e.y*TILE,e.r,0,7);c.fill();}
    else if(e.k==='boom'){const r=e.r*TILE*(0.4+k);c.fillStyle=`rgba(255,${Math.floor(200-150*k)},60,${(1-k)*0.9})`;c.beginPath();c.arc(e.x*TILE,e.y*TILE,r,0,7);c.fill();
      c.fillStyle=`rgba(70,65,60,${(1-k)*0.6})`;c.beginPath();c.arc(e.x*TILE,e.y*TILE-k*6,r*0.8,0,7);c.fill();}
    else if(e.k==='smoke'){c.fillStyle=e.col?`rgba(30,28,25,${(1-k)*0.5})`:`rgba(110,108,100,${(1-k)*0.45})`;c.beginPath();c.arc(e.x*TILE+k*4,e.y*TILE-k*14,e.r*TILE*(0.6+k),0,7);c.fill();}
    else if(e.k==='marker'){c.strokeStyle=e.col;c.globalAlpha=1-k;c.lineWidth=2;c.beginPath();c.arc(e.x*TILE,e.y*TILE,12*(1-k)+3,0,7);c.stroke();c.globalAlpha=1;}
    else if(e.k==='loot'){c.globalAlpha=Math.min(1,(1-k)*2);c.font='bold 13px sans-serif';const tw=c.measureText(e.txt).width;c.fillStyle='#000c';c.fillRect(e.x*TILE-tw/2-4,e.y*TILE-30-k*20,tw+8,17);c.fillStyle=e.col;c.fillText(e.txt,e.x*TILE-tw/2,e.y*TILE-17-k*20);c.globalAlpha=1;}
  }
  if(G.fog){ for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++){ const v=G.vis[idx(x,y)]; if(v===2) continue;
      c.fillStyle=v===0?'rgba(7,9,5,.96)':'rgba(7,9,5,.5)'; c.fillRect(x*TILE-0.5,y*TILE-0.5,TILE+1,TILE+1); } }
  const selSet=new Set(G.sel);
  for(const u of G.units){ if(u.dead||!vis(u.x,u.y)||!visibleUnit(u)) continue; const s=selSet.has(u);
    const R=u.def.size*TILE*0.8;
    if(s){c.strokeStyle=u.owner===0?'#9ff07a':'#ffd36a';c.lineWidth=1.5;c.beginPath();c.arc(u.x*TILE,u.y*TILE,R+3,0,7);c.stroke();}
    if(s||u.hp<u.maxHp) hpBar(c,u.x*TILE-R,u.y*TILE-R-7,R*2,u.hp/u.maxHp);
  }
  for(const b of G.buildings){ if(b.dead||!vis(b.x,b.y,4)||!knownBuilding(b)) continue; const s=selSet.has(b);
    if(s){c.strokeStyle=b.owner===0?'#9ff07a':'#ffd36a';c.lineWidth=2;c.strokeRect(b.tx*TILE-1,b.ty*TILE-1,b.w*TILE+2,b.h*TILE+2);}
    if(s||b.hp<b.maxHp) hpBar(c,b.tx*TILE+3,b.ty*TILE-6,b.w*TILE-6,b.hp/b.maxHp);
    if(b.type==='house'&&b.quality!==undefined){
      if(b.quality<0.95){ c.fillStyle=`rgba(80,78,70,${(1-b.quality)*0.55})`; c.fillRect(b.tx*TILE+1,b.ty*TILE+1,b.w*TILE-2,b.h*TILE-2); }
      if(b.owner===0){ const w=b.w*TILE-8; c.fillStyle='#000a'; c.fillRect(b.tx*TILE+4,b.ty*TILE+b.h*TILE-6,w,4); c.fillStyle='#7fb3ff'; c.fillRect(b.tx*TILE+4,b.ty*TILE+b.h*TILE-6,w*(b.resid||0)/b.def.cap,4); }
    }
    if(b.site&&b.owner===0&&!siteWorkers(b)&&(G.t*2|0)%2){ c.font='bold 10px sans-serif'; const t='wartet auf Arbeiter'; const tw=c.measureText(t).width; c.fillStyle='#000b'; c.fillRect(b.x*TILE-tw/2-3,b.ty*TILE-17,tw+6,13); c.fillStyle='#e8c84a'; c.fillText(t,b.x*TILE-tw/2,b.ty*TILE-7); }
    if(b.owner===2||(s&&b.owner!==0)||(b.empty&&b.owner===0&&!b.site)){c.fillStyle='#000a';c.font='bold 10px sans-serif';const t=b.empty?'erschöpft':b.def.name;const tw=c.measureText(t).width;c.fillRect(b.x*TILE-tw/2-3,b.ty*TILE+b.h*TILE+2,tw+6,13);c.fillStyle=G.players[b.owner].col;c.fillText(t,b.x*TILE-tw/2,b.ty*TILE+b.h*TILE+12);}
  }
  if(G.placing&&G.hover&&!isDefType(G.placing)){ const d=BUILDINGS[G.placing], tx=Math.floor(G.hover.x)-Math.floor((d.w-1)/2), ty=Math.floor(G.hover.y)-Math.floor((d.h-1)/2);
    const ok=canPlace(0,G.placing,tx,ty); c.globalAlpha=0.6; drawBuildingShape(c,G.placing,FACTIONS[0].col,FACTIONS[0].dark,tx*TILE,ty*TILE,d.w,d.h,0); c.globalAlpha=1;
    if(d.cap&&ok){ const q=housingQuality(0,tx,ty,d.w,d.h).q, t='Wohnqualität '+Math.round(q*100)+' %'; c.font='bold 11px sans-serif'; const tw=c.measureText(t).width;
      c.fillStyle='#000c'; c.fillRect(tx*TILE+d.w*TILE/2-tw/2-4,ty*TILE-18,tw+8,15); c.fillStyle=q>=0.9?'#9fd88a':q>=0.6?'#e8d27a':'#ff9a6a'; c.fillText(t,tx*TILE+d.w*TILE/2-tw/2,ty*TILE-7); }
    c.fillStyle=ok?'rgba(80,255,80,.25)':'rgba(255,60,60,.35)'; c.fillRect(tx*TILE,ty*TILE,d.w*TILE,d.h*TILE); }
  c.setTransform(dpr,0,0,dpr,0,0);
  if(input.box){const b=input.box;c.strokeStyle='#9ff07a';c.lineWidth=1.5;c.setLineDash([5,4]);c.strokeRect(Math.min(b.x0,b.x1),Math.min(b.y0,b.y1),Math.abs(b.x1-b.x0),Math.abs(b.y1-b.y0));c.setLineDash([]);c.fillStyle='rgba(159,240,122,.08)';c.fillRect(Math.min(b.x0,b.x1),Math.min(b.y0,b.y1),Math.abs(b.x1-b.x0),Math.abs(b.y1-b.y0));}
}
export function renderMini(){
  if(!G) return; const s=mini.width/MAP_W;
  mctx.imageSmoothingEnabled=false; mctx.drawImage(G.miniBg,0,0,mini.width,mini.height);
  for(let i=0;i<G.oil.length;i++){ const col=G.oil[i]>0?'#1a140e':G.ore[i]>0?'#c8c6be':G.rock[i]>0?'#d8c9a0':G.road[i]===2?'#a89c80':null;
    if(col){mctx.fillStyle=col;mctx.fillRect((i%MAP_W)*s,((i/MAP_W)|0)*s,s,s);} }
  if(G.fog) for(let i=0;i<G.vis.length;i++){ const v=G.vis[i]; if(v===2) continue; mctx.fillStyle=v===0?'#070905':'rgba(7,9,5,.55)'; mctx.fillRect((i%MAP_W)*s,((i/MAP_W)|0)*s,s+0.5,s+0.5); }
  for(const b of G.buildings){ if(b.dead||!knownBuilding(b)) continue; mctx.fillStyle=G.players[b.owner].col; mctx.fillRect(b.tx*s,b.ty*s,b.w*s,b.h*s); }
  for(const u of G.units){ if(u.dead||!visibleUnit(u)) continue; mctx.fillStyle=G.players[u.owner].col; mctx.fillRect(u.x*s-1.5,u.y*s-1.5,3,3); }
  mctx.strokeStyle='#fff'; mctx.lineWidth=1; mctx.strokeRect(cam.x/TILE*s,cam.y/TILE*s,VW/cam.zoom/TILE*s,VH/cam.zoom/TILE*s);
}
