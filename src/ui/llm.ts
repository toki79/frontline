import { $ } from './dom';
import { msg } from '../core/events';
import { AIS, AI_CHAR, STRATEGIST } from '../data/config';
import { G } from '../sim/state';
import { applyDecision, parseDecision, strategistPrompt } from '../ai/strategist';

/* =====================================================================
   LLM-Strategen: eingebaut, Ollama (lokal/im Netz) oder Cloud
   ---------------------------------------------------------------------
   Je KI-Macht wählbar, gespeichert im Browser. Cloud-Anbieter sprechen
   das OpenAI-kompatible Format, Claude die Anthropic-Schnittstelle.
   Antwortet das Modell nicht rechtzeitig oder falsch, entscheidet die
   eingebaute KI – das Spiel wartet nie. Der Zustand ist im Kopfbereich
   neben jeder Macht zu sehen.
   ===================================================================== */
type Mode = 'builtin'|'ollama'|'cloud';
type CloudCfg = {key:string, model:string, url?:string};
type Cfg = {mode:Mode, url:string, model:string, provider:string, cloud:Record<string,CloudCfg>, interval:number, timeout:number, temp:number, persona:string};
/** Cloud-Anbieter: Adresse der OpenAI-kompatiblen Schnittstelle (Claude: eigene Schnittstelle) */
export const PROVIDERS: Record<string,{name:string, url:string, kind:'openai'|'anthropic', hint:string, ph:string}> = {
  openrouter:{name:'OpenRouter', url:'https://openrouter.ai/api/v1', kind:'openai', hint:'Viele Modelle über einen Schlüssel, einige davon kostenlos (mit Grenzen).', ph:'z. B. ein Modell mit „:free“'},
  groq:      {name:'Groq', url:'https://api.groq.com/openai/v1', kind:'openai', hint:'Sehr schnelle Antworten, kostenloses Kontingent mit Grenzen.', ph:'Modell aus „Modelle laden“'},
  gemini:    {name:'Google Gemini', url:'https://generativelanguage.googleapis.com/v1beta/openai', kind:'openai', hint:'Kostenloses Kontingent mit Grenzen (Google-Konto).', ph:'z. B. gemini-…-flash'},
  mistral:   {name:'Mistral', url:'https://api.mistral.ai/v1', kind:'openai', hint:'Europäischer Anbieter.', ph:'Modell aus „Modelle laden“'},
  openai:    {name:'OpenAI', url:'https://api.openai.com/v1', kind:'openai', hint:'Kostenpflichtig pro Anfrage.', ph:'Modell aus „Modelle laden“'},
  anthropic: {name:'Anthropic (Claude)', url:'https://api.anthropic.com/v1', kind:'anthropic', hint:'Kostenpflichtig pro Anfrage.', ph:'z. B. claude-haiku-5-5'},
  custom:    {name:'Eigener Server (OpenAI-kompatibel)', url:'', kind:'openai', hint:'LM Studio, llama.cpp, vLLM … – Adresse bis einschließlich /v1.', ph:'Modellname des Servers'},
};
const KEY='frontlinie.llm';
const def=(pid):Cfg=>({mode:'builtin', url:'http://localhost:11434', model:'', provider:'openrouter', cloud:{}, interval:STRATEGIST.interval, timeout:STRATEGIST.timeout, temp:0.7,
  persona:pid===1?'Marschall Varek: misstrauisch, stolz, rachsüchtig – respektiert nur Stärke.':'Kanzlerin Mirela: kühl kalkulierend, sucht Gewinn und Ausgleich, führt Krieg nur, wenn er sich lohnt.'});
export const llmCfg: {ais:Record<number,Cfg>, showReasons:boolean} = load();
function load(){ let o:any={}; try{ o=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
  const ais={}; for(const pid of AIS){ const c={...def(pid), ...((o.ais||{})[pid]||{})}; if(!['builtin','ollama','cloud'].includes(c.mode)) c.mode='builtin'; if(!PROVIDERS[c.provider]) c.provider='openrouter'; c.cloud=c.cloud||{}; ais[pid]=c; }
  return {ais, showReasons:!!o.showReasons}; }
export function saveCfg(){ try{ localStorage.setItem(KEY,JSON.stringify(llmCfg)); }catch(e){} }
const cc=(c:Cfg)=>c.cloud[c.provider]||(c.cloud[c.provider]={key:'', model:'', url:''});
/** aktuelles Modell und Herkunft (für Anzeige) */
export function activeModel(c:Cfg){ if(c.mode==='ollama') return c.model; if(c.mode==='cloud') return cc(c).model; return ''; }
export function sourceName(c:Cfg){ return c.mode==='ollama'?`Ollama ${c.url.replace(/^https?:\/\//,'').replace(/:11434\/?$/,'')}`:c.mode==='cloud'?PROVIDERS[c.provider].name:'eingebaut'; }
const ready=(c:Cfg)=>c.mode==='ollama'?!!c.model:c.mode==='cloud'?!!(cc(c).model&&(cc(c).key||c.provider==='custom')&&cloudUrl(c)):false;
const cloudUrl=(c:Cfg)=>(c.provider==='custom'?(cc(c).url||''):PROVIDERS[c.provider].url).replace(/\/+$/,'');
/** Laufzeit-Zustand je Macht (wird nicht gespeichert) */
export const llmState: Record<number, any> = {};
for(const pid of AIS) llmState[pid]={status:'aus', fails:0, nOk:0, nFail:0, ms:0, nextT:0, busy:false, prompt:'', reply:'', err:'', done:[]};
let lastG=null;
const base=u=>u.replace(/\/+$/,'');
/** Warum eine Adresse vom Browser vermutlich blockiert wird (https-Seite → http-Rechner im Netz) */
export function mixedContent(url){ return location.protocol==='https:'&&/^http:\/\//i.test(url)&&!/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url); }
const originHint=()=>/^(null|file:)/.test(location.origin)?'*':location.origin;
function hint(e,c:Cfg){
  const url=c.mode==='ollama'?c.url:cloudUrl(c);
  if(mixedContent(url)) return 'Der Browser blockiert unverschlüsselte Adressen (http) anderer Rechner von dieser https-Seite – nutze https (z. B. Tailscale Serve) oder localhost.';
  if(e&&e.name==='AbortError') return 'Zeitlimit überschritten – Modell zu langsam oder lädt noch.';
  if(e instanceof TypeError) return c.mode==='ollama'?`Keine Verbindung – läuft Ollama? Ist OLLAMA_ORIGINS gesetzt (z. B. auf ${originHint()})?`:'Keine Verbindung – Adresse falsch, offline, oder der Anbieter erlaubt keinen Zugriff direkt aus dem Browser.';
  return String(e&&e.message||e);
}
async function req(url, init, timeout){
  const ac=new AbortController(), t=setTimeout(()=>ac.abort(),timeout*1000);
  try{ const r=await fetch(url,{...init,signal:ac.signal});
    if(!r.ok){ const tx=(await r.text()).slice(0,200); const e:any=new Error(r.status===401||r.status===403?`Zugriff verweigert (${r.status}) – API-Schlüssel prüfen. ${tx}`:r.status===429?`Kontingent erschöpft oder zu viele Anfragen (429). ${tx}`:`Antwort ${r.status}: ${tx}`); e.status=r.status; throw e; }
    return await r.json(); } finally{ clearTimeout(t); }
}
/** ein Auftrag an das gewählte Modell – liefert den Antworttext */
async function complete(c:Cfg, system:string, user:string, schema:any, timeout:number){
  if(c.mode==='ollama'){
    const j=await req(base(c.url)+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:c.model, stream:false, think:false, format:schema, options:{temperature:c.temp},
      messages:[{role:'system',content:system},{role:'user',content:user}]})},timeout);
    return (j.message&&j.message.content)||''; }
  const P=PROVIDERS[c.provider], C=cc(c), url=cloudUrl(c);
  if(P.kind==='anthropic'){
    const j=await req(url+'/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':C.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:C.model, max_tokens:600, temperature:Math.min(1,c.temp), system, messages:[{role:'user',content:user}]})},timeout);
    return ((j.content||[]).find(x=>x.type==='text')||{}).text||''; }
  const H={'Content-Type':'application/json'}; if(C.key) H['Authorization']='Bearer '+C.key;
  const body:any={model:C.model, temperature:c.temp, messages:[{role:'system',content:system},{role:'user',content:user}], response_format:{type:'json_object'}};
  try{ const j=await req(url+'/chat/completions',{method:'POST',headers:H,body:JSON.stringify(body)},timeout); return (j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)||''; }
  catch(e){ if(e.status!==400) throw e;   // manche Modelle kennen kein JSON-Format: ohne nochmal
    delete body.response_format; const j=await req(url+'/chat/completions',{method:'POST',headers:H,body:JSON.stringify(body)},timeout); return (j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)||''; }
}
/** Liste der Modelle (Ollama oder Anbieter) */
export async function listModels(c:Cfg){
  try{
    if(c.mode==='ollama'){ const j=await req(base(c.url)+'/api/tags',{},8); return (j.models||[]).map(m=>m.name); }
    const P=PROVIDERS[c.provider], C=cc(c), url=cloudUrl(c);
    const H:any=P.kind==='anthropic'?{'x-api-key':C.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}:C.key?{'Authorization':'Bearer '+C.key}:{};
    const j=await req(url+'/models',{headers:H},10);
    return (j.data||j.models||[]).map(m=>(m.id||m.name||'').replace(/^models\//,'')).filter(Boolean).sort();
  }catch(e){ throw new Error(hint(e,c)); }
}
/** eine Entscheidung anfordern */
async function ask(pid){
  const c=llmCfg.ais[pid], S=llmState[pid], g=G, model=activeModel(c); S.busy=true; S.status=S.status==='offline'?'offline':'denkt';
  const pr=strategistPrompt(pid,c.persona); S.prompt=pr.system+'\n\n'+pr.user;
  const t0=performance.now();
  try{
    S.reply=await complete(c,pr.system,pr.user,pr.schema,c.timeout);
    if(G!==g||!G) return;   // inzwischen neues Spiel
    S.ms=Math.round(performance.now()-t0);
    const d=parseDecision(S.reply); if(!d) throw new Error('Antwort ist kein gültiges JSON');
    const res=applyDecision(pid,d,{ttl:Math.max(STRATEGIST.ttl,c.interval*3),model});
    if(!res.ok) throw new Error(res.done.join(', '));
    if(S.status==='offline') msg(`🧠 Stratege ${G.players[pid].short} (${model}) wieder erreichbar – das Modell entscheidet wieder.`,'#9fd88a');
    S.status='ok'; S.fails=0; S.nOk++; S.err=''; S.done=res.done;
    if(llmCfg.showReasons&&G.ais[pid].llm.reason) msg(`🧠 ${G.players[pid].short}: ${G.ais[pid].llm.reason}`,'#b8a0e0');
    S.nextT=G.t+c.interval;
  }catch(e){
    if(G!==g||!G) return;
    S.fails++; S.nFail++; S.err=hint(e,c); S.ms=Math.round(performance.now()-t0);
    if(S.fails>=2&&S.status!=='offline'){ S.status='offline'; msg(`⚠ Stratege ${G.players[pid].short} (${model} · ${sourceName(c)}) nicht erreichbar – die eingebaute KI übernimmt. ${S.err}`,'#ffb38a'); }
    else if(S.status!=='offline') S.status='bereit';
    S.nextT=G.t+(S.status==='offline'?60:Math.min(c.interval,20));
  }finally{ S.busy=false; }
}
/** aus der Hauptschleife */
export function llmTick(){
  if(!G||G.over) return;
  if(G!==lastG){ lastG=G; for(const pid of AIS){ const S=llmState[pid]; S.nextT=G.t+5+(pid===4?8:0); S.fails=0; S.status=ready(llmCfg.ais[pid])?'bereit':'aus'; } }
  if(G.paused||G.hold) return;
  for(const pid of AIS){ const c=llmCfg.ais[pid], S=llmState[pid];
    if(!ready(c)){ S.status='aus'; continue; }
    if(S.status==='aus') S.status='bereit';
    if(S.busy||G.t<S.nextT) continue;
    if(!G.buildings.some(b=>!b.dead&&b.owner===pid&&b.type==='hq')) continue;   // besiegte Macht
    ask(pid); }
}
/** Abzeichen im Kopfbereich */
export function badge(pid){ const S=llmState[pid], c=llmCfg.ais[pid], m=activeModel(c), src=sourceName(c);
  if(!ready(c)) return {t:'⚙', cls:'off', tip:'Eingebaute KI'};
  if(S.status==='offline') return {t:'⚠', cls:'bad', tip:`${m} (${src}) nicht erreichbar – eingebaute KI übernimmt (${S.err})`};
  if(S.busy) return {t:'⏳', cls:'busy', tip:`${m} (${src}) denkt nach …`};
  return {t:c.mode==='cloud'?'☁':'🧠', cls:'ok', tip:`${m} · ${src}${S.nOk?` · ${S.nOk} Entscheidungen, zuletzt ${(S.ms/1000).toFixed(1)} s`:''}`};
}

/* ---------- Einstellungsfenster ---------- */
const esc=s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const seg=(k,v,cur,lab)=>`<button class="seg${cur===v?' on':''}" data-set="${k}" data-v="${v}">${lab}</button>`;
export function renderLLM(){
  let h='';
  for(const pid of AIS){ const c=llmCfg.ais[pid], S=llmState[pid], n=G?G.players[pid].name:['','Föderation Kastrova','','','Handelsbund Veloria'][pid], b=badge(pid), C=cc(c), P=PROVIDERS[c.provider];
    h+=`<div class="party" data-pid="${pid}"><h3>${n} <span class="badge">${AI_CHAR[pid].label}</span><span class="llmB ${b.cls}" style="margin-left:auto">${b.t} ${ready(c)?esc(activeModel(c))+' · '+esc(sourceName(c)):'eingebaut'}</span></h3>
      <div class="row segs">${seg('mode','builtin',c.mode,'⚙ Eingebaut')}${seg('mode','ollama',c.mode,'🖥 Ollama (lokal/Netz)')}${seg('mode','cloud',c.mode,'☁ Cloud')}
        <button class="seg copy" data-act="copy" title="Diese Einstellung auch für die andere Macht übernehmen">⇄ für beide</button></div>`;
    if(c.mode==='ollama') h+=`
        <div class="row"><label style="flex:1">Adresse <input data-k="url" value="${esc(c.url)}" placeholder="http://localhost:11434" style="width:100%"></label></div>
        ${mixedContent(c.url)?'<div class="barl" style="color:#ffb38a"><span>⚠ Diese http-Adresse wird von der https-Seite vermutlich blockiert. Nutze localhost oder https (z. B. Tailscale Serve auf dem KI-Rechner).</span></div>':''}
        <div class="row"><label style="flex:1">Modell <input data-k="model" list="llmModels${pid}" value="${esc(c.model)}" placeholder="z. B. qwen3:14b" style="width:100%"></label><datalist id="llmModels${pid}"></datalist>
          <button data-act="models">Modelle laden</button><button data-act="test">Verbindung testen</button></div>
        <div class="barl"><span>Kostenlos. Ollama muss Zugriffe dieser Seite erlauben: <code>OLLAMA_ORIGINS=${esc(originHint())}</code> (oder <code>*</code>) setzen und Ollama neu starten. Andere Rechner brauchen von dieser https-Seite aus eine https-Adresse, z. B. per <code>tailscale serve --bg 11434</code>.</span></div>`;
    if(c.mode==='cloud') h+=`
        <div class="row"><label>Anbieter <select data-k="provider">${Object.entries(PROVIDERS).map(([k,v])=>`<option value="${k}"${c.provider===k?' selected':''}>${v.name}</option>`).join('')}</select></label><span class="dim" style="font-size:12px">${esc(P.hint)}</span></div>
        ${c.provider==='custom'?`<div class="row"><label style="flex:1">Adresse <input data-c="url" value="${esc(C.url)}" placeholder="http://localhost:1234/v1" style="width:100%"></label></div>`:''}
        <div class="row"><label style="flex:1">API-Schlüssel <input data-c="key" type="password" value="${esc(C.key)}" placeholder="${c.provider==='custom'?'falls nötig':'Schlüssel des Anbieters'}" style="width:100%" autocomplete="off"></label><button data-act="show">👁</button></div>
        <div class="row"><label style="flex:1">Modell <input data-c="model" list="llmModels${pid}" value="${esc(C.model)}" placeholder="${esc(P.ph)}" style="width:100%"></label><datalist id="llmModels${pid}"></datalist>
          <button data-act="models">Modelle laden</button><button data-act="test">Verbindung testen</button></div>
        <div class="barl"><span>☁ Cloud-Modelle können Kosten verursachen – kostenlose Kontingente haben Grenzen (bei Überschreitung übernimmt die eingebaute KI). Der Schlüssel bleibt nur in diesem Browser gespeichert; jeder mit Zugang zu diesem Browser kann ihn auslesen.</span></div>`;
    if(c.mode!=='builtin') h+=`
        <div class="row"><label>alle <input data-k="interval" type="number" min="15" max="300" value="${c.interval}" style="width:60px"> s entscheiden</label>
          <label>Zeitlimit <input data-k="timeout" type="number" min="5" max="120" value="${c.timeout}" style="width:55px"> s</label>
          <label>Temperatur <input data-k="temp" type="number" min="0" max="1.5" step="0.1" value="${c.temp}" style="width:55px"></label></div>
        <label style="display:block">Charakter (fließt in den Auftrag ein)<textarea data-k="persona" rows="2" style="width:100%">${esc(c.persona)}</textarea></label>
        <div class="barl"><span>Zustand: ${!G?'startet mit dem Spiel':({aus:'noch nicht vollständig eingestellt',bereit:'bereit',denkt:'denkt nach',ok:'verbunden',offline:'nicht erreichbar – eingebaute KI entscheidet'})[S.status]||S.status} · ${S.nOk} Entscheidungen · ${S.nFail} Fehlschläge${S.ms?` · zuletzt ${(S.ms/1000).toFixed(1)} s`:''}</span></div>
        <div class="llmMsg" data-out="1">${S.err?'⚠ '+esc(S.err):''}</div>
        <details><summary>Protokoll: letzter Auftrag und Antwort</summary><pre class="llmLog">${esc(S.prompt||'–')}\n\n— Antwort —\n${esc(S.reply||'–')}\n\n— Umgesetzt —\n${esc((S.done||[]).join(' · ')||'–')}</pre></details>`;
    else h+='<div class="barl"><span>Die eingebaute KI entscheidet nach Regeln – ohne Verbindung, sofort und kostenlos.</span></div>';
    h+='</div>'; }
  h+=`<label class="chk"><input type="checkbox" id="llmReasons"${llmCfg.showReasons?' checked':''}> Begründungen der Strategen im Meldungsfeld zeigen (verrät ihre Pläne)</label>
    <div class="barl"><span>Antwortet ein Modell nicht rechtzeitig oder ungültig, entscheidet automatisch die eingebaute KI. Neben jeder Macht im Kopfbereich: 🧠 Ollama · ☁ Cloud · ⏳ denkt · ⚠ nicht erreichbar · ⚙ eingebaut.</span></div>`;
  $('#llmBody').innerHTML=h;
}
/** Kopfzeile einer Macht im Fenster auffrischen */
function head(box,pid){ const c=llmCfg.ais[pid], hb=box.querySelector('h3 .llmB') as HTMLElement; if(hb){ const B=badge(pid); hb.className='llmB '+B.cls; hb.textContent=`${B.t} ${ready(c)?activeModel(c)+' · '+sourceName(c):'eingebaut'}`; } }
export function openLLM(){ if(G&&!G.over) G.paused=true; renderLLM(); $('#llm').classList.remove('hidden'); }
function closeLLM(){ $('#llm').classList.add('hidden'); if(G&&$('#start').classList.contains('hidden')) G.paused=!!G.offer; }
const resetState=pid=>{ const S=llmState[pid]; S.fails=0; S.err=''; if(S.status==='offline'||S.status==='aus') S.status='bereit'; if(G) S.nextT=G.t+2; };
export function init(){
  $('#bLLM').addEventListener('click',openLLM);
  $('#bLLMClose').addEventListener('click',closeLLM);
  const body=$('#llmBody');
  body.addEventListener('change',e=>{ const el=e.target as HTMLInputElement;
    if(el.id==='llmReasons'){ llmCfg.showReasons=el.checked; saveCfg(); return; }
    const box=el.closest('[data-pid]') as HTMLElement; if(!box) return; const pid=Number(box.dataset.pid), c=llmCfg.ais[pid];
    if(el.dataset.c){ cc(c)[el.dataset.c]=el.value.trim(); }
    else if(el.dataset.k){ const k=el.dataset.k; c[k]=['interval','timeout','temp'].includes(k)?Number(el.value):el.value;
      if(k==='interval') c.interval=Math.max(15,Math.min(300,c.interval||45)); if(k==='timeout') c.timeout=Math.max(5,Math.min(120,c.timeout||25)); }
    else return;
    saveCfg(); resetState(pid);
    if(el.dataset.k==='provider'||el.dataset.k==='url') renderLLM(); else head(box,pid); });
  body.addEventListener('click',async e=>{ const t=e.target as HTMLElement;
    const sb=t.closest('button[data-set]') as HTMLButtonElement;
    if(sb){ const pid=Number((sb.closest('[data-pid]') as HTMLElement).dataset.pid); llmCfg.ais[pid][sb.dataset.set]=sb.dataset.v; saveCfg(); resetState(pid); renderLLM(); return; }
    const b=t.closest('button[data-act]') as HTMLButtonElement; if(!b) return;
    const box=b.closest('[data-pid]') as HTMLElement, pid=Number(box.dataset.pid), c=llmCfg.ais[pid], out=box.querySelector('[data-out]') as HTMLElement;
    if(b.dataset.act==='copy'){ const o=AIS.find(x=>x!==pid); const keep=llmCfg.ais[o].persona; llmCfg.ais[o]=JSON.parse(JSON.stringify(c)); llmCfg.ais[o].persona=keep; saveCfg(); resetState(o); renderLLM(); return; }
    if(b.dataset.act==='show'){ const i=box.querySelector('[data-c="key"]') as HTMLInputElement; i.type=i.type==='password'?'text':'password'; return; }
    if(out) out.textContent='…';
    if(b.dataset.act==='models'){ try{ const L=await listModels(c); (box.querySelector('datalist') as HTMLElement).innerHTML=L.map(m=>`<option value="${esc(m)}">`).join('');
        out.textContent=L.length?`✓ ${L.length} Modelle: ${L.slice(0,8).join(', ')}${L.length>8?' …':''} – ins Feld „Modell“ tippen oder auswählen.`:'Keine Modelle gefunden.';
        const mi=box.querySelector('[data-k="model"],[data-c="model"]') as HTMLInputElement;
        if(mi&&!mi.value&&L.length&&c.mode==='ollama'){ c.model=L[0]; mi.value=c.model; saveCfg(); }
        head(box,pid); }
      catch(err){ out.textContent='⚠ '+err.message; } }
    if(b.dataset.act==='test'){ const t0=performance.now();
      try{ const tx=await complete(c,'Antworte nur mit JSON.','Antworte mit {"ok": true}',{type:'object',properties:{ok:{type:'boolean'}},required:['ok']},c.timeout);
        const d=parseDecision(tx); out.textContent=d&&d.ok?`✓ ${activeModel(c)} (${sourceName(c)}) antwortet (${((performance.now()-t0)/1000).toFixed(1)} s).`:`Antwort erhalten, aber nicht wie erwartet: ${(tx||'').slice(0,120)}`; }
      catch(err){ out.textContent='⚠ '+hint(err,c); } } });
}
