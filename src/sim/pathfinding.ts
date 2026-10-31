import { clamp, idx, inMap } from '../core/util';
import { MAP_H, MAP_W } from '../data/config';
import { G } from '../sim/state';
import { nearestPassable, passable, tileCost } from '../sim/world';

/* =====================================================================
   Wegfindung (A*)
   ===================================================================== */
export const PF = {g:new Float32Array(MAP_W*MAP_H), from:new Int32Array(MAP_W*MAP_H), stamp:new Int32Array(MAP_W*MAP_H), closed:new Int32Array(MAP_W*MAP_H), cur:0};
export function findPath(sx,sy,gx,gy,cls){
  const N8=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[1,-1,1.414],[-1,1,1.414],[-1,-1,1.414]];
  const start=idx(sx,sy), goal=idx(gx,gy); if(start===goal) return [];
  const st=++PF.cur, heap=[];
  const push=(f,i)=>{heap.push([f,i]);let k=heap.length-1;while(k>0){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p;}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===k)break;[heap[m],heap[k]]=[heap[k],heap[m]];k=m;}}return top;};
  const hfun=(x,y)=>{const dx=Math.abs(x-gx),dy=Math.abs(y-gy);return Math.max(dx,dy)+0.414*Math.min(dx,dy);};
  PF.g[start]=0; PF.stamp[start]=st; PF.from[start]=-1; push(hfun(sx,sy),start);
  let best=start, bestH=hfun(sx,sy), n=0;
  while(heap.length&&n<20000){
    const [,cur]=pop(); if(PF.closed[cur]===st) continue; PF.closed[cur]=st; n++;
    if(cur===goal){best=cur;break;}
    const cx=cur%MAP_W, cy=(cur/MAP_W)|0, hh=hfun(cx,cy); if(hh<bestH){bestH=hh;best=cur;}
    for(const [dx,dy,m] of N8){
      const nx=cx+dx, ny=cy+dy; if(!inMap(nx,ny)) continue; const ni=idx(nx,ny);
      if(PF.closed[ni]===st||G.occ[ni]) continue;
      const c=tileCost(ni,cls); if(c===Infinity) continue;
      if(dx&&dy&&(!passable(cx+dx,cy,cls)||!passable(cx,cy+dy,cls))) continue;
      const ng=PF.g[cur]+m*c;
      if(PF.stamp[ni]!==st||ng<PF.g[ni]){PF.stamp[ni]=st;PF.g[ni]=ng;PF.from[ni]=cur;push(ng+hfun(nx,ny),ni);}
    }
  }
  const out=[]; let k=best; while(k!==-1&&k!==start){out.push({x:k%MAP_W+0.5,y:((k/MAP_W)|0)+0.5});k=PF.from[k];}
  return out.reverse();
}
export function setPath(u,gx,gy){
  const cls=u.def.cls;
  if(cls==='air'){ u.path=[{x:clamp(gx,0.5,MAP_W-0.5),y:clamp(gy,0.5,MAP_H-0.5)}]; u.pathI=0; return; }   // Drohnen fliegen direkt
  let g={x:Math.floor(gx),y:Math.floor(gy)};
  if(!passable(g.x,g.y,cls)){g=nearestPassable(g.x,g.y,cls); if(!g){u.path=[];u.pathI=0;return;}}
  let sx=Math.floor(u.x), sy=Math.floor(u.y);
  if(!passable(sx,sy,cls)){const p=nearestPassable(sx,sy,cls); if(p){sx=p.x;sy=p.y;}}
  u.path=findPath(sx,sy,g.x,g.y,cls); u.pathI=0;
  if(u.path.length&&passable(Math.floor(gx),Math.floor(gy),cls)){const l=u.path[u.path.length-1]; if(Math.floor(l.x)===Math.floor(gx)&&Math.floor(l.y)===Math.floor(gy)){l.x=gx;l.y=gy;}}
}
