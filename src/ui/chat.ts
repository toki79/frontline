import { $ } from './dom';
import { AI_CHAR, PACT } from '../data/config';
import { G } from '../sim/state';
import { atWar, attOf } from '../sim/world';
import { Deal, conclude, dealText, judge, pactTargets, pactWith, whyText } from '../sim/pacts';
import { applyMood, chatLog, envoyPrompt, readEnvoy } from '../ai/envoy';
import { parseDecision } from '../ai/strategist';
import { activeModel, complete, hint, llmCfg, openLLM, ready, sourceName } from './llm';
import { renderDiplo } from './diplomacy';

/* =====================================================================
   Verhandeln mit Varek oder Mirela
   ---------------------------------------------------------------------
   Immer möglich: ein Angebot zusammenstellen (Bündnis gegen die dritte
   Macht, Nichtangriffspakt, Lagebericht) – die KI nimmt an, nennt einen
   Preis oder lehnt ab. Mit Sprachmodell (🧠 KI-Strategen) zusätzlich
   freier Text. Jeder Abschluss wird von der Spiellogik geprüft.
   ===================================================================== */
let cur=-1, busy=false;
const esc=s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const bs: Record<number,Deal> = {};
const builder=f=>{ const t=pactTargets(f); const b=bs[f]||(bs[f]={kind:'joint', target:t[0], join:true, money:0}); if(b.kind!=='nap'&&!t.includes(b.target)) b.target=t[0]; return b; };
const say=(f,key,v={})=>{ let s=AI_CHAR[f].say[key]||''; for(const k in v) s=s.replace('{'+k+'}',v[k]); return s.replace(/^„|“$/g,''); };
const push=(f,m)=>{ const L=chatLog(f); L.push(m); if(L.length>40) L.splice(0,L.length-40); };
function card(f,m,i){
  if(!m.d) return '';
  if(m.st) return `<div class="deal ${m.st}">${esc(dealText(f,m.d))} – ${m.st==='ja'?'✓ abgeschlossen':'✗ abgelehnt'}</div>`;
  const j=judge(f,m.d);
  return `<div class="deal">${esc(dealText(f,m.d))}<div class="row"><button data-acc="${i}" ${m.d.money>G.players[0].res.money?'disabled':''}>🤝 Einschlagen${m.d.money>0?` (−${m.d.money} $)`:m.d.money<0?` (+${-m.d.money} $)`:''}</button><button data-rej="${i}" class="no">Ablehnen</button></div>${j.ok?'':'<div class="dim" style="font-size:12px">Der Rat hat Bedenken – ob es gilt, zeigt sich beim Einschlagen.</div>'}</div>`;
}
function render(){
  const f=cur; if(f<0||!G) return; const A=G.players[f], P=G.players[0], c=llmCfg.ais[f], llm=ready(c), war=atWar(0,f), pc=pactWith(f), b=builder(f), T=pactTargets(f);
  $('#chatTitle').textContent=`💬 ${A.leader} · ${A.short}`;
  $('#chatSub').innerHTML=`${AI_CHAR[f].label} · Haltung gegenüber Aldoria ${Math.round(attOf(f,0))} · ${war?'⚔ Krieg':'Frieden'}${pc?` · 🤝 ${esc(dealText(f,pc))} (noch ${Math.max(1,Math.round((pc.until-G.t)/60))} min)`:''}${G.pactBreaks?` · gebrochene Abmachungen: ${G.pactBreaks}`:''}`;
  const L=chatLog(f);
  $('#chatLog').innerHTML=(L.length?L.map((m,i)=>m.w==='a'?`<div class="cm me">${esc(m.t)}</div>`:m.w==='k'?`<div class="cm them"><b>${esc(A.leader)}:</b> ${esc(m.t)}${card(f,m,i)}</div>`:`<div class="cm sys">${esc(m.t)}</div>`).join(''):
    `<div class="cm sys">Botschaften gehen über Kuriere – das Spiel ist pausiert. Stellt unten ein Angebot zusammen${llm?' oder schreibt frei':''}.</div>`)+(busy?`<div class="cm them typing">${esc(A.leader)} schreibt …</div>`:'');
  const lg=$('#chatLog'); lg.scrollTop=lg.scrollHeight;
  const seg=(k,v,lab,on,en=true)=>`<button data-b="${k}" data-v="${v}" class="${on?'on':''}" ${en?'':'disabled'}>${lab}</button>`;
  let h='';
  if(war) h+='<div class="barl"><span>Im Krieg gibt es keine Abmachungen – erst Frieden schließen (Diplomatie → Frieden anbieten).</span></div>';
  else if(pc) h+='<div class="barl"><span>Es läuft bereits eine Abmachung. Eine neue ist erst danach möglich.</span></div>';
  else {
    h+='<div class="row">'+seg('kind','joint','⚔ Gemeinsam gegen …',b.kind==='joint',T.length>0)+seg('kind','nap','🕊 Nichtangriffspakt',b.kind==='nap')+seg('kind','intel','🕵 Lagebericht über …',b.kind==='intel',T.length>0)+'</div>';
    if(b.kind!=='nap'){ if(!T.length) h+='<div class="barl"><span>Ihr kennt noch keine dritte Macht.</span></div>'; else h+='<div class="row">'+T.map(x=>seg('target',x,G.players[x].short,b.target===x)).join('')+(b.kind==='joint'?seg('join','1','wir greifen mit an',b.join)+seg('join','0','nur ihr greift an',!b.join):'')+'</div>'; }
    h+='<div class="row">'+[-400,-200,0,200,400,800,1500].map(m=>seg('money',m,m<0?`sie zahlen ${-m} $`:m?`wir zahlen ${m} $`:'ohne Geld',b.money===m,m<=0||P.res.money>=m)).join('')+'</div>';
    h+=`<div class="row"><button id="chatPropose" class="go" ${T.length||b.kind==='nap'?'':'disabled'}>📜 Vorschlagen: ${esc(dealText(f,b))}</button></div>`;
    if(b.kind==='joint') h+=`<div class="barl"><span>${b.join?`Aldoria erklärt ${G.players[b.target]?.short||'dem Ziel'} sofort mit den Krieg. `:''}Bis zum Ende gilt: kein Krieg zwischen euch${b.join?' und kein Separatfrieden':''}. Wortbruch verärgert ${A.short} schwer – und spricht sich herum.</span></div>`;
  }
  $('#chatDeal').innerHTML=h;
  const inp=$('#chatIn') as HTMLInputElement, send=$('#chatSend') as HTMLButtonElement;
  inp.disabled=!llm||busy; send.disabled=!llm||busy;
  inp.placeholder=llm?`Nachricht an ${A.leader} …`:'Freier Text braucht ein Sprachmodell';
  $('#chatHint').innerHTML='<span>'+(llm?`Antwortet über ${esc(activeModel(c))} · ${esc(sourceName(c))}. Vorschläge des Modells prüft die Spiellogik beim Einschlagen.`:`Für freien Text unter <button id="chatLLM" class="link">🧠 KI-Strategen</button> für ${esc(A.short)} Ollama oder ein Cloud-Modell wählen (kostenlos mit Ollama oder Gratis-Kontingent). Angebote funktionieren auch ohne.`)+'</span>';
}
/** Angebot aus dem Baukasten: Ja, Preis oder Nein – ohne Sprachmodell, sofort */
function propose(){
  const f=cur, d={...builder(f)}; push(f,{w:'a', t:`Vorschlag: ${dealText(f,d)}.`});
  const j=judge(f,d);
  if(j.ok){ const r=conclude(f,d) as any;
    if(r.ok) push(f,{w:'k', t:d.kind==='intel'?say(f,'intelYes'):say(f,'pactYes'), d, st:'ja'});
    else push(f,{w:'s', t:`Kam nicht zustande: ${r.why.map(whyText).join(', ')}.`});
    if(r.report) push(f,{w:'s', t:'🕵 '+r.report}); }
  else if(j.need!==null){ const c={...d, money:j.need}; push(f,{w:'k', t:j.need<0?say(f,'pactPay',{preis:-j.need}):say(f,'pactPrice',{preis:j.need}), d:c}); }
  else push(f,{w:'k', t:`${say(f,'pactNo')} (${j.why.map(whyText).join(', ')})`});
  render(); renderDiplo();
}
function accept(i,yes){
  const f=cur, m=chatLog(f)[i]; if(!m||!m.d||m.st) return;
  if(!yes){ m.st='nein'; push(f,{w:'a', t:'Abgelehnt.'}); render(); return; }
  const r=conclude(f,m.d) as any;
  if(r.ok){ m.st='ja'; push(f,{w:'s', t:`🤝 Abgeschlossen: ${dealText(f,m.d)}.`}); if(r.report) push(f,{w:'s', t:'🕵 '+r.report}); }
  else push(f,{w:'s', t:r.why.includes('geld')?'Dafür reicht eure Kasse nicht.':`Der Rat von ${G.players[f].short} verwirft das: ${r.why.map(whyText).join(', ')}${r.need!==null&&r.need!==undefined?` (verlangt ${r.need<0?`höchstens ${-r.need} $ Zuschuss`:`mindestens ${r.need} $`})`:''}.`});
  render(); renderDiplo();
}
/** freie Nachricht über das Sprachmodell */
async function send(){
  const f=cur, inp=$('#chatIn') as HTMLInputElement, text=inp.value.trim(), c=llmCfg.ais[f]; if(!text||busy||!ready(c)) return;
  const g=G, pr=envoyPrompt(f,text,c.persona); push(f,{w:'a', t:text}); inp.value=''; busy=true; render();
  try{ const raw=await complete(c,pr.system,pr.user,pr.schema,c.timeout); if(G!==g) return;
    const o=readEnvoy(f,parseDecision(raw)); if(!o) throw new Error('Antwort war kein gültiges JSON');
    const mood=applyMood(f,o.mood);
    push(f,{w:'k', t:o.text||'…', d:o.deal&&!(o.deal.kind!=='nap'&&o.deal.target===undefined)?o.deal:null});
    if(mood<=-3) push(f,{w:'s', t:`${G.players[f].short} ist verstimmt (Haltung ${mood}).`});
  }catch(e){ if(G===g) push(f,{w:'s', t:'⚠ Keine Antwort: '+hint(e,c)+' – Angebote über den Baukasten gehen trotzdem.'}); }
  finally{ busy=false; if(G===g&&cur===f){ render(); renderDiplo(); (inp as HTMLInputElement).focus(); } }
}
export function openChat(f){ if(!G) return; cur=f; render(); $('#chat').classList.remove('hidden'); setTimeout(()=>{ const i=$('#chatIn') as HTMLInputElement; if(!i.disabled) i.focus(); },30); }
function close(){ $('#chat').classList.add('hidden'); cur=-1; renderDiplo(); }
export function init(){
  $('#bChatClose').addEventListener('click',close);
  document.addEventListener('llmclosed',()=>{ if(cur>=0) render(); });
  $('#chatSend').addEventListener('click',send);
  $('#chatIn').addEventListener('keydown',e=>{ if((e as KeyboardEvent).key==='Enter'){ e.preventDefault(); send(); } });
  $('#chat').addEventListener('click',e=>{ const t=e.target as HTMLElement;
    if(t.id==='chatLLM'){ openLLM(); return; }
    if(t.id==='chatPropose'){ propose(); return; }
    const a=t.closest('[data-acc],[data-rej]') as HTMLElement; if(a){ accept(Number(a.dataset.acc??a.dataset.rej),a.dataset.acc!==undefined); return; }
    const s=t.closest('button[data-b]') as HTMLElement; if(s&&cur>=0){ const b=builder(cur), k=s.dataset.b, v=s.dataset.v;
      if(k==='kind') b.kind=v as any; else if(k==='target') b.target=Number(v); else if(k==='join') b.join=v==='1'; else if(k==='money') b.money=Number(v);
      if(b.kind!=='joint'&&b.money<0) b.money=0; render(); } });
}
