import { clamp } from '../core/util';
import { MAP_H, MAP_W, TILE } from '../data/config';
import { G } from '../sim/state';
import { cv, mini } from '../ui/dom';

export const cam = {x:0, y:0, zoom:1};
export let dpr = 1, VW = 0, VH = 0;
/* =====================================================================
   Kamera & Eingabe
   ===================================================================== */
export function clampCam(){
  const vw=VW/cam.zoom, vh=VH/cam.zoom, mw=MAP_W*TILE, mh=MAP_H*TILE, m=60;
  cam.x = vw>mw ? (mw-vw)/2 : clamp(cam.x,-m,mw-vw+m);
  cam.y = vh>mh ? (mh-vh)/2 : clamp(cam.y,-m-80,mh-vh+m+130);
}
export function centerOn(x,y){cam.x=x*TILE-VW/cam.zoom/2;cam.y=y*TILE-VH/cam.zoom/2+40;clampCam();}
export function toWorld(sx,sy){return {x:(cam.x+sx/cam.zoom)/TILE,y:(cam.y+sy/cam.zoom)/TILE};}
export function zoomAt(sx,sy,nz){nz=clamp(nz,0.28,2.2);const w=toWorld(sx,sy);cam.zoom=nz;cam.x=w.x*TILE-sx/nz;cam.y=w.y*TILE-sy/nz;clampCam();}
export function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2.5); VW=innerWidth; VH=innerHeight;
  cv.width=Math.round(VW*dpr); cv.height=Math.round(VH*dpr); cv.style.width=VW+'px'; cv.style.height=VH+'px';
  mini.width=Math.round(124*dpr); mini.height=Math.round(124*dpr);
  if(G) clampCam();
}

export function init(){
addEventListener('resize',resize);
}
