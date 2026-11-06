import { hash, idx, inMap } from '../core/util';
import { MAP_H, MAP_W, T, TERRAIN, TILE } from '../data/config';
import { G } from '../sim/state';

/* =====================================================================
   Gelände in Kacheln (16×16 Felder) – gezeichnet, wenn sie ins Bild kommen
   ---------------------------------------------------------------------
   • Boden: je Feld eine Farbe, weich ineinander geblendet (kleines Bild,
     geglättet hochskaliert) + großflächige Helligkeit + Körnung.
   • Darauf: Grashalme, Blumen, Pfützen, Ruinen, Ufer und Bäume mit Schatten.
   • Drei Auflösungen je nach Zoom; ein kleiner Speicher hält zuletzt
     benutzte Kacheln, geänderte Felder zeichnen nur ihre Kachel neu.
   ===================================================================== */
const CH = 16, CW = Math.ceil(MAP_W/CH), CHH = Math.ceil(MAP_H/CH);
const LEVELS = [0.25, 0.5, 1, 2];
const BUDGET = 160e6;   // Bytes für zwischengespeicherte Kacheln
type Chunk = {cv: HTMLCanvasElement, used: number, bytes: number};
let cache = new Map<string, Chunk>(), dirty = new Set<number>(), bytes = 0, grain: HTMLCanvasElement | null = null, frame = 0;

/* ---------- Farben ---------- */
const hex = (h: string) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const BASE: Record<number, number[][]> = {};
for(let t=0;t<TERRAIN.length;t++) BASE[t]=TERRAIN[t].col.map(hex);
BASE[T.FOREST]=[hex('#3d5a2b'),hex('#3a5629')];   // Waldboden
BASE[T.WATER]=[hex('#2f566a')]; BASE[T.BRIDGE]=[hex('#2f566a')];
BASE[T.TOWN]=[hex('#7d7a66'),hex('#787461')];
/** weiches Rauschen für großflächige Helligkeit (deterministisch, ohne Zufallsgenerator) */
function vnoise(x: number, y: number){
  const xi=Math.floor(x), yi=Math.floor(y), fx=x-xi, fy=y-yi, s=(t:number)=>t*t*(3-2*t);
  const a=hash(xi,yi), b=hash(xi+1,yi), c=hash(xi,yi+1), d=hash(xi+1,yi+1), u=s(fx), v=s(fy);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
const light = (x: number, y: number) => 0.92 + 0.16*(vnoise(x/9+31, y/9+17)*0.65 + vnoise(x/3.5+5, y/3.5+9)*0.35);
const terrAt = (x: number, y: number) => G.terr[idx(Math.max(0,Math.min(MAP_W-1,x)), Math.max(0,Math.min(MAP_H-1,y)))];
const isWet = (t: number) => t===T.WATER || t===T.BRIDGE;

/** feine Körnung (einmal erzeugt, als Muster über den Boden gelegt) */
function makeGrain(){
  const N=256, c=document.createElement('canvas'); c.width=c.height=N; const g=c.getContext('2d'), im=g.createImageData(N,N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){ const v=(hash(x*7+1,y*13+3)-0.5)*0.6+(vnoise(x/6,y/6)-0.5)*0.9, k=(y*N+x)*4, l=128+v*80;
    im.data[k]=im.data[k+1]=im.data[k+2]=Math.max(0,Math.min(255,l)); im.data[k+3]=255; }
  g.putImageData(im,0,0); return c;
}

/* ---------- eine Kachel zeichnen ---------- */
function renderChunk(cx: number, cy: number, s: number){
  const x0=cx*CH, y0=cy*CH, P=Math.ceil(CH*TILE*s);
  const cv=document.createElement('canvas'); cv.width=cv.height=P; const g=cv.getContext('2d');
  // 1) Boden: (CH+2)² Farbpunkte, geglättet hochskaliert -> weiche Übergänge
  const lo=document.createElement('canvas'); lo.width=lo.height=CH+2; const lg=lo.getContext('2d'), im=lg.createImageData(CH+2,CH+2);
  for(let j=0;j<CH+2;j++)for(let i=0;i<CH+2;i++){ const x=x0+i-1, y=y0+j-1, t=terrAt(x,y), cols=BASE[t], c=cols[Math.floor(hash(x,y)*cols.length)%cols.length];
    const L=isWet(t)?1:light(x,y), k=(j*(CH+2)+i)*4; im.data[k]=c[0]*L; im.data[k+1]=c[1]*L; im.data[k+2]=c[2]*L; im.data[k+3]=255; }
  lg.putImageData(im,0,0);
  g.imageSmoothingEnabled=true; (g as any).imageSmoothingQuality='high';
  g.drawImage(lo,0,0,CH+2,CH+2,-TILE*s,-TILE*s,(CH+2)*TILE*s,(CH+2)*TILE*s);
  g.scale(s,s); g.translate(-x0*TILE,-y0*TILE);
  // 2) Körnung
  if(!grain) grain=makeGrain();
  g.save(); g.globalAlpha=0.22; g.globalCompositeOperation='overlay'; g.fillStyle=g.createPattern(grain,'repeat'); g.fillRect(x0*TILE,y0*TILE,CH*TILE,CH*TILE); g.restore();
  // 3) Einzelheiten je Feld (mit einem Feld Rand, damit Bäume und Ufer über die Kachelkante reichen)
  const X0=Math.max(0,x0-1), Y0=Math.max(0,y0-1), X1=Math.min(MAP_W-1,x0+CH), Y1=Math.min(MAP_H-1,y0+CH);
  for(let y=Y0;y<=Y1;y++)for(let x=X0;x<=X1;x++) ground(g,x,y);
  water(g,X0,Y0,X1,Y1);
  trees(g,X0,Y0,X1,Y1);
  return cv;
}
/** Bodendetails eines Feldes */
function ground(g: CanvasRenderingContext2D, x: number, y: number){
  const t=G.terr[idx(x,y)], px=x*TILE, py=y*TILE, h=hash(x,y);
  if(t===T.GRASS||t===T.MEADOW){
    const n=t===T.MEADOW?7:5; g.lineWidth=1.1; g.lineCap='round';
    for(let i=0;i<n;i++){ const hx=hash(x*7+i,y*3)*30+1, hy=hash(y*5+i,x*11)*28+3, l=2.5+hash(x+i,y*7)*3, lean=(hash(x*3,y+i)-0.5)*2.4;
      g.strokeStyle=t===T.MEADOW?(i%3===0?'#7fb352':i%3===1?'#4b7a2d':'#6a9c40'):(i%2?'#86955a':'#5c6a38');
      g.beginPath(); g.moveTo(px+hx,py+hy); g.lineTo(px+hx+lean,py+hy-l); g.moveTo(px+hx+1.6,py+hy); g.lineTo(px+hx+1.6+lean*0.6,py+hy-l*0.75); g.stroke(); }
    if(t===T.MEADOW) for(let i=0;i<3;i++){ const hx=hash(x*13+i,y*7), hy=hash(y*17+i,x*3), k=hash(x+i,y*3);
      g.fillStyle=k<0.4?'#f2e27a':k<0.75?'#f6f2ea':'#c9a3e6'; g.beginPath(); g.arc(px+3+hx*26,py+3+hy*26,1.4,0,7); g.fill(); }
    else if(h<0.18){ g.fillStyle='rgba(60,55,40,.35)'; g.beginPath(); g.ellipse(px+8+h*80,py+20,2.2,1.5,0,0,7); g.fill(); g.fillStyle='#a49a80'; g.beginPath(); g.ellipse(px+7.6+h*80,py+19.4,2,1.3,0,0,7); g.fill(); }   // Kiesel
  } else if(t===T.MUD){
    for(let i=0;i<3;i++){ const hx=hash(x*9+i,y), hy=hash(y*3+i,x*2), rx=5+hx*4, ry=3+hy*2;
      g.fillStyle='rgba(55,42,24,.55)'; g.beginPath(); g.ellipse(px+6+hx*20,py+6+hy*20,rx,ry,hx*3,0,7); g.fill();
      if(i===0){ g.fillStyle='rgba(120,140,150,.28)'; g.beginPath(); g.ellipse(px+5+hx*20,py+5+hy*20,rx*0.55,ry*0.45,hx*3,0,7); g.fill(); } }   // Pfütze mit Glanz
    g.strokeStyle='rgba(40,30,15,.45)'; g.lineWidth=1; g.beginPath(); g.moveTo(px+2,py+10+h*10); g.quadraticCurveTo(px+16,py+8+hash(y,x)*14,px+30,py+14+hash(y,x)*10); g.stroke();
  } else if(t===T.TOWN){
    if(h<0.7){ const w=11+hash(x*2,y)*11, hh=9+hash(x,y*2)*9, ox=2+hash(x*5,y)*(TILE-w-4), oy=2+hash(x,y*5)*(TILE-hh-4), cl=h<0.25?'#9a5b45':h<0.5?'#857767':'#a08b6a';
      g.fillStyle='rgba(0,0,0,.28)'; g.fillRect(px+ox+3,py+oy+4,w,hh);
      g.fillStyle=cl; g.fillRect(px+ox,py+oy,w,hh);
      g.fillStyle='rgba(255,255,255,.12)'; g.fillRect(px+ox,py+oy,w,2);
      if(h<0.4){ g.fillStyle='#3d362c'; g.fillRect(px+ox+w*0.3,py+oy+hh*0.25,w*0.4,hh*0.5); }   // eingestürztes Dach
      g.strokeStyle='rgba(0,0,0,.35)'; g.lineWidth=1; g.strokeRect(px+ox+0.5,py+oy+0.5,w-1,hh-1); }
    for(let i=0;i<3;i++){ g.fillStyle=i%2?'#8d8676':'#6d675a'; g.fillRect(px+hash(x*3+i,y)*28,py+hash(y*5,x+i)*28,2.5,2); }   // Schutt
  }
}
/** Wasser mit weichem Ufer (Uferstreifen, flaches und tiefes Wasser) und Brücken */
function water(g: CanvasRenderingContext2D, X0: number, Y0: number, X1: number, Y1: number){
  const W=(x:number,y:number)=>!inMap(x,y)||isWet(G.terr[idx(x,y)]);
  const shape=(x:number,y:number,ins:number)=>{   // Feld mit gerundeten Ecken zum Land hin, an Landseiten eingerückt
    const px=x*TILE, py=y*TILE, fl=!W(x-1,y), fr=!W(x+1,y), fu=!W(x,y-1), fd=!W(x,y+1);
    const l=fl?ins:0, r=fr?ins:0, u=fu?ins:0, d=fd?ins:0, R=TILE*0.42, a=fl&&fu?R:0, b=fr&&fu?R:0, c=fr&&fd?R:0, e=fl&&fd?R:0;
    const x0=px+l, y0=py+u, x1=px+TILE-r, y1=py+TILE-d;
    g.moveTo(x0+a,y0); g.lineTo(x1-b,y0); b?g.arcTo(x1,y0,x1,y0+b,b):g.lineTo(x1,y0); g.lineTo(x1,y1-c); c?g.arcTo(x1,y1,x1-c,y1,c):g.lineTo(x1,y1);
    g.lineTo(x0+e,y1); e?g.arcTo(x0,y1,x0,y1-e,e):g.lineTo(x0,y1); g.lineTo(x0,y0+a); a?g.arcTo(x0,y0,x0+a,y0,a):g.lineTo(x0,y0); g.closePath(); };
  const wet=[]; for(let y=Y0;y<=Y1;y++)for(let x=X0;x<=X1;x++) if(isWet(G.terr[idx(x,y)])) wet.push([x,y]);
  if(!wet.length) return;
  const pass=(ins:number,fill:string|CanvasGradient)=>{ g.beginPath(); for(const [x,y] of wet) shape(x,y,ins); g.fillStyle=fill; g.fill(); };
  pass(-3,'#8a8160');        // feuchter Uferstreifen (ragt 3 px ins Land)
  pass(0,'#4d8191');         // flaches Wasser
  pass(5,'#36687c');         // tiefer
  pass(10,'#2c5a6e');        // Flussmitte
  // Brücken: je Brücke ein durchgehendes Holzdeck in Laufrichtung (auch schräg)
  const x0=X0*TILE, y0=Y0*TILE, x1=(X1+1)*TILE, y1=(Y1+1)*TILE;
  for(const br of bridgeList()) if(br.bx1>x0&&br.bx0<x1&&br.by1>y0&&br.by0<y1) drawDeck(g,br);
}
/** Brücken als Ganzes erkennen: zusammenhängende Brückenfelder, Laufrichtung = Richtung, in der beide Enden an Land stoßen */
let bridges=null;
function bridgeList(){
  if(bridges) return bridges; bridges=[];
  const seen=new Uint8Array(MAP_W*MAP_H), land=(x,y)=>inMap(x,y)&&!isWet(G.terr[idx(x,y)]);
  const DIRS=[[1,0],[0,1],[Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2]];
  for(let i=0;i<G.terr.length;i++){ if(G.terr[i]!==T.BRIDGE||seen[i]) continue;
    const comp=[], st=[i]; seen[i]=1;
    while(st.length){ const c=st.pop(), cx=c%MAP_W, cy=(c/MAP_W)|0; comp.push([cx+0.5,cy+0.5]);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ const x=cx+dx,y=cy+dy; if(!inMap(x,y)) continue; const k=idx(x,y); if(!seen[k]&&G.terr[k]===T.BRIDGE){ seen[k]=1; st.push(k); } } }
    let best=DIRS[0], bs=-1;
    for(const d of DIRS){ const sx=Math.sign(Math.round(d[0]*2)), sy=Math.sign(Math.round(d[1]*2)); let sc=0;
      for(const [x,y] of comp){ const tx=Math.floor(x), ty=Math.floor(y); if(land(tx+sx,ty+sy)) sc++; if(land(tx-sx,ty-sy)) sc++; }
      if(sc>bs){ bs=sc; best=d; } }
    const [ux,uy]=best, vx=-uy, vy=ux; let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9;
    for(const [x,y] of comp){ const u=x*ux+y*uy, v=x*vx+y*vy; u0=Math.min(u0,u); u1=Math.max(u1,u); v0=Math.min(v0,v); v1=Math.max(v1,v); }
    const diag=ux!==0&&uy!==0, um=(u0+u1)/2, vm=(v0+v1)/2, mx=um*ux+vm*vx, my=um*uy+vm*vy;
    const len=(u1-u0+(diag?1.9:1.3))*TILE, wid=(v1-v0+(diag?0.55:0.9))*TILE, rad=Math.hypot(len,wid)/2+8;
    bridges.push({x:mx*TILE, y:my*TILE, a:Math.atan2(uy,ux), len, wid, bx0:mx*TILE-rad, bx1:mx*TILE+rad, by0:my*TILE-rad, by1:my*TILE+rad}); }
  return bridges;
}
function drawDeck(g: CanvasRenderingContext2D, br){
  const L=br.len, Wd=br.wid;
  g.save(); g.translate(br.x,br.y); g.rotate(br.a);
  g.fillStyle='rgba(0,0,0,.32)'; g.fillRect(-L/2+3,-Wd/2+5,L,Wd);            // Schatten aufs Wasser
  for(let k=-L/2+6;k<L/2-3;k+=TILE*0.9){ g.fillStyle='#3e3022'; g.fillRect(k,-Wd/2-1.5,3,Wd+3); }   // Pfähle
  g.fillStyle='#8c785a'; g.fillRect(-L/2,-Wd/2,L,Wd);
  g.strokeStyle='rgba(70,54,38,.85)'; g.lineWidth=1; g.beginPath();
  for(let k=-L/2+4;k<L/2;k+=4.5){ g.moveTo(k,-Wd/2+2); g.lineTo(k,Wd/2-2); } g.stroke();
  for(let k=-L/2+4;k<L/2;k+=13.5){ g.fillStyle=`rgba(255,240,210,${0.05+0.06*hash(Math.round(k),3)})`; g.fillRect(k,-Wd/2+2,4.5,Wd-4); }
  g.fillStyle='#5a4632'; g.fillRect(-L/2,-Wd/2,L,3); g.fillRect(-L/2,Wd/2-3,L,3);   // Geländer
  g.fillStyle='rgba(255,240,210,.18)'; g.fillRect(-L/2,-Wd/2,L,1.2);
  g.restore();
}
/** Bäume: erst alle Schatten, dann die Kronen von oben nach unten */
function trees(g: CanvasRenderingContext2D, X0: number, Y0: number, X1: number, Y1: number){
  const L=[];
  for(let y=Y0;y<=Y1;y++)for(let x=X0;x<=X1;x++){ if(G.terr[idx(x,y)]!==T.FOREST) continue;
    const n=3+(hash(x*5,y*9)<0.4?1:0);
    for(let i=0;i<n;i++){ const hx=hash(x*3+i,y*7), hy=hash(y*13+i,x*5), r=6.5+hash(x+i,y)*4.5;
      L.push({x:x*TILE+5+hx*22, y:y*TILE+5+hy*22, r, k:hash(x*11+i,y*17+i)}); } }
  L.sort((a,b)=>a.y-b.y);
  g.fillStyle='rgba(10,20,5,.32)';
  for(const t of L){ g.beginPath(); g.ellipse(t.x+t.r*0.5,t.y+t.r*0.6,t.r*1.05,t.r*0.8,0.5,0,7); g.fill(); }
  for(const t of L){
    if(t.k<0.3){   // Nadelbaum: dunkle Sternkrone
      g.fillStyle='#24401e'; g.beginPath(); const sp=9; for(let j=0;j<sp*2;j++){ const a=j/(sp*2)*Math.PI*2, rr=j%2?t.r*0.62:t.r; g.lineTo(t.x+Math.cos(a)*rr,t.y+Math.sin(a)*rr); } g.closePath(); g.fill();
      g.fillStyle='#355a2a'; g.beginPath(); g.arc(t.x-t.r*0.18,t.y-t.r*0.2,t.r*0.5,0,7); g.fill();
      g.fillStyle='#4a7336'; g.beginPath(); g.arc(t.x-t.r*0.3,t.y-t.r*0.32,t.r*0.2,0,7); g.fill();
    } else {      // Laubbaum: runde Krone mit Licht von links oben
      const gr=g.createRadialGradient(t.x-t.r*0.4,t.y-t.r*0.45,t.r*0.1,t.x,t.y,t.r*1.05);
      const hi=t.k<0.65?['#6d9a48','#3f6a2c','#2a4a1f']:['#7fa34e','#4b7533','#30521f'];
      gr.addColorStop(0,hi[0]); gr.addColorStop(0.55,hi[1]); gr.addColorStop(1,hi[2]);
      g.fillStyle=gr; g.beginPath(); g.arc(t.x,t.y,t.r,0,7); g.fill();
      g.fillStyle='rgba(255,255,220,.10)'; for(let j=0;j<3;j++){ const a=t.k*20+j*2.1; g.beginPath(); g.arc(t.x+Math.cos(a)*t.r*0.45-t.r*0.15,t.y+Math.sin(a)*t.r*0.45-t.r*0.15,t.r*0.28,0,7); g.fill(); }
    } }
}

/* ---------- Verwaltung ---------- */
/** Kartenwechsel: Speicher leeren, Übersichtskarte neu */
export function renderTerrain(){
  cache=new Map(); dirty=new Set(); bytes=0; bridges=null;
  G.terrCanvas={chunks:true};   // Merker: Gelände ist vorbereitet (wird nicht gespeichert)
  const m=document.createElement('canvas'); m.width=MAP_W; m.height=MAP_H; const mg=m.getContext('2d');
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){const t=G.terr[idx(x,y)]; mg.fillStyle=t===T.BRIDGE?'#a08a64':TERRAIN[t].col[0]; mg.fillRect(x,y,1,1);}
  G.miniBg=m;
}
/** Einzelnes Feld geändert (z. B. abgeholzter Wald → Steppe): betroffene Kacheln neu zeichnen */
export function repaintTile(i: number){
  const x=i%MAP_W, y=(i/MAP_W)|0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ const cx=Math.floor((x+dx)/CH), cy=Math.floor((y+dy)/CH); if(cx>=0&&cy>=0&&cx<CW&&cy<CHH) dirty.add(cy*CW+cx); }
  if(G.miniBg){ const mg=G.miniBg.getContext('2d'); mg.fillStyle=TERRAIN[G.terr[i]].col[0]; mg.fillRect(x,y,1,1); }
}
function evict(){
  if(bytes<=BUDGET) return;
  const L=[...cache.entries()].sort((a,b)=>a[1].used-b[1].used);
  for(const [k,c] of L){ if(bytes<=BUDGET*0.8) break; if(c.used===frame) continue; cache.delete(k); bytes-=c.bytes; }
}
/** sichtbare Kacheln zeichnen (Weltkoordinaten in Feldern, scale = Bildpunkte je Weltpixel) */
export function drawTerrain(c: CanvasRenderingContext2D, vx0: number, vy0: number, vx1: number, vy1: number, scale: number){
  frame++;
  const lv=LEVELS.find(l=>l>=scale*0.9)||LEVELS[LEVELS.length-1];
  // geänderte Kacheln verwerfen
  if(dirty.size){ for(const n of dirty) for(const l of LEVELS){ const k=n+'@'+l, ch=cache.get(k); if(ch){ cache.delete(k); bytes-=ch.bytes; } } dirty.clear(); }
  let fresh=0;
  const cx0=Math.max(0,Math.floor(vx0/CH)), cy0=Math.max(0,Math.floor(vy0/CH)), cx1=Math.min(CW-1,Math.floor(vx1/CH)), cy1=Math.min(CHH-1,Math.floor(vy1/CH));
  for(let cy=cy0;cy<=cy1;cy++)for(let cx=cx0;cx<=cx1;cx++){
    const n=cy*CW+cx; let ch=cache.get(n+'@'+lv);
    if(!ch){ // pro Bild nur wenige neue Kacheln in voller Auflösung, sonst vorerst eine gröbere
      const alt=fresh>=3?LEVELS.map(l=>cache.get(n+'@'+l)).find(Boolean):null;
      if(alt) ch=alt; else { const cv=renderChunk(cx,cy,lv); ch={cv,used:frame,bytes:cv.width*cv.height*4}; cache.set(n+'@'+lv,ch); bytes+=ch.bytes; fresh++; } }
    ch.used=frame;
    c.drawImage(ch.cv,cx*CH*TILE,cy*CH*TILE,CH*TILE,CH*TILE);
  }
  evict();
}
/** bewegtes Wasser: Lichtreflexe ziehen mit der Strömung */
export function drawWaterAnim(c: CanvasRenderingContext2D, tx0: number, ty0: number, tx1: number, ty1: number, t: number){
  c.lineCap='round'; c.lineWidth=1.4;
  for(let y=ty0;y<=ty1;y++)for(let x=tx0;x<=tx1;x++){ if(G.terr[idx(x,y)]!==T.WATER) continue;
    const h=hash(x,y), ph=(t*0.35+h)%1, a=Math.sin(ph*Math.PI)*0.38;
    if(a<0.04) continue;
    const px=x*TILE+4+h*20, py=y*TILE+6+hash(y,x)*20+ph*6;
    c.strokeStyle=`rgba(190,225,235,${a})`; c.beginPath(); c.moveTo(px,py); c.quadraticCurveTo(px+4,py-2,px+8,py); c.stroke();
    if(h<0.4){ const p2=(ph+0.5)%1, a2=Math.sin(p2*Math.PI)*0.3; c.strokeStyle=`rgba(190,225,235,${a2})`; c.beginPath(); c.moveTo(px+10,py+9-p2*4); c.quadraticCurveTo(px+13,py+7-p2*4,px+16,py+9-p2*4); c.stroke(); } }
}
