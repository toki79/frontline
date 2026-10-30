import { dist, hash, idx, inMap, lerp, makeNoise } from '../core/util';
import { CONSTRUCTION, MAP_H, MAP_W, T } from '../data/config';
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
  // ---- Rohstoffe je Stadt ungleich verteilt: reich (2) / normal (1) / knapp (0); Kastrova umgekehrt ----
  const lvl=(side,r)=>G.profile[side].rich.includes(r)?2:G.profile[side].scarce.includes(r)?0:1;
  const blob=(side,cx,cy,r,fn)=>{ for(let y=Math.floor(cy-r-1);y<=cy+r+1;y++)for(let x=Math.floor(cx-r-1);x<=cx+r+1;x++){
      if(!inMap(x,y)||dist(x+0.5,y+0.5,cx,cy)>r*(0.8+0.35*hash(x*3,y*5))) continue;
      const a=side?W-1-x:x, b=side?H-1-y:y; fn(idx(a,b)); } };
  const toForest=i=>{ const t=terr[i]; if(t===T.GRASS||t===T.MUD||t===T.MEADOW) terr[i]=T.FOREST; };
  const toMeadow=i=>{ if(terr[i]===T.GRASS) terr[i]=T.MEADOW; };
  for(const side of [0,1]){
    // Holz: knapp = Wald rund um die Stadt gerodet; reich = zusätzliche Wälder am Stadtrand
    const w=lvl(side,'wood');
    if(w===0) blob(side,9.5,51.5,23,i=>{ if(terr[i]===T.FOREST) terr[i]=T.GRASS; });
    if(w>=1) blob(side,13.5,61,2.6,toForest);
    if(w===2){ blob(side,13.5,61,3.4,toForest); blob(side,2.5,43.5,2.8,toForest); blob(side,18.5,47.5,2.4,toForest); }
    // Nahrung: grüne Wiesen
    const f=lvl(side,'food');
    if(f>=1){ blob(side,12.5,45.5,f===2?3.6:2.8,toMeadow); blob(side,20.5,41,f===2?3.2:2.4,toMeadow); }
    if(f===2){ blob(side,4,59.5,2.8,toMeadow); blob(side,17.5,56.5,2.8,toMeadow); blob(side,3.5,47.5,2.4,toMeadow); }
    // Stein: Felsen
    const st=lvl(side,'stone');
    if(st>=1) field(G.rock,15.5,56.5,st===2?1.6:1.3,st===2?1500:1100,0.85,side);
    if(st===2){ field(G.rock,2.5,57.5,1.6,1500,0.85,side); field(G.rock,19.5,51.5,1.4,1400,0.85,side); }
    if(st>=1) field(G.rock,13.5,36.5,1.5,1400,0.85,side);
    else field(G.rock,23.5,33.5,1.2,900,0.8,side);
    // Öl: knapp = nichts in Stadtnähe, reich = reich + Zusatzfeld
    const o=lvl(side,'oil'), om=o===2?1.6:1;
    if(o>=1){ field(G.oil,18.5,58.5,2.2,420*om,0.8,side); field(G.oil,3.5,40.5,1.8,380*om,0.8,side); }
    if(o===2) field(G.oil,9.5,61,1.5,500,0.85,side);
    field(G.oil,21.5,45.5,2.4,o===0?400:600,0.8,side); field(G.oil,11.5,25.5,2.2,520,0.8,side);
    // Erz (Metall): knapp = kein Erz in Stadtnähe, reich = größer + Zusatzfeld
    const m=lvl(side,'metal');
    if(m>=1) field(G.ore,15.5,45.5,m===2?2.0:1.6,m===2?1300:900,0.9,side);
    if(m===2) field(G.ore,2.5,46.5,1.4,900,0.9,side);
    field(G.ore,25.5,38.5,1.8,m===0?800:1200,0.9,side); field(G.ore,4.5,31.5,1.6,1000,0.9,side);
    // Umkämpfte Ecken (gleich weit von beiden Städten): Wiese, Felsen, Erz für den, der sie sich holt
    blob(side,10,14,3.6,toMeadow); field(G.rock,6.5,9.5,1.7,1800,0.85,side); field(G.ore,14.5,6.5,1.5,1200,0.9,side);
  }
  for(let i=0;i<G.rock.length;i++) if(G.rock[i]>0){ G.oil[i]=0; G.ore[i]=0; }
  for(let i=0;i<terr.length;i++) G.wood[i]=terr[i]===T.FOREST?CONSTRUCTION.forestWood:0;
}
export function setupStart(){
  placeBuilding(0,'hq',6,51,true);
  placeBuilding(1,'hq',55,10,true);
  placeBuilding(2,'bunker',31,31,true);
  for(const pid of [0,1]){ const p=G.players[pid]; p.res={money:2500,food:200,wood:200,stone:60,metal:60,oil:0}; p.pop=30; }
  G.players[2].res={money:1500,food:400,wood:0,stone:0,metal:200,oil:0};
  for(let i=0;i<2;i++){ spawnAt(0,'inf',12+i,50+i); spawnAt(1,'inf',51-i,13-i); }
  for(let i=0;i<CONSTRUCTION.startWorkers;i++){ spawnAt(0,'worker',7+i*0.6,54.6); spawnAt(1,'worker',56.4-i*0.6,9.4); }
  [[29,33],[34,30],[30,29],[33,34],[29,30]].forEach(([x,y])=>spawnAt(2,'militia',x+0.5,y+0.5));
  for(const p of G.players) recalcPower(p.id);
}
