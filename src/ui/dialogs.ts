import { on } from '../core/events';
import { FAMINE, RES } from '../data/config';
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
    $('#offerText').innerHTML=`${who} „Wir haben genug Blut vergossen. ${A.short} bietet Frieden an. Nehmt Ihr an?“`;
    $('#offerYes').textContent='Frieden schließen'; $('#offerYes').disabled=false;
    $('#offerNo').textContent='Weiterkämpfen';
  }
  $('#offer').classList.remove('hidden');
}
