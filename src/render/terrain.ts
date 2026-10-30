import { hash, idx, inMap } from '../core/util';
import { MAP_H, MAP_W, T, TERRAIN, TILE } from '../data/config';
import { G } from '../sim/state';

/* =====================================================================
   Gelände vorzeichnen
   ===================================================================== */
export function renderTerrain(){
  const c=document.createElement('canvas'); c.width=MAP_W*TILE; c.height=MAP_H*TILE;
  const g=c.getContext('2d');
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    const t=G.terr[idx(x,y)], d=TERRAIN[t], h=hash(x,y), px=x*TILE, py=y*TILE;
    g.fillStyle=d.col[Math.floor(h*d.col.length)]; g.fillRect(px,py,TILE,TILE);
    if(t===T.GRASS){ for(let i=0;i<4;i++){const hx=hash(x*7+i,y*3), hy=hash(y*5+i,x*11); g.fillStyle=i%2?'#7e8c52':'#62703c'; g.fillRect(px+hx*28,py+hy*28,3,2);} }
  }
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    const t=G.terr[idx(x,y)], px=x*TILE, py=y*TILE;
    if(t===T.WATER){
      g.strokeStyle='#5d8aa0'; g.lineWidth=1.2; g.beginPath();
      for(let i=0;i<2;i++){const yy=py+8+i*14+hash(x,y+i)*4; g.moveTo(px+4,yy); g.quadraticCurveTo(px+12,yy-3,px+20,yy); }
      g.stroke();
      g.fillStyle='#8a7d5a';
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy; if(inMap(xx,yy)&&G.terr[idx(xx,yy)]!==T.WATER&&G.terr[idx(xx,yy)]!==T.BRIDGE){
        if(dx===1)g.fillRect(px+TILE-3,py,3,TILE); if(dx===-1)g.fillRect(px,py,3,TILE); if(dy===1)g.fillRect(px,py+TILE-3,TILE,3); if(dy===-1)g.fillRect(px,py,TILE,3);} }
    } else if(t===T.BRIDGE){
      g.fillStyle='#3b6176'; g.fillRect(px,py,TILE,TILE);
      g.fillStyle='#7a6b56'; g.fillRect(px,py+2,TILE,TILE-4);
      g.strokeStyle='#5a4d3c'; g.lineWidth=1;
      for(let i=0;i<TILE;i+=6){g.beginPath();g.moveTo(px+i,py+2);g.lineTo(px+i,py+TILE-2);g.stroke();}
    } else if(t===T.FOREST){
      for(let i=0;i<3;i++){const hx=hash(x*3+i,y*7), hy=hash(y*13+i,x*5), r=6+hash(x+i,y)*4;
        g.fillStyle='rgba(0,0,0,.25)'; g.beginPath(); g.arc(px+5+hx*22+2,py+5+hy*22+2,r,0,7); g.fill();
        g.fillStyle=i%2?'#2f4a22':'#365429'; g.beginPath(); g.arc(px+5+hx*22,py+5+hy*22,r,0,7); g.fill();
        g.fillStyle='#4b6e36'; g.beginPath(); g.arc(px+3+hx*22,py+3+hy*22,r*0.45,0,7); g.fill();}
    } else if(t===T.MUD){
      for(let i=0;i<3;i++){const hx=hash(x*9+i,y), hy=hash(y*3+i,x*2); g.fillStyle='rgba(60,45,25,.55)'; g.beginPath(); g.ellipse(px+6+hx*20,py+6+hy*20,7,4,hx*3,0,7); g.fill();}
      g.strokeStyle='rgba(40,30,15,.5)'; g.beginPath(); g.moveTo(px+2,py+10+hash(x,y)*10); g.lineTo(px+30,py+14+hash(y,x)*10); g.stroke();
    } else if(t===T.TOWN){
      const h=hash(x,y);
      if(h<0.75){
        const w=12+hash(x*2,y)*10, hh=10+hash(x,y*2)*8, ox=2+hash(x*5,y)*(TILE-w-4), oy=2+hash(x,y*5)*(TILE-hh-4);
        g.fillStyle='rgba(0,0,0,.3)'; g.fillRect(px+ox+3,py+oy+3,w,hh);
        g.fillStyle=h<0.3?'#9a5b45':h<0.55?'#7d6f63':'#a08b6a'; g.fillRect(px+ox,py+oy,w,hh);
        g.strokeStyle='rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(px+ox,py+oy+hh/2); g.lineTo(px+ox+w,py+oy+hh/2); g.stroke();
      }
    }
  }
  G.terrCanvas=c;
  const m=document.createElement('canvas'); m.width=MAP_W; m.height=MAP_H; const mg=m.getContext('2d');
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){const t=G.terr[idx(x,y)]; mg.fillStyle=t===T.BRIDGE?'#a08a64':TERRAIN[t].col[0]; mg.fillRect(x,y,1,1);}
  G.miniBg=m;
}
/** Einzelnes Feld neu zeichnen (z. B. abgeholzter Wald → Steppe) */
export function repaintTile(i){
  if(!G.terrCanvas) return;
  const x=i%MAP_W, y=(i/MAP_W)|0, t=G.terr[i], d=TERRAIN[t], px=x*TILE, py=y*TILE, g=G.terrCanvas.getContext('2d');
  g.fillStyle=d.col[Math.floor(hash(x,y)*d.col.length)]; g.fillRect(px,py,TILE,TILE);
  if(t===T.GRASS){ for(let k=0;k<4;k++){const hx=hash(x*7+k,y*3), hy=hash(y*5+k,x*11); g.fillStyle=k%2?'#7e8c52':'#62703c'; g.fillRect(px+hx*28,py+hy*28,3,2);}
    // Baumstümpfe erinnern an den Wald
    for(let k=0;k<2;k++){ const hx=hash(x*3+k,y*7), hy=hash(y*13+k,x*5); g.fillStyle='#5a4028'; g.beginPath(); g.arc(px+6+hx*20,py+6+hy*20,2.4,0,7); g.fill(); g.fillStyle='#a8865a'; g.beginPath(); g.arc(px+6+hx*20,py+6+hy*20,1.3,0,7); g.fill(); } }
  if(G.miniBg){ const mg=G.miniBg.getContext('2d'); mg.fillStyle=d.col[0]; mg.fillRect(x,y,1,1); }
}
