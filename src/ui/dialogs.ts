import { on } from '../core/events';
import { RES } from '../data/config';
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
  if(o.type==='demand'){
    $('#offerTitle').textContent='Forderung aus Kastrova';
    const why={food:'Unser Volk hungert',metal:'Unsere Industrie braucht Metall',oil:'Uns geht der Treibstoff aus',money:'Eure Stadt ist reich, unsere Armee ist stark. Zahlt für Euren Schutz'}[o.res];
    $('#offerText').innerHTML=`<b>Marschall Varek:</b> „${why}. Liefert uns <b>${o.amt} ${RES[o.res].name}</b> ${RES[o.res].icon} – oder wir holen es uns selbst.“<br><br><span style="color:var(--dim);font-size:13px">Ihr habt ${fmt(P.res[o.res])} ${RES[o.res].icon}. Ablehnen bedeutet Krieg.</span>`;
    $('#offerYes').textContent=`Liefern (−${o.res==='money'?'$':''}${o.amt}${o.res==='money'?'':' '+RES[o.res].icon})`; $('#offerYes').disabled=P.res[o.res]<o.amt;
    $('#offerNo').textContent='Ablehnen';
  } else {
    $('#offerTitle').textContent='Friedensangebot';
    $('#offerText').innerHTML='<b>Marschall Varek:</b> „Wir haben genug Blut vergossen. Kastrova bietet Frieden an. Nehmt Ihr an?“';
    $('#offerYes').textContent='Frieden schließen'; $('#offerYes').disabled=false;
    $('#offerNo').textContent='Weiterkämpfen';
  }
  $('#offer').classList.remove('hidden');
}
