(()=>{'use strict';
const $=id=>document.getElementById(id);
const settings=$('responsesSettings');
$('responseSettingsButton').addEventListener('click',()=>settings.showModal());
$('closeResponsesSettings').addEventListener('click',()=>settings.close());
const item=(name,description)=>{
 const li=document.createElement('li'),main=document.createElement('span');main.textContent=name;li.append(main);
 if(description){const small=document.createElement('small');small.textContent=description;li.append(small)}return li;
};
function fill(target,rows,render){const box=$(target);box.replaceChildren();if(!rows.length)box.append(item('None yet',''));else rows.forEach(row=>box.append(render(row)));}
async function load(){
 $('responseStatus').textContent='Checking form response matches…';
 try{
  const r=await fetch('/admin/api/form-responses',{cache:'no-store'});
  if(!r.ok)throw Error('Connection unavailable');
  const d=await r.json();
  $('responseCount').textContent=d.uniqueRespondents;
  $('matchCount').textContent=d.matchedCount;
  $('reviewCount').textContent=d.needsReviewCount;
  $('plusOneCount').textContent=d.plusOneMatchedCount;
  fill('matchedNames',d.matched||[],r=>item(r.guest,'Source row '+r.sourceRow+' · '+r.matchMethod));
  const reasons={
   'no-match':'Name not found in Guest List',
   'ambiguous-name':'Multiple possible guest matches; verify manually',
   'duplicate-match':'Guest List entry already matched to another form response',
   'payment-or-rsvp-pending':'RSVP and payment must both be Yes',
   'duplicate-first-name':'First name already used; distinguish before assigning'
  };
  fill('reviewRows',d.review||[],r=>item('Response row '+r.sourceRow,reasons[r.status]||'Review original Form and Guest List'));
  fill('plusOneMatches',d.plusOneMatches||[],r=>item(r.guest||'Response row '+r.sourceRow,r.status==='matched'?'Matched plus-one':'Review plus-one in original Sheet'));
  const fmt=value=>value?new Date(value).toLocaleString():'No successful check';
  const formOk=d.formConnectionFresh===true,guestOk=d.guestConnectionFresh===true;
  const message='Guest List checked: '+fmt(d.lastGuestSync)+'. Forms received: '+fmt(d.lastImportedAt)+'.';
  $('responseStatus').textContent=message+(formOk&&guestOk
   ?' Both connections are receiving updates.'
   :' At least one source has not checked in recently; review the Apps Script triggers in Settings.')+
   (d.syncConflicts?' '+d.syncConflicts+' Guest List conflicts need review.':'')+
   ' '+d.eligibleParticipantCount+' eligible people including named companions. Teams are '+(d.isPublished?'published.':'unpublished.');
 }catch{$('responseStatus').textContent='Unable to load response matching. Reload or check connections in Settings.'}
}
$('reloadMatches').addEventListener('click',load);load();
})();
