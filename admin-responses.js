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
  fill('reviewRows',d.review||[],r=>item('Response row '+r.sourceRow,r.status==='ambiguous'?'Possible multiple matches':'Not matched automatically'));
  fill('plusOneMatches',d.plusOneMatches||[],r=>item(r.guest||'Response row '+r.sourceRow,r.status==='matched'?'Matched plus-one':'Review plus-one in original Sheet'));
  $('responseStatus').textContent=d.mode==='live_google_form_sync'
    ?'Response connection active. Last received '+new Date(d.lastImportedAt).toLocaleString()+'.'
    :'Initial form snapshot imported. Enable the Forms Apps Script for ongoing automatic updates.';
 }catch{$('responseStatus').textContent='Unable to load response matching. Reload or check connections in Settings.'}
}
$('reloadMatches').addEventListener('click',load);load();
})();
