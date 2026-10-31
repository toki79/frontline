import { dist, hash, idx, inMap, lerp, makeNoise } from '../core/util';
import { BANDITS, CONSTRUCTION, MAP_H, MAP_W, T } from '../data/config';
import { G } from '../sim/state';
import { placeBuilding, recalcPower, spawnAt } from '../sim/world';

/* =====================================================================
   Kartengenerator (punktsymmetrisch)
   ---------------------------------------------------------------------
   Koordinaten sind im „Entwurfsmaß“ einer 64er-Karte angegeben:
   G(x) – großräumige Lage (Fluss, Insel, Mitte, Ecken) wird mit der Kartengröße gestreckt,
   L(x,y) – Stadtnahes (Wälder, Wiesen, Felsen am Stadtrand) bleibt im selben Abstand zum Rathaus.
   ===================================================================== */
export const K = MAP_W/64;
/** Rathaus Aldoria (linke untere Ecke des 3×3-Gebäudes); Kastrova liegt punktgespiegelt */
export const HQ0 = {x:Math.round(6*K), y:Math.round(51*K)};
export const HQ1 = {x:MAP_W-3-HQ0.x, y:MAP_H-3-HQ0.y};
const Gx = v => v*K;
const Lx = x => x-6+HQ0.x, Ly = y => y-51+HQ0.y;

export function genMap(){
  const R=G.rng, terr=G.terr, W=MAP_W, H=MAP_H, CX=W/2, CY=H/2;
  const nF=makeNoise(R,8), nF2=makeNoise(R,3), nM=makeNoise(R,6);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const f=nF(x,y)*0.72+nF2(x,y)*0.28, m=nM(x,y);
    terr[idx(x,y)] = f>0.62 ? T.FOREST : m>0.73 ? T.MUD : T.GRASS;
  }
  // Ortschaften (Ruinen)
  for(let k=0;k<Math.round(4*K*K);k++){
    const cx=Math.floor(Gx(4)+R()*Gx(56)), cy=Math.floor(Gx(3)+R()*Gx(25));
    for(let i=0;i<16;i++){const x=cx+Math.floor(R()*6)-3,y=cy+Math.floor(R()*5)-2; if(inMap(x,y)&&y<CY) terr[idx(x,y)]=T.TOWN;}
  }
  // Fluss von oben zur Insel in der Mitte
  const x0=Gx(38+R()*5), ph=R()*6, yEnd=Math.round(Gx(28)); let prev=null;
  for(let y=0;y<=yEnd;y++){
    const t=y/yEnd, cx=lerp(x0,Gx(31),t)+Math.sin(y*0.33/K+ph)*2.2*K*(1-t*0.7);
    const xs=Math.floor(cx), a=prev===null?xs:Math.min(xs,prev), b=prev===null?xs:Math.max(xs,prev);
    for(let x=a;x<=b+1;x++) if(inMap(x,y)) terr[idx(x,y)]=T.WATER;
    prev=xs;
  }
  // Insel der Miliz mit Wassergraben
  for(let y=0;y<CY;y++)for(let x=0;x<W;x++){
    const d=dist(x+0.5,y+0.5,CX,CY);
    if(d>=3.4*K&&d<5.3*K) terr[idx(x,y)]=T.WATER; else if(d<3.4*K) terr[idx(x,y)]=T.TOWN;
  }
  const yI=Math.round(CY-2);   // Brücke zur Insel
  for(let y=yI;y<=yI+1;y++)for(let x=Math.floor(Gx(25));x<CX;x++) if(terr[idx(x,y)]===T.WATER) terr[idx(x,y)]=T.BRIDGE;
  const yb=Math.round(Gx(8+R()*5));
  for(let y=yb;y<=yb+1;y++)for(let x=0;x<W;x++) if(terr[idx(x,y)]===T.WATER) terr[idx(x,y)]=T.BRIDGE;
  for(let y=yb-1;y<=yb+2;y++)for(let x=0;x<W;x++){ const t=terr[idx(x,y)]; if(t===T.FOREST||t===T.MUD) terr[idx(x,y)]=T.GRASS; }
  for(let y=CY;y<H;y++)for(let x=0;x<W;x++) terr[idx(x,y)]=terr[idx(W-1-x,H-1-y)];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(terr[idx(x,y)]===T.BRIDGE){
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy; if(inMap(xx,yy)&&(terr[idx(xx,yy)]===T.FOREST||terr[idx(xx,yy)]===T.MUD)) terr[idx(xx,yy)]=T.GRASS;}
  }
  const sym=(x,y,fn)=>{fn(x,y);fn(W-1-x,H-1-y);};
  // große Bauflächen um die Städte
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(dist(x+0.5,y+0.5,Lx(9.5),Ly(51.5))<12.5 && terr[idx(x,y)]!==T.WATER && terr[idx(x,y)]!==T.BRIDGE) sym(x,y,(a,b)=>terr[idx(a,b)]=T.GRASS);
  }
  // Felder in Koordinaten der Aldoria-Seite; side=1 spiegelt auf Kastrovas Seite
  const field=(layer,cx,cy,r,rich,dens,side)=>{
    for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++){
      if(!inMap(x,y)||dist(x+0.5,y+0.5,cx,cy)>r) continue;
      if(R()<dens){ const a=side?W-1-x:x, b=side?H-1-y:y, t=terr[idx(a,b)];
        if(t!==T.WATER&&t!==T.BRIDGE){terr[idx(a,b)]=T.GRASS; layer[idx(a,b)]=rich*(0.7+0.3*hash(a,b));} }
    }
  };
  const lf=(layer,x,y,r,rich,dens,side)=>field(layer,Lx(x),Ly(y),r,rich,dens,side);          // stadtnah
  const gf=(layer,x,y,r,rich,dens,side)=>field(layer,Gx(x),Gx(y),r*Math.sqrt(K),rich,dens,side);   // großräumig
  // ---- Rohstoffe je Stadt ungleich verteilt: reich (2) / normal (1) / knapp (0); Kastrova umgekehrt ----
  const lvl=(side,r)=>G.profile[side].rich.includes(r)?2:G.profile[side].scarce.includes(r)?0:1;
  const blob=(side,cx,cy,r,fn)=>{ for(let y=Math.floor(cy-r-1);y<=cy+r+1;y++)for(let x=Math.floor(cx-r-1);x<=cx+r+1;x++){
      if(!inMap(x,y)||dist(x+0.5,y+0.5,cx,cy)>r*(0.8+0.35*hash(x*3,y*5))) continue;
      const a=side?W-1-x:x, b=side?H-1-y:y; fn(idx(a,b)); } };
  const lb=(side,x,y,r,fn)=>blob(side,Lx(x),Ly(y),r,fn), gb=(side,x,y,r,fn)=>blob(side,Gx(x),Gx(y),r*K,fn);
  const toForest=i=>{ const t=terr[i]; if(t===T.GRASS||t===T.MUD||t===T.MEADOW) terr[i]=T.FOREST; };
  const toMeadow=i=>{ if(terr[i]===T.GRASS) terr[i]=T.MEADOW; };
  for(const side of [0,1]){
    // Holz: knapp = Wald rund um die Stadt gerodet; reich = zusätzliche Wälder am Stadtrand
    const w=lvl(side,'wood');
    if(w===0){ lb(side,9.5,51.5,23,i=>{ if(terr[i]===T.FOREST) terr[i]=T.GRASS; }); lb(side,17,60,1.8,toForest); }   // knapp: nur ein Wäldchen
    if(w>=1) lb(side,13.5,61,2.6,toForest);
    if(w===2){ lb(side,13.5,61,3.4,toForest); lb(side,2.5,43.5,2.8,toForest); lb(side,18.5,47.5,2.4,toForest); }
    // Nahrung: grüne Wiesen
    const f=lvl(side,'food');
    if(f>=1){ lb(side,12.5,45.5,f===2?3.6:2.8,toMeadow); lb(side,20.5,41,f===2?3.2:2.4,toMeadow); }
    if(f===2){ lb(side,4,59.5,2.8,toMeadow); lb(side,17.5,56.5,2.8,toMeadow); lb(side,3.5,47.5,2.4,toMeadow); }
    // Stein: Felsen
    const st=lvl(side,'stone');
    if(st>=1) lf(G.rock,15.5,56.5,st===2?1.6:1.3,st===2?1500:1100,0.85,side);
    if(st===2){ lf(G.rock,2.5,57.5,1.6,1500,0.85,side); lf(G.rock,19.5,51.5,1.4,1400,0.85,side); }
    if(st>=1) gf(G.rock,13.5,36.5,1.5,1400,0.85,side);
    else { gf(G.rock,23.5,33.5,1.2,900,0.8,side); lf(G.rock,3.5,60,1.0,500,0.9,side); }   // knapp: nur ein paar Brocken
    // Öl: knapp = nichts in Stadtnähe, reich = reich + Zusatzfeld
    const o=lvl(side,'oil'), om=o===2?1.6:1;
    if(o>=1){ lf(G.oil,18.5,58.5,2.2,420*om,0.8,side); lf(G.oil,3.5,40.5,1.8,380*om,0.8,side); }
    if(o===2) lf(G.oil,9.5,61,1.5,500,0.85,side);
    gf(G.oil,21.5,45.5,2.4,o===0?400:600,0.8,side); gf(G.oil,11.5,25.5,2.2,520,0.8,side);
    // Erz (Metall): knapp = kein Erz in Stadtnähe, reich = größer + Zusatzfeld
    const m=lvl(side,'metal');
    if(m>=1) lf(G.ore,15.5,45.5,m===2?2.0:1.6,m===2?1300:900,0.9,side);
    if(m===2) lf(G.ore,2.5,46.5,1.4,900,0.9,side);
    gf(G.ore,25.5,38.5,1.8,m===0?800:1200,0.9,side); gf(G.ore,4.5,31.5,1.6,1000,0.9,side);
    // Umkämpfte Ecken (gleich weit von beiden Städten): Wiese, Felsen, Erz für den, der sie sich holt
    gb(side,10,14,3.6,toMeadow); gf(G.rock,6.5,9.5,1.7,1800,0.85,side); gf(G.ore,14.5,6.5,1.5,1200,0.9,side);
  }
  for(let i=0;i<G.rock.length;i++) if(G.rock[i]>0){ G.oil[i]=0; G.ore[i]=0; }
  for(let i=0;i<terr.length;i++) G.wood[i]=terr[i]===T.FOREST?CONSTRUCTION.forestWood:0;
}
/** freier 2×2-Platz für ein Räuberlager nahe (cx,cy) */
function campSpot(cx,cy){
  for(let r=0;r<8;r++) for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){ if(Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
    const x=Math.floor(cx)+dx, y=Math.floor(cy)+dy; let ok=true;
    for(let yy=y;yy<y+2&&ok;yy++)for(let xx=x;xx<x+2;xx++){ if(!inMap(xx,yy)){ok=false;break;} const i=idx(xx,yy), t=G.terr[i];
      if(t===T.WATER||t===T.BRIDGE||G.occ[i]||G.oil[i]>0||G.ore[i]>0||G.rock[i]>0){ok=false;break;} }
    if(ok) return {x,y}; }
  return null;
}
export function setupStart(){
  const W=MAP_W, H=MAP_H, mir=(x,y):[number,number]=>[W-x,H-y];
  placeBuilding(0,'hq',HQ0.x,HQ0.y,true);
  placeBuilding(1,'hq',HQ1.x,HQ1.y,true);
  const bx=W/2-1, by=H/2-1; placeBuilding(2,'bunker',bx,by,true);
  for(const pid of [0,1]){ const p=G.players[pid]; p.res={money:2500,food:200,wood:200,stone:60,metal:60,oil:0}; p.pop=30; }
  G.players[2].res={money:1500,food:400,wood:0,stone:0,metal:200,oil:0};
  G.players[3].res={money:0,food:0,wood:0,stone:0,metal:0,oil:0};
  for(let i=0;i<2;i++){ const x=Lx(12+i), y=Ly(50+i); spawnAt(0,'inf',x,y); spawnAt(1,'inf',...mir(x,y)); }
  for(let i=0;i<CONSTRUCTION.startWorkers;i++){ const x=Lx(7+i*0.6), y=Ly(54.6); spawnAt(0,'worker',x,y); spawnAt(1,'worker',...mir(x,y)); }
  [[-2,2],[3,-1],[-1,-2],[2,3],[-2,-1]].forEach(([dx,dy])=>spawnAt(2,'militia',bx+1+dx+0.5,by+1+dy+0.5));
  // Räuberlager in abgelegenen Gebieten (beide Seiten gleich)
  for(const [x,y] of BANDITS.camps) for(const side of [0,1]){
    const cx=side?W-1-Gx(x):Gx(x), cy=side?H-1-Gx(y):Gx(y), s=campSpot(cx,cy);
    if(s){ const b=placeBuilding(3,'camp',s.x,s.y,true); b.home={x:b.x,y:b.y}; }
  }
  for(const p of G.players) recalcPower(p.id);
}
