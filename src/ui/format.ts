import { RES } from '../data/config';

export function costHtml(c){return Object.entries(c).map(([k,v])=>(k==='money'?'$':RES[k].icon)+v).join(' ')||'–';}
export const f1=n=>(Math.round(n*10)/10).toLocaleString('de-DE');
export function costLong(c){return Object.entries(c).map(([k,v])=>`${k==='money'?'$':RES[k].icon}${v} ${RES[k].name}`).join(', ')||'kostenlos';}
