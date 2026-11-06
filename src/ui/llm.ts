import { $ } from './dom';
import { msg } from '../core/events';
import { AIS, AI_CHAR, STRATEGIST } from '../data/config';
import { G } from '../sim/state';
import { applyDecision, parseDecision, strategistPrompt } from '../ai/strategist';

/* =====================================================================
   LLM-Strategen: Verbindung zu Ollama (lokal, im Netz oder über https)
   ---------------------------------------------------------------------
   Je KI-Macht einstellbar (eingebaut oder Ollama), gespeichert im Browser.
   Antwortet das Modell nicht rechtzeitig oder falsch, entscheidet die
   eingebaute KI – das Spiel wartet nie. Der Zustand ist im Kopfbereich
   neben jeder Macht zu sehen.
   ===================================================================== */
type Cfg = {mode:'builtin'|'ollama', url:string, model:string, interval:number, timeout:number, temp:number, persona:string};
const KEY='frontlinie.llm';
const def=(pid):Cfg=>({mode:'builtin', url:'http://localhost:11434', model:'', interval:STRATEGIST.interval, timeout:STRATEGIST.timeout, temp:0.7, persona:pid===1?'Marschall Varek: misstrauisch, stolz, rachsüchtig – respektiert nur Stärke.':'Kanzlerin Mirela: kühl kalkulierend, sucht Gewinn und Ausgleich, führt Krieg nur, wenn er sich lohnt.'});
export const llmCfg: {ais:Record<number,Cfg>, showReasons:boolean} = load();
function load(){ let o:any={}; try{ o=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
  const ais={}; for(const pid of AIS) ais[pid]={...def(pid), ...((o.ais||{})[pid]||{})};
  return {ais, showReasons:!!o.showReasons}; }
export function saveCfg(){ try{ localStorage.setItem(KEY,JSON.stringify(llmCfg)); }catch(e){} }
/** Laufzeit-Zustand je Macht (wird nicht gespeichert) */
export const llmState: Record<number, any> = {};
for(const pid of AIS) llmState[pid]={status:'aus', fails:0, nOk:0, nFail:0, ms:0, nextT:0, busy:false, prompt:'', reply:'', err:'', done:[]};
let lastG=null;
const base=u=>u.replace(/\/+$/,'');
/** Warum eine Adresse vom Browser vermutlich blockiert wird (https-Seite → http-Rechner im Netz) */
export function mixedContent(url){ return location.protocol==='https:'&&/^http:\/\//i.test(url)&&!/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url); }
function hint(e,url){
  if(mixedContent(url)) return 'Der Browser blockiert unverschlüsselte Adressen (http) anderer Rechner von dieser https-Seite – nutze https (z. B. Tailscale Serve) oder localhost.';
  if(e&&e.name==='AbortError') return 'Zeitlimit überschritten – Modell zu langsam oder lädt noch.';
  if(e instanceof TypeError) return 'Keine Verbindung – läuft Ollama? Ist OLLAMA_ORIGINS gesetzt (z. B. auf '+(/^(null|file:)/.test(location.origin)?'*':location.origin)+')?';
  return String(e&&e.message||e);
}
async function post(url,body,timeout){
  const ac=new AbortController(), t=setTimeout(()=>ac.abort(),timeout*1000);
  try{ const r=await fetch(base(url)+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ac.signal});
    if(!r.ok) throw new Error(`Ollama antwortet mit ${r.status}: ${(await r.text()).slice(0,160)}`);
    return await r.json(); } finally{ clearTimeout(t); }
}
/** Liste der Modelle eines Ollama-Servers */
export async function listModels(url){
  const ac=new AbortController(), t=setTimeout(()=>ac.abort(),6000);
  try{ const r=await fetch(base(url)+'/api/tags',{signal:ac.signal}); if(!r.ok) throw new Error('HTTP '+r.status); const j=await r.json(); return (j.models||[]).map(m=>m.name); }
  catch(e){ throw new Error(hint(e,url)); } finally{ clearTimeout(t); }
}
/** eine Entscheidung anfordern */
async function ask(pid){
  const c=llmCfg.ais[pid], S=llmState[pid], g=G; S.busy=true; S.status=S.status==='offline'?'offline':'denkt';
  const pr=strategistPrompt(pid,c.persona); S.prompt=pr.system+'\n\n'+pr.user;
  const t0=performance.now();
  try{
    const j=await post(c.url,{model:c.model, stream:false, think:false, format:pr.schema, options:{temperature:c.temp},
      messages:[{role:'system',content:pr.system},{role:'user',content:pr.user}]}, c.timeout);
    if(G!==g||!G) return;   // inzwischen neues Spiel
    S.reply=(j.message&&j.message.content)||''; S.ms=Math.round(performance.now()-t0);
    const d=parseDecision(S.reply); if(!d) throw new Error('Antwort ist kein gültiges JSON');
    const res=applyDecision(pid,d,{ttl:Math.max(STRATEGIST.ttl,c.interval*3),model:c.model});
    if(!res.ok) throw new Error(res.done.join(', '));
    if(S.status==='offline') msg(`🧠 Stratege ${G.players[pid].short} (${c.model}) wieder erreichbar – das Modell entscheidet wieder.`,'#9fd88a');
    S.status='ok'; S.fails=0; S.nOk++; S.err=''; S.done=res.done;
    if(llmCfg.showReasons&&G.ais[pid].llm.reason) msg(`🧠 ${G.players[pid].short}: ${G.ais[pid].llm.reason}`,'#b8a0e0');
    S.nextT=G.t+c.interval;
  }catch(e){
    if(G!==g||!G) return;
    S.fails++; S.nFail++; S.err=hint(e,c.url); S.ms=Math.round(performance.now()-t0);
    if(S.fails>=2&&S.status!=='offline'){ S.status='offline'; msg(`⚠ Stratege ${G.players[pid].short} (${c.model||'Ollama'}) nicht erreichbar – die eingebaute KI übernimmt. ${S.err}`,'#ffb38a'); }
    else if(S.status!=='offline') S.status='bereit';
    S.nextT=G.t+(S.status==='offline'?60:Math.min(c.interval,20));
  }finally{ S.busy=false; }
}
/** aus der Hauptschleife */
export function llmTick(){
  if(!G||G.over) return;
  if(G!==lastG){ lastG=G; for(const pid of AIS){ const S=llmState[pid]; S.nextT=G.t+5+(pid===4?8:0); S.fails=0; S.status=llmCfg.ais[pid].mode==='ollama'?'bereit':'aus'; } }
  if(G.paused||G.hold) return;
  for(const pid of AIS){ const c=llmCfg.ais[pid], S=llmState[pid];
    if(c.mode!=='ollama'||!c.model){ S.status='aus'; continue; }
    if(S.status==='aus') S.status='bereit';
    if(S.busy||G.t<S.nextT) continue;
    if(!G.buildings.some(b=>!b.dead&&b.owner===pid&&b.type==='hq')) continue;   // besiegte Macht
    ask(pid); }
}
/** Abzeichen im Kopfbereich */
export function badge(pid){ const S=llmState[pid], c=llmCfg.ais[pid];
  if(c.mode!=='ollama'||!c.model) return {t:'⚙', cls:'off', tip:'Eingebaute KI'};
  if(S.status==='offline') return {t:'⚠', cls:'bad', tip:`LLM nicht erreichbar – eingebaute KI übernimmt (${S.err})`};
  if(S.busy) return {t:'⏳', cls:'busy', tip:`${c.model} denkt nach …`};
  return {t:'🧠', cls:'ok', tip:`${c.model}${S.nOk?` · ${S.nOk} Entscheidungen, zuletzt ${(S.ms/1000).toFixed(1)} s`:''}`};
}

/* ---------- Einstellungsfenster ---------- */
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export function renderLLM(){
  let h='';
  for(const pid of AIS){ const c=llmCfg.ais[pid], S=llmState[pid], n=G?G.players[pid].name:['','Föderation Kastrova','','','Handelsbund Veloria'][pid];
    const b=badge(pid);
    h+=`<div class="party" data-pid="${pid}"><h3>${n} <span class="badge">${AI_CHAR[pid].label}</span><span class="llmB ${b.cls}" style="margin-left:auto">${b.t} ${c.mode==='ollama'&&c.model?esc(c.model):'eingebaut'}</span></h3>
      <div class="row"><label>Stratege <select data-k="mode"><option value="builtin"${c.mode==='builtin'?' selected':''}>Eingebaute KI</option><option value="ollama"${c.mode==='ollama'?' selected':''}>Ollama (LLM)</option></select></label></div>
      <div class="llmOll"${c.mode==='ollama'?'':' style="display:none"'}>
        <div class="row"><label style="flex:1">Adresse <input data-k="url" value="${esc(c.url)}" placeholder="http://localhost:11434" style="width:100%"></label></div>
        ${mixedContent(c.url)?'<div class="barl" style="color:#ffb38a"><span>⚠ Diese http-Adresse wird von der https-Seite vermutlich blockiert. Nutze localhost oder https (z. B. Tailscale Serve auf dem KI-Rechner).</span></div>':''}
        <div class="row"><label style="flex:1">Modell <input data-k="model" list="llmModels${pid}" value="${esc(c.model)}" placeholder="z. B. qwen3:14b" style="width:100%"></label><datalist id="llmModels${pid}"></datalist>
          <button data-act="models">Modelle laden</button><button data-act="test">Verbindung testen</button></div>
        <div class="row"><label>alle <input data-k="interval" type="number" min="15" max="300" value="${c.interval}" style="width:60px"> s entscheiden</label>
          <label>Zeitlimit <input data-k="timeout" type="number" min="5" max="120" value="${c.timeout}" style="width:55px"> s</label>
          <label>Temperatur <input data-k="temp" type="number" min="0" max="1.5" step="0.1" value="${c.temp}" style="width:55px"></label></div>
        <label style="display:block">Charakter (fließt in den Auftrag ein)<textarea data-k="persona" rows="2" style="width:100%">${esc(c.persona)}</textarea></label>
        <div class="barl"><span>Zustand: ${!G&&c.mode==='ollama'?'startet mit dem Spiel':({aus:'aus',bereit:'bereit',denkt:'denkt nach',ok:'verbunden',offline:'nicht erreichbar – eingebaute KI entscheidet'})[S.status]||S.status} · ${S.nOk} Entscheidungen · ${S.nFail} Fehlschläge${S.ms?` · zuletzt ${(S.ms/1000).toFixed(1)} s`:''}</span></div>
        <div class="llmMsg" data-out="1">${S.err?'⚠ '+esc(S.err):''}</div>
        <details><summary>Protokoll: letzter Auftrag und Antwort</summary><pre class="llmLog">${esc(S.prompt||'–')}\n\n— Antwort —\n${esc(S.reply||'–')}\n\n— Umgesetzt —\n${esc((S.done||[]).join(' · ')||'–')}</pre></details>
      </div></div>`; }
  h+=`<label class="chk"><input type="checkbox" id="llmReasons"${llmCfg.showReasons?' checked':''}> Begründungen der Strategen im Meldungsfeld zeigen (verrät ihre Pläne)</label>
    <div class="barl"><span>Kostenlos und lokal: <b>Ollama</b> auf diesem Rechner (http://localhost:11434) oder einem anderen im Netz. Ollama muss Zugriffe dieser Seite erlauben: Umgebungsvariable <code>OLLAMA_ORIGINS=${esc(/^(null|file:)/.test(location.origin)?'*':location.origin)}</code> (oder <code>*</code>) setzen und Ollama neu starten. Andere Rechner brauchen von dieser https-Seite aus eine https-Adresse, z. B. per <code>tailscale serve</code>. Antwortet das Modell nicht, entscheidet automatisch die eingebaute KI.</span></div>`;
  $('#llmBody').innerHTML=h;
}
export function openLLM(){ if(G&&!G.over) G.paused=true; renderLLM(); $('#llm').classList.remove('hidden'); }
function closeLLM(){ $('#llm').classList.add('hidden'); if(G&&$('#start').classList.contains('hidden')) G.paused=!!G.offer; }
export function init(){
  $('#bLLM').addEventListener('click',openLLM);
  $('#bLLMClose').addEventListener('click',closeLLM);
  const body=$('#llmBody');
  body.addEventListener('change',e=>{ const el=e.target as HTMLInputElement;
    if(el.id==='llmReasons'){ llmCfg.showReasons=el.checked; saveCfg(); return; }
    const box=el.closest('[data-pid]') as HTMLElement; if(!box||!el.dataset.k) return; const pid=Number(box.dataset.pid), c=llmCfg.ais[pid];
    const k=el.dataset.k; c[k]=['interval','timeout','temp'].includes(k)?Number(el.value):el.value;
    if(k==='interval') c.interval=Math.max(15,Math.min(300,c.interval||45)); if(k==='timeout') c.timeout=Math.max(5,Math.min(120,c.timeout||25));
    saveCfg(); llmState[pid].fails=0; if(llmState[pid].status==='offline') llmState[pid].status='bereit'; if(G) llmState[pid].nextT=G.t+2;
    if(k==='mode'||k==='url') renderLLM(); });
  body.addEventListener('click',async e=>{ const b=(e.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement; if(!b) return;
    const box=b.closest('[data-pid]') as HTMLElement, pid=Number(box.dataset.pid), c=llmCfg.ais[pid], out=box.querySelector('[data-out]') as HTMLElement;
    out.textContent='…';
    if(b.dataset.act==='models'){ try{ const L=await listModels(c.url); (box.querySelector('datalist') as HTMLElement).innerHTML=L.map(m=>`<option value="${esc(m)}">`).join('');
        out.textContent=L.length?`✓ ${L.length} Modelle: ${L.slice(0,8).join(', ')}${L.length>8?' …':''} – ins Feld „Modell“ tippen oder auswählen.`:'Keine Modelle installiert (ollama pull …).';
        if(!c.model&&L.length){ c.model=L[0]; saveCfg(); (box.querySelector('[data-k="model"]') as HTMLInputElement).value=c.model; }
        const hb=box.querySelector('h3 .llmB') as HTMLElement; if(hb){ const B=badge(pid); hb.className='llmB '+B.cls; hb.textContent=`${B.t} ${c.model||'eingebaut'}`; } }
      catch(err){ out.textContent='⚠ '+err.message; } }
    if(b.dataset.act==='test'){ const t0=performance.now();
      try{ const j=await post(c.url,{model:c.model,stream:false,think:false,format:{type:'object',properties:{ok:{type:'boolean'}},required:['ok']},messages:[{role:'user',content:'Antworte mit {"ok": true}'}]},c.timeout);
        const d=parseDecision(j.message&&j.message.content); out.textContent=d&&d.ok?`✓ ${c.model} antwortet (${((performance.now()-t0)/1000).toFixed(1)} s).`:`Antwort erhalten, aber nicht wie erwartet: ${(j.message&&j.message.content||'').slice(0,120)}`; }
      catch(err){ out.textContent='⚠ '+hint(err,c.url); } } });
}
