import { MAP_H, MAP_W } from '../data/config';

export const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t, dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
export const idx=(x,y)=>y*MAP_W+x, inMap=(x,y)=>x>=0&&y>=0&&x<MAP_W&&y<MAP_H;
export const angDiff=(a,b)=>{let d=b-a;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;};
export const rotTo=(a,b,s)=>{const d=angDiff(a,b);return Math.abs(d)<=s?b:a+Math.sign(d)*s;};
export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function hash(x,y){let h=x*374761393+y*668265263;h=(h^(h>>>13))*1274126177;return ((h^(h>>>16))>>>0)/4294967296;}
export function makeNoise(R,scale){const GW=Math.ceil(MAP_W/scale)+3,g=[];for(let i=0;i<GW*GW;i++)g.push(R());
  const s=t=>t*t*(3-2*t);
  return (x,y)=>{x/=scale;y/=scale;const x0=Math.floor(x),y0=Math.floor(y),fx=s(x-x0),fy=s(y-y0);
    const a=g[y0*GW+x0],b=g[y0*GW+x0+1],c=g[(y0+1)*GW+x0],d=g[(y0+1)*GW+x0+1];
    return lerp(lerp(a,b,fx),lerp(c,d,fx),fy);};}
export const fmt=n=>Math.floor(n).toLocaleString('de-DE');
