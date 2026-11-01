import { renderTerrain, repaintTile } from './terrain';
import { dist, hash, idx, inMap } from '../core/util';
import { capOf, BANDITS, BUILDINGS, FACTIONS, FEAT, FOREST, JAM, MAP_H, MAP_W, NUKE, T, TILE, isDefType } from '../data/config';
import { VH, VW, cam, dpr } from '../render/camera';
import { drawBuildingShape, drawFeature, drawRoad, drawSite, drawUnitShape, hpBar, rr } from '../render/draw';
import { haulEff, hauls, previewFields, routeRoadBetween, siteLacks, siteWorkers } from '../sim/build';
import { tradeRoutes } from '../sim/trade';
import { accessPoints } from '../sim/fortify';
import { DENSITY } from '../data/config';
import { canPlace, canPlaceDef, tileBuildable } from '../sim/production';
import { G } from '../sim/state';
import { fpvRange, fxAdd, rangeOf } from '../sim/units';
import { housingQuality, knownBuilding, tileVis, visibleUnit } from '../sim/world';
import { ctx, cv, mctx, mini } from '../ui/dom';
import { input } from '../ui/input';

/** Wirkkreise: Reichweite, Sicht, Radar, Störfeld, Löschbereich, Pflanzbereich, Äcker – mit Beschriftung */
function drawRanges(c,sel){
  const seen=new Set<string>();
  const ring=(x,y,r,col,dash,label,fill?)=>{ const key=`${Math.round(x*2)},${Math.round(y*2)},${r},${label}`; if(seen.has(key)||r<=0) return; seen.add(key);
    c.save(); if(fill){ c.fillStyle=fill; c.beginPath(); c.arc(x*TILE,y*TILE,r*TILE,0,7); c.fill(); }
    c.strokeStyle=col; c.lineWidth=2; c.setLineDash(dash?[7,6]:[]); c.beginPath(); c.arc(x*TILE,y*TILE,r*TILE,0,7); c.stroke(); c.setLineDash([]);
    if(label){ c.font='bold 11px sans-serif'; c.textAlign='center'; const tw=c.measureText(label).width; const ly=y*TILE-r*TILE;
      c.fillStyle='#000b'; c.fillRect(x*TILE-tw/2-3,ly-8,tw+6,14); c.fillStyle=col; c.fillText(label,x*TILE,ly+3); }
    c.restore(); };
  const one=sel.length===1;
  for(const e of sel){ const d=e.def, w=d.weapon;
    if(w){ const r=rangeOf(e); ring(e.x,e.y,r,'rgba(255,110,90,.85)',false,one?`Reichweite ${Math.round(r*10)/10}`:'','rgba(255,110,90,.06)');
      if(w.minRange) ring(e.x,e.y,w.minRange,'rgba(255,170,90,.7)',true,one?`Mindestabstand ${w.minRange}`:''); }
    if(one&&d.sight) ring(e.x,e.y,(d.sight||4)+(e.kind==='building'?Math.max(e.w,e.h)/2:0),'rgba(235,235,220,.35)',true,'Sicht');
    if(d.radar) ring(e.x,e.y,d.radar,'rgba(127,176,234,.85)',true,one?`Radar ${d.radar}`:'');
    if(d.jam) ring(e.x,e.y,JAM.radius,'rgba(140,200,255,.8)',true,one?`Störfeld ${JAM.radius}`:'');
    if(d.fireR){ const r=d.fireR*(1+0.25*((e.lvl||1)-1)); ring(e.x,e.y,r,'rgba(255,140,60,.85)',false,`Löschbereich ${Math.round(r)}`,'rgba(255,140,60,.05)'); }
    if(d.forester) ring(e.x,e.y,FOREST.radius+e.w/2,'rgba(120,220,100,.85)',false,`Pflanzbereich ${FOREST.radius}`,'rgba(120,220,100,.06)');
    if(e.type==='camp') ring(e.x,e.y,BANDITS.territory,'rgba(255,90,74,.8)',true,'Räubergebiet');
    if(e.type==='farm'){ const R=DENSITY.farmFieldR; c.save(); c.strokeStyle='rgba(232,200,74,.8)'; c.lineWidth=2; c.setLineDash([6,5]); c.strokeRect((e.tx-R)*TILE,(e.ty-R)*TILE,(e.w+2*R)*TILE,(e.h+2*R)*TILE); c.setLineDash([]); c.restore(); }
    if(d.weapon&&d.weapon.kamikaze&&e.owner===0&&one){ const R=fpvRange(0); let best=null,bd=1e9; for(const b of G.buildings) if(!b.dead&&!b.site&&b.owner===0){ const dd=Math.hypot(b.x-e.x,b.y-e.y); if(dd<bd){bd=dd;best=b;} }
      if(best) ring(best.x,best.y,R,'rgba(170,140,255,.7)',true,`Funkreichweite ${R}`); }
  }
}
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
  // Äcker der Bauernhöfe
  if(G.field) for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++){ if(!G.field[idx(x,y)]) continue; const px=x*TILE, py=y*TILE, h=hash(x,y);
    c.fillStyle=h<0.5?'rgba(150,140,70,.55)':'rgba(120,130,60,.5)'; c.fillRect(px+1,py+1,TILE-2,TILE-2);
    c.fillStyle=h<0.5?'rgba(190,170,90,.6)':'rgba(150,165,80,.55)'; for(let k=3;k<TILE-2;k+=6) c.fillRect(px+2,py+k,TILE-4,2.5); }
  // Straßen (fertig = Schotter, geplant = gestrichelt)
  for(const pass of [0,1,2]) for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++){ const r=G.road[idx(x,y)]; if(!r||(pass===2)!==(r===1)) continue;
    const on=(xx,yy)=>inMap(xx,yy)&&(r===2?G.road[idx(xx,yy)]===2:G.road[idx(xx,yy)]>0), dirs=[];
    for(const d of [[1,0],[-1,0],[0,1],[0,-1]]) if(on(x+d[0],y+d[1])) dirs.push(d);
    for(const d of [[1,1],[1,-1],[-1,1],[-1,-1]]) if(on(x+d[0],y+d[1])&&!on(x+d[0],y)&&!on(x,y+d[1])) dirs.push(d);
    drawRoad(c,x*TILE,y*TILE,dirs,TILE,r===1,pass); }
  // Handelsrouten der eigenen Verträge
  for(const r of tradeRoutes()){ if(r.c.a!==0||!knownBuilding(r.b)) continue;
    c.strokeStyle='rgba(232,200,90,.45)'; c.lineWidth=2; c.setLineDash([10,8]); c.lineDashOffset=-G.t*12; c.beginPath(); c.moveTo(r.a.x*TILE,r.a.y*TILE); c.lineTo(r.b.x*TILE,r.b.y*TILE); c.stroke(); c.setLineDash([]); c.lineDashOffset=0; }
  if(G.placing&&isDefType(G.placing)){ c.fillStyle='rgba(120,240,120,.2)';
    for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++) if(canPlaceDef(0,G.placing,x,y)) c.fillRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2);
    if(G.hover){ const x=Math.floor(G.hover.x),y=Math.floor(G.hover.y), pd=BUILDINGS[G.placing], w=pd?pd.w:1, h=pd?pd.h:1; c.strokeStyle=canPlaceDef(0,G.placing,x,y)?'#9ff07a':'#ff6a5a'; c.lineWidth=2; c.strokeRect(x*TILE+1,y*TILE+1,w*TILE-2,h*TILE-2); }
    for(const a of accessPoints(0)){ const R=TILE*1.3, pul=0.6+0.4*Math.sin(G.t*4);   // Zugänge zur Stadt
      c.strokeStyle=`rgba(255,120,80,${pul})`; c.lineWidth=3; c.beginPath(); c.arc(a.x*TILE,a.y*TILE,R,0,7); c.stroke();
      c.font='bold 11px sans-serif'; c.textAlign='center'; const t='⚠ Zugang'; const tw=c.measureText(t).width; c.fillStyle='#000b'; c.fillRect(a.x*TILE-tw/2-3,a.y*TILE-R-16,tw+6,14); c.fillStyle='#ffb38a'; c.fillText(t,a.x*TILE,a.y*TILE-R-5); c.textAlign='left'; } }
  else if(G.placing){ const pd=BUILDINGS[G.placing];
    for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++) if(tileBuildable(0,x,y)){
      if(pd.cap){ const q=housingQuality(0,x,y,1,1).q; c.fillStyle=q>=0.9?'rgba(120,240,120,.26)':q>=0.6?'rgba(240,220,90,.28)':'rgba(240,130,70,.32)'; }
      else c.fillStyle='rgba(120,240,120,.24)';
      if(G.terr[idx(x,y)]===T.FOREST) c.fillStyle='rgba(220,200,90,.3)';   // Wald: wird beim Bauen gerodet
      c.fillRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2); }
    const need=pd.needsOre?G.ore:pd.needsRock?G.rock:pd.needsForest?G.wood:null;
    if(need){ c.strokeStyle='rgba(255,230,120,.9)'; c.lineWidth=2;
      for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++) if(need[idx(x,y)]>0) c.strokeRect(x*TILE+2,y*TILE+2,TILE-4,TILE-4); } }
  // Gräben & Stacheldraht
  for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++){ const i=idx(x,y), f=G.feat[i], pl=G.fplan[i]&&G.fplanOwner[i]===1?G.fplan[i]:0; if(!f&&!pl) continue;
    if(f===FEAT.MINE){ if(G.featOwner[i]===1||G.mineSeen[i]||!G.fog) drawFeature(c,f,x*TILE,y*TILE,[],TILE,G.featOwner[i]!==1); continue; }   // feindliche Minen nur, wenn entdeckt
    const k=f||pl, dirs=[]; for(const d of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){ const xx=x+d[0],yy=y+d[1]; if(inMap(xx,yy)&&(G.feat[idx(xx,yy)]===k||(G.fplan[idx(xx,yy)]===k&&G.fplanOwner[idx(xx,yy)]===1))) dirs.push(d); }
    if(f) drawFeature(c,f,x*TILE,y*TILE,dirs,TILE);
    else { c.globalAlpha=0.35; drawFeature(c,pl,x*TILE,y*TILE,pl===FEAT.MINE?[]:dirs,TILE); c.globalAlpha=1; c.strokeStyle='rgba(232,210,122,.8)'; c.lineWidth=1; c.setLineDash([3,3]); c.strokeRect(x*TILE+3,y*TILE+3,TILE-6,TILE-6); c.setLineDash([]); } }
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
  if(G.saplings) for(const i of G.saplings){ const x=i%MAP_W, y=(i/MAP_W)|0; if(x<tx0||x>tx1||y<ty0||y>ty1||tileVis(x+0.5,y+0.5)===0) continue;   // Setzlinge
    const g=1-Math.max(0,G.sapling[i])/FOREST.grow, s=3+g*8, px=x*TILE+16, py=y*TILE+18;
    c.fillStyle='#5a4028'; c.fillRect(px-1,py,2,5); c.fillStyle='#3f6a2a'; c.beginPath(); c.arc(px,py-s*0.3,s,0,7); c.fill(); c.fillStyle='#5a8a3a'; c.beginPath(); c.arc(px-s*0.3,py-s*0.5,s*0.5,0,7); c.fill(); }
  for(const b of G.buildings){ if(b.dead||!vis(b.x,b.y,4)||!knownBuilding(b)) continue; const f=G.players[b.owner];
    const k=Math.min(1,(G.t-b.born)/0.4);
    c.save(); if(k<1){c.translate(b.x*TILE,b.y*TILE);c.scale(0.6+0.4*k,0.6+0.4*k);c.translate(-b.x*TILE,-b.y*TILE);c.globalAlpha=0.5+0.5*k;}
    if(b.readyT&&G.t<b.readyT) c.globalAlpha=0.55;
    if(b.site) drawSite(c,b,f.col,f.dark); else drawBuildingShape(c,b.type,f.col,f.dark,b.tx*TILE,b.ty*TILE,b.w,b.h,b.tur,b.empty,b.lvl||1); c.restore();
    if((b.lvl||1)>1){ c.fillStyle='#000a'; c.fillRect(b.tx*TILE+2,b.ty*TILE+2,13,11); c.fillStyle='#ffd36a'; c.font='bold 9px sans-serif'; c.fillText(b.lvl===2?'II':'III',b.tx*TILE+(b.lvl===2?5:3.5),b.ty*TILE+11); }   // Ausbaustufe
    if(b.upg){ c.strokeStyle='#d8c040'; c.lineWidth=1; c.setLineDash([3,3]); c.strokeRect(b.tx*TILE+2,b.ty*TILE+2,b.w*TILE-4,b.h*TILE-4); c.setLineDash([]);   // Gerüst
      c.fillStyle='#000a'; c.fillRect(b.tx*TILE+4,b.ty*TILE+b.h*TILE-11,b.w*TILE-8,4); c.fillStyle='#d8c040'; c.fillRect(b.tx*TILE+4,b.ty*TILE+b.h*TILE-11,(b.w*TILE-8)*b.upg.t/b.upg.time,4); }
    if(b.type==='wall'){ c.fillStyle='#7d7b73'; for(const [dx,dy] of [[1,0],[0,1]]){ const xx=b.tx+dx,yy=b.ty+dy; if(!inMap(xx,yy)) continue; const o=G.occ[idx(xx,yy)]; if(!o) continue; const nb=G.buildings.find(q=>q.id===o); if(nb&&nb.type==='wall'&&nb.owner===b.owner) c.fillRect(b.tx*TILE+(dx?TILE-4:6),b.ty*TILE+(dy?TILE-4:6),dx?8:TILE-12,dy?8:TILE-12); } }
    if(b.readyT&&G.t<b.readyT){ const k2=1-(b.readyT-G.t)/b.def.time; c.strokeStyle='#d8c040'; c.lineWidth=1; c.setLineDash([3,3]); c.strokeRect(b.tx*TILE+1,b.ty*TILE+1,TILE-2,TILE-2); c.setLineDash([]);
      c.fillStyle='#000a'; c.fillRect(b.tx*TILE+2,b.ty*TILE+TILE-5,TILE-4,3); c.fillStyle='#d8c040'; c.fillRect(b.tx*TILE+2,b.ty*TILE+TILE-5,(TILE-4)*k2,3); }
    if(b.hp<b.maxHp*0.5&&Math.random()<0.08) fxAdd({k:'smoke',x:b.x+(Math.random()-.5)*b.w*0.6,y:b.y+(Math.random()-.5)*b.h*0.6,r:0.3,life:1.4});
  }
  const selSet0=new Set(G.sel);
  for(const u of G.units){ if(u.dead||!vis(u.x,u.y)||!visibleUnit(u)) continue; const f=G.players[u.owner];
    if(u.dug){ c.strokeStyle='#a08a5a'; c.lineWidth=3; c.beginPath(); c.arc(u.x*TILE,u.y*TILE,u.def.size*TILE*0.75+3,Math.PI*0.15,Math.PI*1.85); c.stroke();
      c.strokeStyle='rgba(60,45,25,.6)'; c.lineWidth=1; c.stroke(); }   // Sandsäcke: eingegraben
    drawUnitShape(c,u.type,f.col,f.dark,u.x*TILE,u.y*TILE,u.angle,u.tur,u.working?-1:u.hp/u.maxHp);
    if(u.cage){ c.save(); c.translate(u.x*TILE,u.y*TILE); c.rotate(u.angle); const L=u.def.size*TILE*0.95, W2=u.def.size*TILE*0.7;
      c.strokeStyle='rgba(60,58,50,.9)'; c.lineWidth=0.8; c.strokeRect(-L/2-1.5,-W2/2-1.5,L+3,W2+3);
      c.beginPath(); for(let k=-L/2;k<=L/2;k+=3.5){ c.moveTo(k,-W2/2-1.5); c.lineTo(k+1.5,W2/2+1.5); } c.stroke(); c.restore(); }   // Gitterkäfig
    if(u.jammed){ c.strokeStyle='rgba(140,200,255,.8)'; c.lineWidth=1; c.beginPath(); c.arc(u.x*TILE,u.y*TILE,7+Math.random()*3,0,7); c.stroke(); }
    if(u.def.jam&&(u.owner===0||selSet0.has(u))){ c.strokeStyle='rgba(140,200,255,.18)'; c.setLineDash([4,4]); c.beginPath(); c.arc(u.x*TILE,u.y*TILE,JAM.radius*TILE,0,7); c.stroke(); c.setLineDash([]); }
    if(u.carry){ const col={wood:'#9a6a3a',stone:'#c4bca8',metal:'#8a96a4'}[u.carry.res]||'#ccc'; c.fillStyle='#000a'; c.fillRect(u.x*TILE-5,u.y*TILE-10,10,7); c.fillStyle=col; c.fillRect(u.x*TILE-4,u.y*TILE-9,8,5); }
    if(u.def.harvester&&u.cargo>0){c.fillStyle='#1a1410';c.fillRect(u.x*TILE-6,u.y*TILE+9,12,3);c.fillStyle='#e8c84a';c.fillRect(u.x*TILE-6,u.y*TILE+9,12*u.cargo/u.def.harvester.cap,3);}
  }
  for(const p of G.projectiles){ if(tileVis(p.x,p.y)<2) continue; c.save(); c.translate(p.x*TILE,p.y*TILE); c.rotate(p.a||0);
    if(p.delay>0){c.restore();continue;}
    if(p.type==='ballistic'){ c.restore(); const k=p.k||0, h=Math.sin(k*Math.PI)*Math.min(5,p.d0*0.12); c.save(); c.translate(p.x*TILE,(p.y-h)*TILE); c.rotate(p.a||0); c.fillStyle='#e8e4d8'; c.fillRect(-7,-2,12,4); c.fillStyle='#c0392b'; c.fillRect(4,-2,3,4); c.fillStyle='#ffb040'; c.fillRect(-11,-1.5,4,3); }
    else if(p.type==='glide'){ c.fillStyle='#3a3e44'; c.fillRect(-5,-1.5,9,3); c.fillRect(-2,-4,3,8); }
    else if(p.type==='shell'){c.fillStyle='#ffe08a';c.fillRect(-4,-1.2,8,2.4);}
    else if(p.type==='rocket'){c.fillStyle='#e8e2d0';c.fillRect(-5,-1.2,8,2.4);c.fillStyle='#ff9a30';c.fillRect(-8,-1.2,3,2.4);} else {c.fillStyle='#ddd';c.fillRect(-4,-1,7,2);c.fillStyle='#ffb040';c.fillRect(-6,-1,2,2);}
    c.restore(); }
  for(const f of (G.fallout||[])){ if(G.t>=f.until) continue; const a=Math.min(1,(f.until-G.t)/60)*0.28;   // Verstrahlung
    const gr=c.createRadialGradient(f.x*TILE,f.y*TILE,0,f.x*TILE,f.y*TILE,f.r*TILE); gr.addColorStop(0,`rgba(170,210,40,${a*1.4})`); gr.addColorStop(1,`rgba(170,210,40,${a*0.4})`);
    c.fillStyle=gr; c.beginPath(); c.arc(f.x*TILE,f.y*TILE,f.r*TILE,0,7); c.fill();
    c.strokeStyle=`rgba(230,200,40,${0.5+0.3*Math.sin(G.t*3)})`; c.lineWidth=2; c.setLineDash([10,8]); c.stroke(); c.setLineDash([]);
    c.font='bold 18px sans-serif'; c.textAlign='center'; c.fillStyle='rgba(30,30,10,.75)'; c.fillText('☢',f.x*TILE,f.y*TILE+6); c.textAlign='left'; }
  for(const e of G.fx){ if(e.age<0||e.k==='nuke') continue; if(G.fog&&tileVis(e.x??e.x1,e.y??e.y1)<2) continue; const k=e.age/e.life;
    if(e.k==='tracer'){c.strokeStyle=e.col;c.globalAlpha=1-k;c.lineWidth=1.3;c.beginPath();c.moveTo(e.x1*TILE,e.y1*TILE);c.lineTo(e.x2*TILE,e.y2*TILE);c.stroke();c.globalAlpha=1;}
    else if(e.k==='flash'){c.fillStyle=`rgba(255,230,140,${1-k})`;c.beginPath();c.arc(e.x*TILE,e.y*TILE,e.r,0,7);c.fill();}
    else if(e.k==='boom'){const r=e.r*TILE*(0.4+k);c.fillStyle=`rgba(255,${Math.floor(200-150*k)},60,${(1-k)*0.9})`;c.beginPath();c.arc(e.x*TILE,e.y*TILE,r,0,7);c.fill();
      c.fillStyle=`rgba(70,65,60,${(1-k)*0.6})`;c.beginPath();c.arc(e.x*TILE,e.y*TILE-k*6,r*0.8,0,7);c.fill();}
    else if(e.k==='smoke'){c.fillStyle=e.col?`rgba(30,28,25,${(1-k)*0.5})`:`rgba(110,108,100,${(1-k)*0.45})`;c.beginPath();c.arc(e.x*TILE+k*4,e.y*TILE-k*14,e.r*TILE*(0.6+k),0,7);c.fill();}
    else if(e.k==='flame'){const r=e.r*TILE*(1-k*0.5);c.fillStyle=`rgba(255,${Math.floor(170-120*k)},40,${(1-k)*0.85})`;c.beginPath();c.ellipse(e.x*TILE,e.y*TILE-k*10,r*0.7,r,0,0,7);c.fill();
      c.fillStyle=`rgba(255,240,150,${(1-k)*0.7})`;c.beginPath();c.ellipse(e.x*TILE,e.y*TILE-k*10+r*0.3,r*0.3,r*0.5,0,0,7);c.fill();}
    else if(e.k==='marker'){c.strokeStyle=e.col;c.globalAlpha=1-k;c.lineWidth=2;c.beginPath();c.arc(e.x*TILE,e.y*TILE,12*(1-k)+3,0,7);c.stroke();c.globalAlpha=1;}
    else if(e.k==='loot'){c.globalAlpha=Math.min(1,(1-k)*2);c.font='bold 13px sans-serif';const tw=c.measureText(e.txt).width;c.fillStyle='#000c';c.fillRect(e.x*TILE-tw/2-4,e.y*TILE-30-k*20,tw+8,17);c.fillStyle=e.col;c.fillText(e.txt,e.x*TILE-tw/2,e.y*TILE-17-k*20);c.globalAlpha=1;}
  }
  if(G.fog){ for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++){ const v=G.vis[idx(x,y)]; if(v===2) continue;
      c.fillStyle=v===0?'rgba(7,9,5,.96)':'rgba(7,9,5,.5)'; c.fillRect(x*TILE-0.5,y*TILE-0.5,TILE+1,TILE+1); } }
  for(const e of G.fx){ if(e.age<0||e.k!=='nuke') continue; const k=e.age/e.life, R=e.r*TILE;   // Atompilz: sichtbar auch im Nebel
    if(k<0.12){ c.fillStyle=`rgba(255,255,240,${1-k/0.12})`; c.beginPath(); c.arc(e.x*TILE,e.y*TILE,R*1.6*(k/0.12+0.2),0,7); c.fill(); }
    const g=c.createRadialGradient(e.x*TILE,e.y*TILE,0,e.x*TILE,e.y*TILE,R*(0.3+k*0.9)); g.addColorStop(0,`rgba(255,240,170,${(1-k)*0.95})`); g.addColorStop(0.5,`rgba(255,120,30,${(1-k)*0.8})`); g.addColorStop(1,'rgba(90,40,20,0)');
    c.fillStyle=g; c.beginPath(); c.arc(e.x*TILE,e.y*TILE,R*(0.3+k*0.9),0,7); c.fill();
    c.strokeStyle=`rgba(255,250,230,${Math.max(0,0.8-k*1.6)})`; c.lineWidth=4; c.beginPath(); c.arc(e.x*TILE,e.y*TILE,R*Math.min(2,k*4),0,7); c.stroke();   // Druckwelle
    const my=e.y*TILE-k*R*0.9; c.fillStyle=`rgba(110,80,60,${(1-k)*0.8})`; c.fillRect(e.x*TILE-R*0.08,my,R*0.16,e.y*TILE-my);   // Pilz
    c.fillStyle=`rgba(150,100,70,${(1-k)*0.85})`; c.beginPath(); c.ellipse(e.x*TILE,my,R*(0.25+k*0.35),R*(0.14+k*0.18),0,0,7); c.fill(); }
  for(const m of (G.missiles||[])){ const k=Math.min(1,(G.t-m.t0)/m.dur), x=m.x0+(m.x-m.x0)*k, y=m.y0+(m.y-m.y0)*k-Math.sin(k*Math.PI)*Math.min(14,dist(m.x0,m.y0,m.x,m.y)*0.3);   // Raketenflug
    const k2=Math.min(1,k+0.02), x2=m.x0+(m.x-m.x0)*k2, y2=m.y0+(m.y-m.y0)*k2-Math.sin(k2*Math.PI)*Math.min(14,dist(m.x0,m.y0,m.x,m.y)*0.3);
    c.save(); c.translate(x*TILE,y*TILE); c.rotate(Math.atan2(y2-y,x2-x)); c.fillStyle='#eee'; c.fillRect(-9,-2.5,16,5); c.fillStyle='#c0392b'; c.fillRect(5,-2.5,3,5); c.fillStyle='#ffb040'; c.fillRect(-14,-1.8,5,3.6); c.restore();
    if(Math.random()<0.6) fxAdd({k:'smoke',x,y,r:0.35,life:2});
    c.strokeStyle='rgba(255,90,74,.7)'; c.lineWidth=2; c.setLineDash([6,6]); c.beginPath(); c.arc(m.x*TILE,m.y*TILE,NUKE.radius*TILE,0,7); c.stroke(); c.setLineDash([]); }
  if(G.placing==='road'&&G.roadStart){ const s=G.roadStart;   // Straße: Startpunkt und (am PC) Vorschau des Weges
    if(G.hover){ const hx=Math.floor(G.hover.x), hy=Math.floor(G.hover.y), key=s.x+','+s.y+'>'+hx+','+hy+':'+G.t.toFixed(0);
      if(G.roadPrevKey!==key){ G.roadPrevKey=key; G.roadPrev=routeRoadBetween(0,s.x,s.y,hx,hy); }
      if(G.roadPrev){ c.fillStyle='rgba(232,200,74,.45)'; for(const i of G.roadPrev) c.fillRect((i%MAP_W)*TILE+6,((i/MAP_W)|0)*TILE+6,TILE-12,TILE-12); } }
    c.strokeStyle='#e8c84a'; c.lineWidth=3; c.beginPath(); c.arc((s.x+0.5)*TILE,(s.y+0.5)*TILE,TILE*0.42,0,7); c.stroke();
    c.fillStyle='#e8c84a'; c.beginPath(); c.arc((s.x+0.5)*TILE,(s.y+0.5)*TILE,4,0,7); c.fill(); }
  if(G.nukeAim&&G.hover){ c.strokeStyle='rgba(255,90,74,.85)'; c.lineWidth=2; c.setLineDash([8,6]); c.beginPath(); c.arc(G.hover.x*TILE,G.hover.y*TILE,NUKE.radius*TILE,0,7); c.stroke(); c.setLineDash([]);
    c.font='bold 22px sans-serif'; c.textAlign='center'; c.fillStyle='#ff5a4a'; c.fillText('☢',G.hover.x*TILE,G.hover.y*TILE+8); c.textAlign='left'; }
  const selSet=new Set(G.sel);
  { const areas=new Map(); for(const u of G.sel) if(!u.dead&&u.area) areas.set(u.msn,u.area);   // Einsatzgebiete der Auswahl
    for(const A of areas.values()){ c.strokeStyle='rgba(255,211,106,.6)'; c.lineWidth=1.5; c.setLineDash([6,5]); c.beginPath(); c.arc(A.x*TILE,A.y*TILE,A.r*TILE,0,7); c.stroke(); c.setLineDash([]); }
    for(const u of G.sel) if(!u.dead&&u.patrolArea){ const A=u.patrolArea; c.strokeStyle='rgba(127,176,234,.5)'; c.lineWidth=1.5; c.setLineDash([4,6]); c.beginPath(); c.arc(A.x*TILE,A.y*TILE,A.r*TILE,0,7); c.stroke(); c.setLineDash([]); } }
  for(const u of G.units){ if(u.dead||!vis(u.x,u.y)||!visibleUnit(u)) continue; const s=selSet.has(u);
    const R=u.def.size*TILE*0.8;
    if(s){c.strokeStyle=u.owner===0?'#9ff07a':'#ffd36a';c.lineWidth=1.5;c.beginPath();c.arc(u.x*TILE,u.y*TILE,R+3,0,7);c.stroke();}
    if(s||u.hp<u.maxHp) hpBar(c,u.x*TILE-R,u.y*TILE-R-7,R*2,u.hp/u.maxHp);
  }
  drawRanges(c,G.sel.filter(e=>!e.dead).slice(0,12));   // Wirkkreise der Auswahl
  for(const b of G.buildings){ if(b.dead||!vis(b.x,b.y,4)||!knownBuilding(b)) continue; const s=selSet.has(b);
    if(s){c.strokeStyle=b.owner===0?'#9ff07a':'#ffd36a';c.lineWidth=2;c.strokeRect(b.tx*TILE-1,b.ty*TILE-1,b.w*TILE+2,b.h*TILE+2);}
    if(s||b.hp<b.maxHp) hpBar(c,b.tx*TILE+3,b.ty*TILE-6,b.w*TILE-6,b.hp/b.maxHp);
    if(b.contam){ c.fillStyle='rgba(120,160,30,.35)'; c.fillRect(b.tx*TILE,b.ty*TILE,b.w*TILE,b.h*TILE); c.font='bold 14px sans-serif'; c.textAlign='center'; c.fillStyle='#e8d830'; c.fillText('☢',b.x*TILE,b.y*TILE+5); c.textAlign='left'; }   // verstrahlt: steht still
    if(b.def.cap&&b.quality!==undefined){
      if(b.quality<0.95){ c.fillStyle=`rgba(80,78,70,${(1-b.quality)*0.55})`; c.fillRect(b.tx*TILE+1,b.ty*TILE+1,b.w*TILE-2,b.h*TILE-2); }
      if(b.owner===0){ const w=b.w*TILE-8; c.fillStyle='#000a'; c.fillRect(b.tx*TILE+4,b.ty*TILE+b.h*TILE-6,w,4); c.fillStyle='#7fb3ff'; c.fillRect(b.tx*TILE+4,b.ty*TILE+b.h*TILE-6,w*(b.resid||0)/capOf(b),4); }
    }
    if(b.owner===0&&!b.site&&hauls(b)&&(b.eff??1)<0.9){ c.font='bold 10px sans-serif'; const t='🛣 '+Math.round(b.eff*100)+' %'; const tw=c.measureText(t).width; c.fillStyle='#000b'; c.fillRect(b.x*TILE-tw/2-3,b.ty*TILE-15,tw+6,13); c.fillStyle=b.eff<0.5?'#ff8a6a':'#e8c86a'; c.fillText(t,b.x*TILE-tw/2,b.ty*TILE-5); }
    if(b.site&&b.owner===0&&siteLacks(b)&&(G.t*2|0)%2){ c.font='bold 10px sans-serif'; const m=siteLacks(b), t='wartet auf '+({wood:'Holz',stone:'Stein',metal:'Metall'}[m]); const tw=c.measureText(t).width; c.fillStyle='#000b'; c.fillRect(b.x*TILE-tw/2-3,b.ty*TILE-17,tw+6,13); c.fillStyle='#ff9a6a'; c.fillText(t,b.x*TILE-tw/2,b.ty*TILE-7); }
    else if(b.site&&b.owner===0&&!siteWorkers(b)&&(G.t*2|0)%2){ c.font='bold 10px sans-serif'; const t='wartet auf Arbeiter'; const tw=c.measureText(t).width; c.fillStyle='#000b'; c.fillRect(b.x*TILE-tw/2-3,b.ty*TILE-17,tw+6,13); c.fillStyle='#e8c84a'; c.fillText(t,b.x*TILE-tw/2,b.ty*TILE-7); }
    if(b.owner===2||(s&&b.owner!==0)||(b.empty&&b.owner===0&&!b.site)){c.fillStyle='#000a';c.font='bold 10px sans-serif';const t=b.empty?'erschöpft':b.def.name;const tw=c.measureText(t).width;c.fillRect(b.x*TILE-tw/2-3,b.ty*TILE+b.h*TILE+2,tw+6,13);c.fillStyle=G.players[b.owner].col;c.fillText(t,b.x*TILE-tw/2,b.ty*TILE+b.h*TILE+12);}
  }
  if(G.placing&&G.hover&&!isDefType(G.placing)){ const d=BUILDINGS[G.placing], tx=Math.floor(G.hover.x)-Math.floor((d.w-1)/2), ty=Math.floor(G.hover.y)-Math.floor((d.h-1)/2);
    const ok=canPlace(0,G.placing,tx,ty); c.globalAlpha=0.6; drawBuildingShape(c,G.placing,FACTIONS[0].col,FACTIONS[0].dark,tx*TILE,ty*TILE,d.w,d.h,0); c.globalAlpha=1;
    if(ok){ // Vorschau: Wohnqualität, Äcker, Transportweg
      const parts=[]; let good=1;
      if(d.cap){ const q=housingQuality(0,tx,ty,d.w,d.h).q; parts.push('Wohnqualität '+Math.round(q*100)+' %'); good=Math.min(good,q>=0.9?1:q>=0.6?0.5:0); }
      if(G.placing==='farm'){ const f=previewFields(tx,ty,d.w,d.h); parts.push('Äcker '+Math.round(f*100)+' %'); good=Math.min(good,f>=0.8?1:f>=0.5?0.5:0); }
      if((d.wood||d.stone||d.metal||G.placing==='farm')&&G.haulMap){ let w=Infinity; for(const i of ringOf(tx,ty,d.w,d.h)) w=Math.min(w,G.haulMap[i]);
        const e=haulEff(w); parts.push('Transport '+Math.round(e*100)+' %'); good=Math.min(good,e>=0.8?1:e>=0.5?0.5:0); }
      if(parts.length){ const t=parts.join(' · '); c.font='bold 11px sans-serif'; const tw=c.measureText(t).width;
        c.fillStyle='#000c'; c.fillRect(tx*TILE+d.w*TILE/2-tw/2-4,ty*TILE-18,tw+8,15); c.fillStyle=good>=1?'#9fd88a':good>=0.5?'#e8d27a':'#ff9a6a'; c.fillText(t,tx*TILE+d.w*TILE/2-tw/2,ty*TILE-7); } }
    c.fillStyle=ok?'rgba(80,255,80,.25)':'rgba(255,60,60,.35)'; c.fillRect(tx*TILE,ty*TILE,d.w*TILE,d.h*TILE); }
  c.setTransform(dpr,0,0,dpr,0,0);
  if(input.box){const b=input.box;c.strokeStyle='#9ff07a';c.lineWidth=1.5;c.setLineDash([5,4]);c.strokeRect(Math.min(b.x0,b.x1),Math.min(b.y0,b.y1),Math.abs(b.x1-b.x0),Math.abs(b.y1-b.y0));c.setLineDash([]);c.fillStyle='rgba(159,240,122,.08)';c.fillRect(Math.min(b.x0,b.x1),Math.min(b.y0,b.y1),Math.abs(b.x1-b.x0),Math.abs(b.y1-b.y0));}
}
function ringOf(tx,ty,w,h){const out=[];for(let y=ty-1;y<=ty+h;y++)for(let x=tx-1;x<=tx+w;x++){if((x===tx-1||x===tx+w||y===ty-1||y===ty+h)&&inMap(x,y))out.push(idx(x,y));}return out;}
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
