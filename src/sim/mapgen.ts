import { dist, hash, idx, inMap, makeNoise } from '../core/util';
import { BANDITS, CONSTRUCTION, MAJORS, MAP_H, MAP_W, T } from '../data/config';
import { G } from '../sim/state';
import { placeBuilding, recalcPower, spawnAt } from '../sim/world';

/* =====================================================================
   Kartengenerator: drei Städte in drei Ecken
   ---------------------------------------------------------------------
   Alles wird in Koordinaten der Aldoria-Seite (links unten) entworfen und
   für die anderen Mächte gespiegelt – so hat jede Stadt dieselbe Lage:
     Aldoria  (0) links unten   – unverändert
     Kastrova (1) rechts oben   – an der Diagonale gespiegelt (x,y) → (y,x)
     Veloria  (4) rechts unten  – waagrecht gespiegelt (x,y) → (W-1-x, y)
   Drei Flüsse teilen das Tal und münden in den Graben um die Milizinsel in
   der Mitte: einer von der linken oberen Ecke (Aldoria | Kastrova), einer vom
   unteren Rand (Aldoria | Veloria), einer vom rechten Rand (Veloria | Kastrova).
   Die Wildnis links oben teilen sich Aldoria und Kastrova; an den Flussgrenzen
   der Nachbarn liegen umkämpfte Vorkommen.
   ===================================================================== */
type TF = (x:number,y:number)=>[number,number];
const W=MAP_W, H=MAP_H;
const ID: TF = (x,y)=>[x,y];
const TR: TF = (x,y)=>[y,x];            // Diagonale: Aldoria → Kastrova
const XM: TF = (x,y)=>[W-1-x,y];        // waagrecht: Aldoria → Veloria
const TX: TF = (x,y)=>TR(...XM(x,y));   // Veloria-Seite der Grenze Veloria | Kastrova
/** Spiegelung je Macht (Felder) */
export const SIDE_TF: Record<number,TF> = {0:ID, 1:TR, 4:XM};
/** dieselbe Spiegelung für Punkte (Feldmitte bleibt Feldmitte) */
const ptf=(tf:TF,x:number,y:number):[number,number]=>{ const [a,b]=tf(Math.floor(x),Math.floor(y)); return [a+(x-Math.floor(x)),b+(y-Math.floor(y))]; };
/** Rathaus Aldoria (linke obere Ecke des 3×3-Gebäudes); gleich weit vom linken und unteren Rand */
export const HQ0 = {x:18, y:123};
/** Stadtnahes ist im alten Entwurfsmaß angegeben (Rathaus bei 6/51) */
const Lx = x => x-6+HQ0.x, Ly = y => y-51+HQ0.y;
/** Gruppen von Spiegelungen: Heimat (jede Stadt einmal), Wildnis A (Aldoria | Kastrova), Flussgrenzen B (Nachbarn) */
const HOME=[ID,TR,XM], PAIR_A=[ID,TR], PAIR_B=[ID,XM,TR,TX];
const ISLAND={r:7.6, moat:11.9};

/** kanonische Lage eines Feldes (für symmetrisches Grundgelände) */
function canon(x,y):[number,number]{
  const h=W/2;
  if(x<h&&y>=h) return [x,y];
  if(x>=h&&y>=h) return [W-1-x,y];
  if(x>=h&&y<h) return [y,x];
  return y>=x?[x,y]:[y,x];
}
export function genMap(){
  const R=G.rng, terr=G.terr, CX=W/2, CY=H/2;
  const nF=makeNoise(R,8), nF2=makeNoise(R,3), nM=makeNoise(R,6);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const [a,b]=canon(x,y), f=nF(a,b)*0.72+nF2(a,b)*0.28, m=nM(a,b);
    terr[idx(x,y)] = f>0.62 ? T.FOREST : m>0.73 ? T.MUD : T.GRASS;
  }
  const put=(tfs:TF[],x,y,fn:(i:number)=>void)=>{ for(const tf of tfs){ const [a,b]=tf(x,y); if(inMap(a,b)) fn(idx(a,b)); } };
  // Ortschaften (Ruinen) in der Wildnis und an den Grenzen
  const town=(tfs,cx,cy)=>{ for(let i=0;i<18;i++){ const x=cx+Math.floor(R()*7)-3, y=cy+Math.floor(R()*5)-2; put(tfs,x,y,i=>terr[i]=T.TOWN); } };
  town(PAIR_A,10,30); town(PAIR_A,36,48); town(PAIR_B,50,118); town(HOME,8,80);
  // ---- Flüsse ----
  const ph=R()*6, ph2=R()*6;
  // a) vom unteren Rand zur Insel (Grenze Aldoria | Veloria) – symmetrisch zur Mittelsenkrechten; b) gespiegelt vom rechten Rand
  for(let y=Math.floor(CY+ISLAND.r);y<H;y++){ const t=(y-CY)/(H-CY), w=1.25+Math.abs(Math.sin(y*0.16+ph))*1.6*t;
    for(let x=Math.floor(CX-w-1);x<=CX+w;x++) if(Math.abs(x+0.5-CX)<w){ put([ID,TR],x,y,i=>terr[i]=T.WATER); } }
  // c) aus der linken oberen Ecke zur Insel (Grenze Aldoria | Kastrova) – symmetrisch zur Diagonale
  for(let y=0;y<CY;y++)for(let x=0;x<CX;x++){ const along=(x+y)/2, w=1.05+Math.abs(Math.sin(along*0.13+ph2))*0.9;
    if(Math.abs(x-y)/Math.SQRT2<w&&along<CX-ISLAND.r) terr[idx(x,y)]=T.WATER; }
  // Insel der Miliz mit Wassergraben
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const d=dist(x+0.5,y+0.5,CX,CY);
    if(d>=ISLAND.r&&d<ISLAND.moat) terr[idx(x,y)]=T.WATER; else if(d<ISLAND.r) terr[idx(x,y)]=T.TOWN;
  }
  // ---- Brücken ----
  const bridge=(i)=>{ if(terr[i]===T.WATER) terr[i]=T.BRIDGE; };
  // zur Insel: diagonal von jeder Stadt aus (links unten, rechts oben, rechts unten)
  for(let k=Math.floor(ISLAND.r-1);k<=ISLAND.moat+1;k++) for(let o=-1;o<=1;o++){
    const s=k/Math.SQRT2; const x=Math.floor(CX-s)+(o>0?1:0), y=Math.floor(CY+s)-(o<0?1:0);
    if(inMap(x,y)) put(HOME,x,y,bridge); }
  // über Fluss a/b: zwei Übergänge (nahe der Insel und nahe dem Rand)
  for(const yb of [Math.round(CY+ISLAND.moat+12+R()*6), Math.round(H-16-R()*6)])
    for(let y=yb;y<=yb+1;y++)for(let x=Math.floor(CX-5);x<=CX+5;x++) put([ID,TR],x,y,bridge);
  // über Fluss c: zwei Übergänge quer zur Diagonale
  for(const b of [Math.round(20+R()*6), Math.round(44+R()*6)])
    for(let x=b-5;x<=b+5;x++)for(let y=b-5;y<=b+5;y++) if(Math.abs((x+y)-2*b)<=1) bridge(idx(x,y));
  // rund um Brücken: keine Wälder/Sümpfe
  for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(terr[idx(x,y)]===T.BRIDGE){
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy; if(inMap(xx,yy)&&(terr[idx(xx,yy)]===T.FOREST||terr[idx(xx,yy)]===T.MUD)) terr[idx(xx,yy)]=T.GRASS;}
  }
  // ---- Bauflächen um die Städte ----
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(dist(x+0.5,y+0.5,Lx(9.5),Ly(51.5))<12.5) put(HOME,x,y,i=>{ if(terr[i]!==T.WATER&&terr[i]!==T.BRIDGE) terr[i]=T.GRASS; });
  }
  // Rohstoff-Felder: (cx,cy) auf der Aldoria-Seite, für jede Spiegelung in tfs
  const field=(tfs:TF[],layer,cx,cy,r,rich,dens)=>{
    for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++){
      if(!inMap(x,y)||dist(x+0.5,y+0.5,cx,cy)>r) continue;
      if(R()<dens) put(tfs,x,y,i=>{ const t=terr[i]; if(t!==T.WATER&&t!==T.BRIDGE&&t!==T.TOWN){ terr[i]=T.GRASS; const [a,b]=[i%W,(i/W)|0]; layer[i]=rich*(0.7+0.3*hash(a,b)); } });
    }
  };
  const blob=(tfs:TF[],cx,cy,r,fn)=>{ for(let y=Math.floor(cy-r-1);y<=cy+r+1;y++)for(let x=Math.floor(cx-r-1);x<=cx+r+1;x++){
      if(!inMap(x,y)||dist(x+0.5,y+0.5,cx,cy)>r*(0.8+0.35*hash(x*3,y*5))) continue; put(tfs,x,y,fn); } };
  const toForest=i=>{ const t=terr[i]; if(t===T.GRASS||t===T.MUD||t===T.MEADOW) terr[i]=T.FOREST; };
  const toMeadow=i=>{ if(terr[i]===T.GRASS) terr[i]=T.MEADOW; };
  // ---- Rohstoffe je Stadt ungleich verteilt: reich (2) / normal (1) / knapp (0) ----
  const lvl=(side,r)=>G.profile[side].rich.includes(r)?2:G.profile[side].scarce.includes(r)?0:1;
  for(const side of MAJORS){ const S=[SIDE_TF[side]];
    const lb=(x,y,r,fn)=>blob(S,Lx(x),Ly(y),r,fn), lf=(layer,x,y,r,rich,dens)=>field(S,layer,Lx(x),Ly(y),r,rich,dens);
    const gf=(layer,x,y,r,rich,dens)=>field(S,layer,x,y,r,rich,dens);
    // Holz: knapp = Wald rund um die Stadt gerodet; reich = zusätzliche Wälder am Stadtrand
    const w=lvl(side,'wood');
    if(w===0){ lb(9.5,51.5,23,i=>{ if(terr[i]===T.FOREST) terr[i]=T.GRASS; }); lb(17,60,1.8,toForest); }   // knapp: nur ein Wäldchen
    if(w>=1) lb(13.5,61,2.6,toForest);
    if(w===2){ lb(13.5,61,3.4,toForest); lb(2.5,43.5,2.8,toForest); lb(18.5,47.5,2.4,toForest); }
    // Nahrung: grüne Wiesen
    const f=lvl(side,'food');
    if(f>=1){ lb(12.5,45.5,f===2?3.6:2.8,toMeadow); lb(20.5,41,f===2?3.2:2.4,toMeadow); }
    if(f===2){ lb(4,59.5,2.8,toMeadow); lb(17.5,56.5,2.8,toMeadow); lb(3.5,47.5,2.4,toMeadow); }
    // Stein: Felsen
    const st=lvl(side,'stone');
    if(st>=1) lf(G.rock,15.5,56.5,st===2?1.6:1.3,st===2?1500:1100,0.85);
    if(st===2){ lf(G.rock,2.5,57.5,1.6,1500,0.85); lf(G.rock,19.5,51.5,1.4,1400,0.85); }
    if(st>=1) gf(G.rock,34,106,1.9,1400,0.85);
    else { gf(G.rock,38,110,1.5,900,0.8); lf(G.rock,3.5,60,1.0,500,0.9); }   // knapp: nur ein paar Brocken
    // Öl: knapp = nichts in Stadtnähe, reich = reich + Zusatzfeld
    const o=lvl(side,'oil'), om=o===2?1.6:1;
    if(o>=1){ lf(G.oil,18.5,58.5,2.2,420*om,0.8); lf(G.oil,3.5,40.5,1.8,380*om,0.8); }
    if(o===2) lf(G.oil,9.5,61,1.5,500,0.85);
    gf(G.oil,44,118,3.2,o===0?400:600,0.8); gf(G.oil,8,102,3,520,0.8);
    // Erz (Metall): knapp = kein Erz in Stadtnähe, reich = größer + Zusatzfeld
    const m=lvl(side,'metal');
    if(m>=1) lf(G.ore,15.5,45.5,m===2?2.0:1.6,m===2?1300:900,0.9);
    if(m===2) lf(G.ore,2.5,46.5,1.4,900,0.9);
    gf(G.ore,42,104,2.4,m===0?800:1200,0.9); gf(G.ore,16,99,2.2,1000,0.9);
  }
  // ---- Umkämpftes: Wildnis links oben (Aldoria | Kastrova) und Flussgrenzen der Nachbarn ----
  blob(PAIR_A,14,46,5,toMeadow); field(PAIR_A,G.rock,8,22,2.4,1800,0.85); field(PAIR_A,G.ore,22,40,2.2,1300,0.9); field(PAIR_A,G.oil,40,60,2.8,700,0.8);
  blob(PAIR_B,58,124,4.5,toMeadow); field(PAIR_B,G.rock,62,138,2.0,1700,0.85); field(PAIR_B,G.ore,60,108,2.0,1200,0.9); field(PAIR_B,G.oil,50,138,2.4,650,0.8);
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
/** linke obere Ecke eines w×h-Gebäudes der Aldoria-Seite für eine Spiegelung */
function rectTf(tf:TF,x,y,w,h){ const [a,b]=tf(x,y), [c,d]=tf(x+w-1,y+h-1); return [Math.min(a,c),Math.min(b,d)]; }
export function setupStart(){
  for(const pid of MAJORS){ const tf=SIDE_TF[pid], [hx,hy]=rectTf(tf,HQ0.x,HQ0.y,3,3);
    placeBuilding(pid,'hq',hx,hy,true);
    const p=G.players[pid]; p.res={money:2500,food:200,wood:200,stone:60,metal:60,oil:0}; p.pop=30;
    for(let i=0;i<2;i++) spawnAt(pid,'inf',...ptf(tf,Lx(12+i),Ly(50+i)));
    for(let i=0;i<CONSTRUCTION.startWorkers;i++) spawnAt(pid,'worker',...ptf(tf,Lx(7+i*0.6),Ly(54.6)));
  }
  const bx=W/2-1, by=H/2-1; placeBuilding(2,'bunker',bx,by,true);
  G.players[2].res={money:1500,food:400,wood:0,stone:0,metal:200,oil:0};
  G.players[3].res={money:0,food:0,wood:0,stone:0,metal:0,oil:0};
  [[-2,2],[3,-1],[-1,-2],[2,3],[-2,-1],[3,2]].forEach(([dx,dy])=>spawnAt(2,'militia',bx+1+dx+0.5,by+1+dy+0.5));
  // Räuberlager in abgelegenen Gebieten (für alle Mächte gleich)
  const camps=(list,tfs)=>{ for(const [x,y] of list) for(const tf of tfs){ const [cx,cy]=tf(x,y), s=campSpot(cx,cy);
    if(s){ const b=placeBuilding(3,'camp',s.x,s.y,true); b.home={x:b.x,y:b.y}; } } };
  camps(BANDITS.camps,HOME); camps(BANDITS.campsA,PAIR_A); camps(BANDITS.campsB,PAIR_B);
  for(const p of G.players) recalcPower(p.id);
}
