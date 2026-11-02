(()=>{'use strict';
const box=document.querySelector('#pageSettings,#plannerHelp,#teamsHelp,#responsesSettings');
if(!box)return;
const $=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e};
const root=$('div','fg-connections');
const google=$('section','fg-source'),form=$('section','fg-source');
const source='https://docs.google.com/spreadsheets/d/15KhO9_BuCQrJXeTzr4hAyNrqDocAbZsObu_FsWAjGuk/edit';
const responses='https://docs.google.com/spreadsheets/d/1JRPCoLs2pB44-WyiGvACL0nnDVeiyj_NrgHS8cYrluY/edit?usp=drivesdk';
function link(parent,label,href){
 const a=$('a','',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);return a;
}
function header(parent,name){parent.append($('h3','',name))}
function actions(parent,fn,otherLabel,otherHref){
 const row=$('div','fg-actions'),b=$('button','','Check connection');b.type='button';b.addEventListener('click',fn);
 row.append(b);link(row,otherLabel,otherHref);parent.append(row);
}
let googleStatus,formStatus;
const prior=document.getElementById('sheetSyncPanel');
if(prior){
 prior.classList.add('fg-source');
 google.append(prior);
 googleStatus=document.getElementById('sheetSyncStatus');
 const view=$('p','fg-note','The source Guest List controls RSVP and payment amounts. Changes made here are not automatically written back to Google Sheets.');google.append(view);
}else{
 header(google,'Google Sheets connection');
 const p=$('p','','Source: ');link(p,'Friendsgiving Day 2k26 · Guest List',source);google.append(p);
 googleStatus=$('p','','Checking guest and payment synchronization…');google.append(googleStatus);
 actions(google,checkGoogle,'Open original Google Sheet',source);
}
header(form,'Form responses connection');
let p=$('p','','Source: ');link(p,'HALO FRIENDSGIVING FIELD DAY 🏆 (Responses)',responses);form.append(p);
 formStatus=$('p','','Checking matched responses…');form.append(formStatus);
 form.append($('p','fg-note','Form submissions are matched to existing guests without changing payment status or publishing any form details on the public Friendsgiving page.'));
 form.append($('p','fg-restricted','Only matching summaries are shown here. Contact details and dietary/allergy notes stay in the original Sheet; the admin pages are currently not sign-in protected.'));
 actions(form,checkForm,'Review guest matches','/admin/responses');
 const setup=$('p','fg-note','To receive future form submissions automatically, install the private response synchronization script in the original Google Sheet.');form.append(setup);link(form,'Response connection setup instructions','https://github.com/Jhamal96/Friendsgiving/blob/main/integrations/FORM-RESPONSES.md');
 root.append(google,form);
 const heading=box.querySelector('h2');
 if(heading)heading.insertAdjacentElement('afterend',root);
 else box.prepend(root);
async function checkGoogle(){
 if(!googleStatus)return;
 googleStatus.textContent='Checking connection…';
 try{
  const r=await fetch('/api/sheets-sync',{cache:'no-store'});if(!r.ok)throw Error('Unavailable');
  const d=await r.json();
  googleStatus.textContent=d.lastSuccessAt
   ?'Automatic Sheets → Friendsgiving sync active. Last checked: '+new Date(d.lastSuccessAt).toLocaleString()+'. Last run: '+d.lastChanges+' changes.'
   :'Initial guest snapshot imported. Automatic sync has not reported a successful check yet.';
 }catch{googleStatus.textContent='Cannot check guest and payment connection right now.'}
}
async function checkForm(){
 formStatus.textContent='Checking matching summary…';
 try{
  const r=await fetch('/admin/api/form-responses',{cache:'no-store'});if(!r.ok)throw Error('Unavailable');
  const d=await r.json();
  formStatus.textContent=d.uniqueRespondents+' distinct responses, '+d.matchedCount+' matched to existing guests, '+d.needsReviewCount+' requiring review. '+(d.mode==='live_google_form_sync'?'Automatic response updates active.':'Initial file imported; automatic response updates need Google Apps Script authorization.');
 }catch{formStatus.textContent='Form matching status temporarily unavailable.'}
}
checkForm();
if(!prior)checkGoogle();
})();
