import { dist, hash, idx, inMap, lerp, makeNoise } from '../core/util';
import { MAP_H, MAP_W, T } from '../data/config';
import { G } from '../sim/state';
import { placeBuilding, recalcPower, spawnAt } from '../sim/world';

/* =====================================================================
   Kartengenerator (punktsymmetrisch)
   ===================================================================== */
export function genMap(){
  const R=G.rng, terr=G.terr, W=MAP_W, H=MAP_H;
  const nF=makeNoise(R,8), nF2=makeNoise(R,3), nM=makeNoise(R,6);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const f=nF(x,y)*0.72+nF2(x,y)*0.28, m=nM(x,y);
    terr[idx(x,y)] = f>0.62 ? T.FOREST : m>0.73 ? T.MUD : T.GRASS;
  }
  for(let k=0;k<4;k++){
    const cx=4+Math.floor(R()*56), cy=3+Math.floor(R()*25);
    for(let i=0;i<16;i++){const x=cx+Math.floor(R()*6)-3,y=cy+Math.floor(R()*5)-2; if(inMap(x,y)&&y<32) terr[idx(x,y)]=T.TOWN;}
  }
  const x0=38+R()*5, ph=R()*6; let prev=null;
  for(let y=0;y<=28;y++){
    const t=y/28, cx=lerp(x0,31,t)+Math.sin(y*0.33+ph)*2.2*(1-t*0.7);
    const xs=Math.floor(cx), a=prev===null?xs:Math.min(xs,prev), b=prev===null?xs:Math.max(xs,prev);
    for(let x=a;x<=b+1;x++) if(inMap(x,y)) terr[idx(x,y)]=T.WATER;
    prev=xs;
  }
  for(let y=0;y<32;y++)for(let x=0;x<W;x++){
    const d=dist(x+0.5,y+0.5,32,32);
    if(d>=3.4&&d<5.3) terr[idx(x,y)]=T.WATER; else if(d<3.4) terr[idx(x,y)]=T.TOWN;
  }
  for(let y=30;y<=31;y++)for(let x=25;x<32;x++) if(terr[idx(x,y)]===T.WATER) terr[idx(x,y)]=T.BRIDGE;
  const yb=8+Math.floor(R()*5);
  for(let y=yb;y<=yb+1;y++)for(let x=0;x<W;x++) if(terr[idx(x,y)]===T.WATER) terr[idx(x,y)]=T.BRIDGE;
  for(let y=yb-1;y<=yb+2;y++)for(let x=0;x<W;x++){ const t=terr[idx(x,y)]; if(t===T.FOREST||t===T.MUD) terr[idx(x,y)]=T.GRASS; }
  for(let y=32;y<H;y++)for(let x=0;x<W;x++) terr[idx(x,y)]=terr[idx(W-1-x,H-1-y)];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(terr[idx(x,y)]===T.BRIDGE){
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy; if(inMap(xx,yy)&&(terr[idx(xx,yy)]===T.FOREST||terr[idx(xx,yy)]===T.MUD)) terr[idx(xx,yy)]=T.GRASS;}
  }
  const sym=(x,y,fn)=>{fn(x,y);fn(W-1-x,H-1-y);};
  // große Bauflächen um die Städte
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(dist(x+0.5,y+0.5,9.5,51.5)<12.5 && terr[idx(x,y)]!==T.WATER && terr[idx(x,y)]!==T.BRIDGE) sym(x,y,(a,b)=>terr[idx(a,b)]=T.GRASS);
  }
  // Felder werden in Koordinaten der Aldoria-Seite angegeben; side=1 spiegelt auf Kastrovas Seite
  const field=(layer,cx,cy,r,rich,dens,side)=>{
    for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++){
      if(!inMap(x,y)||dist(x+0.5,y+0.5,cx,cy)>r) continue;
      if(R()<dens){ const a=side?W-1-x:x, b=side?H-1-y:y, t=terr[idx(a,b)];
        if(t!==T.WATER&&t!==T.BRIDGE){terr[idx(a,b)]=T.GRASS; layer[idx(a,b)]=rich*(0.7+0.3*hash(a,b));} }
    }
  };
  // Öl
  for(const side of [0,1]){ const pr=G.profile[side];
    // Öl: Engpass = nichts in Stadtnähe, Überschuss = reich + Zusatzfeld
    const om=pr.rich==='oil'?1.6:1;
    if(pr.scarce!=='oil'){ field(G.oil,18.5,58.5,2.2,420*om,0.8,side); field(G.oil,3.5,40.5,1.8,380*om,0.8,side); }
    if(pr.rich==='oil') field(G.oil,9.5,61,1.5,500,0.85,side);
    field(G.oil,21.5,45.5,2.4,pr.scarce==='oil'?400:600,0.8,side); field(G.oil,11.5,25.5,2.2,520,0.8,side);
  // Erz (Metall)
    // Erz: Engpass = kein Erz in Stadtnähe, Überschuss = größer + Zusatzfeld
    if(pr.scarce!=='metal') field(G.ore,15.5,45.5,pr.rich==='metal'?2.0:1.6,pr.rich==='metal'?1300:900,0.9,side);
    if(pr.rich==='metal') field(G.ore,2.5,46.5,1.4,900,0.9,side);
    field(G.ore,25.5,38.5,1.8,pr.scarce==='metal'?800:1200,0.9,side); field(G.ore,4.5,31.5,1.6,1000,0.9,side);
  }
}
export function setupStart(){
  placeBuilding(0,'hq',6,51,true);
  placeBuilding(1,'hq',55,10,true);
  placeBuilding(2,'bunker',31,31,true);
  for(const pid of [0,1]){ const p=G.players[pid]; p.res={money:2500,food:200,metal:60,oil:0}; p.pop=30; }
  G.players[2].res={money:1500,food:400,metal:200,oil:0};
  for(let i=0;i<2;i++){ spawnAt(0,'inf',12+i,50+i); spawnAt(1,'inf',51-i,13-i); }
  [[29,33],[34,30],[30,29],[33,34],[29,30]].forEach(([x,y])=>spawnAt(2,'militia',x+0.5,y+0.5));
  for(const p of G.players) recalcPower(p.id);
}
