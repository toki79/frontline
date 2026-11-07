import { clamp } from '../core/util';
import { BASEVAL, LOT, REGION } from '../data/config';
import { G, isRich, isScarce } from '../sim/state';
import { evMarket } from '../sim/happen';
import { siteLacks } from '../sim/build';
import { addAtt, atWar, attOf, countBuildings, findBuilding } from '../sim/world';

/* =====================================================================
   Markt der Miliz
   ===================================================================== */
// Der Markt sättigt sich: Jeder Verkauf drückt den Preis, jeder Kauf treibt ihn hoch.
// Die Sättigung (sat) ist für beide Nationen gemeinsam und baut sich langsam wieder ab.
export const TRADES = {
  sellOil:  {label:'Öl verkaufen',   sell:true, give:{oil:100},   get:{money:150}, step:0.18, min:0.2},
  buyFood:  {label:'Nahrung kaufen', give:{money:220}, get:{food:100}, step:0.18},
  buyMetal: {label:'Metall kaufen',  give:{money:280}, get:{metal:60}, step:0.18},
  buyWood:  {label:'Holz kaufen',    give:{money:180}, get:{wood:100}, step:0.18},
  buyStone: {label:'Stein kaufen',   give:{money:200}, get:{stone:80}, step:0.18},
};
export const MARKET_RECOVER = 1/30;   // Sättigung sinkt um 1 Stufe pro 30 s
export function marketOpen(pid){return !!findBuilding(2,'bunker')&&!G.militiaWar[pid]&&!!G.known[pid][2];}
export function priceFactor(key){ const t=TRADES[key], s=G.market[key]||0; return (t.sell?Math.max(t.min,1-t.step*s):1+t.step*s)*evMarket(key); }
export function tradeTerms(pid,key): {give: Record<string,number>, get: Record<string,number>}{
  const t=TRADES[key], f=priceFactor(key), friend=G.attitude[pid]>=30?1.15:1, give={}, get={};
  for(const k in t.give) give[k]=t.sell?t.give[k]:Math.round(t.give[k]*f/friend);
  for(const k in t.get)  get[k]=t.sell?Math.round(t.get[k]*f*friend):t.get[k];
  return {give,get};
}
export function trade(pid,key){
  if(!marketOpen(pid)) return false;
  const p=G.players[pid], {give,get}=tradeTerms(pid,key);
  for(const k in give) if(p.res[k]<give[k]) return false;
  for(const k in give) p.res[k]-=give[k]; for(const k in get) p.res[k]+=get[k];
  G.market[key]=(G.market[key]||0)+1;
  G.attitude[pid]=Math.min(100,G.attitude[pid]+1);
  return true;
}
// Wie dringend braucht eine Stadt einen Rohstoff? (>0 = Bedarf, <0 = Überschuss)
export function needLevel(pid,res){
  const p=G.players[pid]; let n=0;
  if(res==='food'){ if(p.foodRate<0) n+=1; if(p.res.food<200) n+=0.6; if(p.res.food>700&&p.foodRate>0.8) n-=1; }
  if(res==='metal'){ const ok=G.buildings.some(b=>!b.dead&&b.owner===pid&&b.type==='mine'&&!b.empty); if(!ok) n+=0.8; if(p.res.metal<120) n+=0.6; if(p.res.metal>450&&ok) n-=1; }
  if(res==='oil'){ const tr=G.units.some(u=>!u.dead&&u.owner===pid&&u.def.harvester); if(!tr) n+=0.4; if(p.res.oil<100) n+=0.5; if(p.res.oil>450) n-=1;
    if(!countBuildings(pid,'factory')) n-=0.8; }   // ohne Fahrzeugwerk wird Öl kaum gebraucht
  if(res==='wood'||res==='stone'){ const src=res==='wood'?'lumber':'quarry', ok=G.buildings.some(b=>!b.dead&&!b.site&&b.owner===pid&&b.type===src&&!b.empty);
    if(!ok) n+=0.7; if(p.res[res]<120) n+=0.6; if(p.res[res]>(p.store||800)*0.7&&ok) n-=1;
    if(G.buildings.some(b=>!b.dead&&b.owner===pid&&b.site&&siteLacks(b)===res)) n+=0.6; }
  if(isScarce(pid,res)) n+=0.6; if(isRich(pid,res)) n-=0.6;
  return clamp(n,-1.5,2.5);
}
// Anfragen einer KI-Macht: kauft, was knapp ist (teuer bei Not), verkauft Überschuss (günstiger, je größer er ist)
export function aiQuotes(pid=1){
  const out=[], A=G.players[pid], att=1+clamp(attOf(pid,0),-50,50)/500;
  for(const r of REGION.res){ const n=needLevel(pid,r), base=BASEVAL[r]*LOT[r];
    if(n>=0.6) out.push({side:'buy',res:r,amt:LOT[r],n,urgent:n>=1.5,price:Math.max(5,Math.round(base*(0.9+0.55*n)*att/5)*5)});
    else if(n<=-0.5&&A.res[r]>=LOT[r]*2) out.push({side:'sell',res:r,amt:LOT[r],n,price:Math.max(5,Math.round(base*(1.25+0.25*n)/att/5)*5)});
  }
  return out;
}
export function tradeAI(pid,side,res){
  if(atWar(0,pid)) return 'krieg';
  if(!G.known[0][pid]) return 'kein';
  const q=aiQuotes(pid).find(q=>q.side===side&&q.res===res); if(!q) return 'kein';
  const P=G.players[0], A=G.players[pid];
  if(side==='buy'){ if(P.res[res]<q.amt) return 'arm'; if(A.res.money<q.price) return 'pleite';
    P.res[res]-=q.amt; A.res[res]+=q.amt; A.res.money-=q.price; P.res.money+=q.price; addAtt(pid,0,q.urgent?6:3); }
  else { if(P.res.money<q.price) return 'arm';
    P.res.money-=q.price; A.res.money+=q.price; A.res[res]-=q.amt; P.res[res]+=q.amt; addAtt(pid,0,2); }
  const ai=G.ais[pid]; (ai.tradedBy=ai.tradedBy||{})[0]=G.t; return 'ok';
}
export function marketTrend(key){ const f=priceFactor(key), t=TRADES[key]; if(t.sell) return f<0.6?' 📉 Markt gesättigt':f<0.95?' ↘':''; return f>1.4?' 📈 knapp':f>1.05?' ↗':''; }
