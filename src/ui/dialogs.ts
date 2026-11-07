import { on } from '../core/events';
import { AI_CHAR, FAMINE, PACT, RES, UNITS } from '../data/config';
import { dealText, pactList } from '../sim/pacts';
import { fmt } from '../core/util';
import { G } from '../sim/state';
import { $ } from './dom';
import { answerOffer } from '../sim/offers';



export function init(){
on('offer',showOfferDialog);
on('offerClosed',()=>$('#offer').classList.add('hidden'));
$('#offerYes').addEventListener('click',()=>answerOffer(true));
$('#offerNo').addEventListener('click',()=>answerOffer(false));
}

export function showOfferDialog(o){
  const P=G.players[0];
  const A=G.players[o.from??1], who=`<b>${A.leader}:</b>`;
  if(o.type==='demand'){
    $('#offerTitle').textContent='Forderung aus '+A.short;
    const why={food:'Unser Volk hungert',metal:'Unsere Industrie braucht Metall',oil:'Uns geht der Treibstoff aus',wood:'Uns fehlt Bauholz',stone:'Uns fehlt Stein für unsere Festungen',money:'Eure Stadt ist reich, unsere Armee ist stark. Zahlt für Euren Schutz'}[o.res]||'Wir brauchen Nachschub';
    $('#offerText').innerHTML=`${who} „${why}. Liefert uns <b>${o.amt} ${RES[o.res].name}</b> ${RES[o.res].icon} – oder wir holen es uns selbst.“<br><br><span style="color:var(--dim);font-size:13px">Ihr habt ${fmt(P.res[o.res])} ${RES[o.res].icon}. Ablehnen bedeutet Krieg.</span>`;
    $('#offerYes').textContent=`Liefern (−${o.res==='money'?'$':''}${o.amt}${o.res==='money'?'':' '+RES[o.res].icon})`; $('#offerYes').disabled=P.res[o.res]<o.amt;
    $('#offerNo').textContent='Ablehnen';
  } else if(o.type==='merc'){
    const n=o.units.map(t=>UNITS[t]?.name.replace(/\u00AD|­/g,'')).reduce((a,k)=>(a[k]=(a[k]||0)+1,a),{});
    $('#offerTitle').textContent='🗡 Söldner bieten ihre Dienste an';
    $('#offerText').innerHTML=`<b>Hauptmann der Söldner:</b> „Wir kämpfen für den, der zahlt. ${o.price} $, und wir stehen an eurem Rathaus.“<br><br>Trupp: ${Object.entries(n).map(([k,c])=>`${c}× ${k}`).join(', ')}<br><br><span class="warnl">Lehnt ihr ab, ziehen sie weiter – vielleicht zu euren Nachbarn.</span>`;
    $('#offerYes').textContent=`Anwerben (−${o.price} $)`; $('#offerYes').disabled=P.res.money<o.price;
    $('#offerNo').textContent='Ablehnen';
  } else if(o.type==='pact'){
    const d=o.deal, X=G.players[d.target], say=(AI_CHAR[o.from??1].say.pactAsk||'').replace('{ziel}',X.short);
    $('#offerTitle').textContent='Geheimes Angebot aus '+A.short;
    $('#offerText').innerHTML=`${who} ${say}<br><br><b>${dealText(o.from,d)}</b><br><br><span class="warnl">Einschlagen heißt: Aldoria erklärt ${X.short} sofort den Krieg. ${Math.round(PACT.jointDur/60)} min lang kein Separatfrieden mit ${X.short} – sonst ist ${A.short} schwer verärgert.</span>`;
    $('#offerYes').textContent='🤝 Einschlagen'+(d.money<0?` (+${-d.money} $)`:''); $('#offerYes').disabled=false;
    $('#offerNo').textContent='Ablehnen';
  } else if(o.type==='aid'){
    $('#offerTitle').textContent='Hilfsangebot aus '+A.short;
    const say=(o.from??1)===4?'„Euer Volk hungert, hört man. Veloria kann liefern – Geschäft ist Geschäft.“':'„Hungernde Nachbarn sind unruhige Nachbarn. Kastrova hilft – nicht umsonst.“';
    $('#offerText').innerHTML=`${who} ${say}<br><br>Angebot: <b>${o.food} ${RES.food.name}</b> ${RES.food.icon} für <b>${o.price} $</b>`+
      (o.credit?` – auf Kredit: ${Math.round(FAMINE.debtShare*100)} % eurer Steuern gehen an ${A.short}, bis alles bezahlt ist (Frist ${Math.round(FAMINE.debtTime/60)} min).`:'.')+
      `<br><br><span style="color:var(--dim);font-size:13px">Ihr habt ${fmt(P.res.food)} ${RES.food.icon} und ${fmt(P.res.money)} $. Am Milizmarkt ist Nahrung billiger, falls ihr das Geld habt.</span>`;
    $('#offerYes').textContent=o.credit?'Auf Kredit annehmen':`Annehmen (−$${o.price})`; $('#offerYes').disabled=false;
    $('#offerNo').textContent='Ablehnen';
  } else {
    $('#offerTitle').textContent='Friedensangebot';
    const sw=pactList().find(q=>q.kind==='joint'&&q.join&&q.target===(o.from??1));
    $('#offerText').innerHTML=`${who} „Wir haben genug Blut vergossen. ${A.short} bietet Frieden an. Nehmt Ihr an?“`+(sw?`<br><br><span class="warnl">⚠ Ihr habt ${G.players[sw.f].short} zugesagt, gegen ${A.short} zu kämpfen. Frieden wäre Wortbruch.</span>`:'');
    $('#offerYes').textContent='Frieden schließen'; $('#offerYes').disabled=false;
    $('#offerNo').textContent='Weiterkämpfen';
  }
  $('#offer').classList.remove('hidden');
}
