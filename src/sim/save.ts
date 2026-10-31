import { mulberry32 } from '../core/util';
import { BUILDINGS, DIFFICULTY, UNITS } from '../data/config';
import { G, setG } from '../sim/state';
import type { Game } from './types';

/* =====================================================================
   Spielstand als Text (ohne DOM – das Ablegen im Browser macht ui/saves.ts)
   ---------------------------------------------------------------------
   • Typed Arrays (Karte, Nebel, Rohstoffe) werden als Base64 gespeichert.
   • Verweise auf Einheiten/Gebäude (Ziel, Baustelle, Begleitung …) werden zu
     {__ref:id} und beim Laden wieder aufgelöst.
   • def (Spielwerte) wird nicht gespeichert, sondern aus config.ts ergänzt –
     so wirken Balance-Änderungen auch auf alte Spielstände.
   ===================================================================== */
export const SAVE_VERSION = 1;
const SKIP = new Set(['terrCanvas','miniBg','haulMap','field','terrChanged','sel','hover','placing','fx','projectiles','reach','reachT','reachV','rng','lastPaint','boxMode','amoveMode','escortMode']);
const TA: Record<string, any> = { Uint8Array, Int32Array, Float32Array, Float64Array };

function toB64(v: ArrayBufferView){ const b=new Uint8Array(v.buffer,v.byteOffset,v.byteLength); let s=''; for(let i=0;i<b.length;i+=0x8000) s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000) as any); return btoa(s); }
function fromB64(type: string, d: string){ const s=atob(d), b=new Uint8Array(s.length); for(let i=0;i<s.length;i++) b[i]=s.charCodeAt(i); return new TA[type](b.buffer); }

export function serialize(g: Game = G): string {
  const topU=g.units, topB=g.buildings;
  return JSON.stringify({v:SAVE_VERSION, g}, function(this: any, k, v){
    if(this===g && SKIP.has(k)) return undefined;
    if(k==='def') return undefined;
    if(v && ArrayBuffer.isView(v)) return {__ta:v.constructor.name, d:toB64(v)};
    if(v && typeof v==='object' && (v.kind==='unit'||v.kind==='building') && typeof v.id==='number' && this!==topU && this!==topB) return {__ref:v.id};
    if(typeof v==='function') return undefined;
    return v;
  });
}
export function deserialize(str: string): Game {
  const o=JSON.parse(str,(k,v)=>v&&typeof v==='object'&&v.__ta?fromB64(v.__ta,v.d):v);
  if(!o||o.v!==SAVE_VERSION) throw new Error('Spielstand passt nicht zu dieser Version');
  const g=o.g, map=new Map();
  for(const e of [...g.units,...g.buildings]) map.set(e.id,e);
  for(const u of g.units) u.def=UNITS[u.type];
  for(const b of g.buildings) b.def=BUILDINGS[b.type];
  g.units=g.units.filter(u=>u.def); g.buildings=g.buildings.filter(b=>b.def);
  const walk=(obj)=>{ for(const k in obj){ const v=obj[k]; if(!v||typeof v!=='object'||ArrayBuffer.isView(v)) continue;
    if('__ref' in v) obj[k]=map.get(v.__ref)||null; else if(!(v.kind==='unit'||v.kind==='building')||obj===g.units||obj===g.buildings) walk(v); } };
  walk(g);
  Object.assign(g,{terrCanvas:null, miniBg:null, fx:[], projectiles:[], sel:[], placing:null, terrChanged:[], roadDirty:true, qDirty:true,
    rng:mulberry32((Math.random()*1e9)|0), paused:false, diff:DIFFICULTY[g.diffKey]||g.diff});
  return g;
}
/** Spielstand laden und aktivieren */
export function loadGame(str: string){ const g=deserialize(str); setG(g); return g; }
/** kurze Beschreibung für die Speicherplatz-Liste */
export function saveMeta(g: Game = G){ return {t:g.t, pop:Math.floor(g.players[0].pop), diff:g.diffKey, date:Date.now(), war:!!g.war}; }
