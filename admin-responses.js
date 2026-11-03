(()=>{'use strict';
const $=id=>document.getElementById(id);
const settings=$('responsesSettings');
$('responseSettingsButton').addEventListener('click',()=>settings.showModal());
$('closeResponsesSettings').addEventListener('click',()=>settings.close());
const item=(name,description)=>{
 const li=document.createElement('li'),main=document.createElement('span');main.textContent=name;li.append(main);
 if(description){const small=document.createElement('small');small.textContent=description;li.append(small)}return li;
};
function fill(target,rows,render){
 const box=$(target);box.replaceChildren();
 if(!rows.length){box.append(item('None yet',''));return}
 rows.forEach((row,index)=>{
  const li=render(row);li.dataset.searchIndex=String(index);box.append(li);
 });
}
// Form and Guest List content changes are tracked separately from routine
// sync timestamps. Only acknowledge a particular snapshot after the organizer
// clicks Acknowledge; the same update never pops up again in this browser.
const syncDialog=$('syncChangesDialog');
const syncList=$('syncChangesList');
const syncSummary=$('syncChangesSummary');
const syncAck=$('acknowledgeSyncChanges');
const syncLater=$('dismissSyncChanges');
const syncStorageKey='friendsgiving-form-guest-updates-ack-v1';
let latestSnapshot=null,latestChanges=[],changeIdentity='',dismissedIdentity='';
let memoryAcknowledgement=null,loading=false;
function storedAcknowledgement(){
 try{
  const saved=JSON.parse(localStorage.getItem(syncStorageKey)||'null');
  if(saved&&saved.version===1&&saved.entries&&typeof saved.entries==='object')return saved;
 }catch{}
 return memoryAcknowledgement;
}
function captureSnapshot(snapshot){
 const entries={};
 for(const row of snapshot?.items||[]){
  if(!row?.id||!row.signature)continue;
  entries[row.id]={
   signature:row.signature,source:row.source,label:row.label,
   team:row.team||null,isPublished:row.isPublished===true,
   companions:Array.isArray(row.companions)?row.companions:[],
   paymentEntry:row.paymentEntry===true
  };
 }
 return {version:1,entries};
}
function markAcknowledged(snapshot){
 const entry=captureSnapshot(snapshot);
 memoryAcknowledgement=entry;
 try{localStorage.setItem(syncStorageKey,JSON.stringify(entry))}catch{}
}
function changesSince(snapshot,ack){
 const old=ack?.entries||{},now=new Map((snapshot?.items||[]).map(row=>[row.id,row]));
 const updates=[];
 for(const [id,row] of now){
  const previous=old[id];
  if(!previous||previous.signature!==row.signature){
   updates.push({kind:previous?'updated':'new',current:row,previous:previous||null});
  }
 }
 for(const [id,previous] of Object.entries(old)){
  if(!now.has(id))updates.push({kind:'removed',current:null,previous:{...previous,id}});
 }
 const order={new:0,updated:1,removed:2};
 updates.sort((a,b)=>order[a.kind]-order[b.kind]||
  (a.current?.source||a.previous?.source||'').localeCompare(b.current?.source||b.previous?.source||'')||
  (a.current?.label||a.previous?.label||'').localeCompare(b.current?.label||b.previous?.label||''));
 return updates;
}
function createText(tag,className,textValue){
 const e=document.createElement(tag);if(className)e.className=className;
 e.textContent=textValue;return e;
}
function describeTeam(row,previous,kind){
 if(kind==='removed')return 'Removed from this source; verify the latest team assignments.';
 if(row.paymentEntry)return 'Separate +1 payment entry — not itself a team member.';
 if(!row.team)return 'Not added to a team yet.';
 const prefix=row.isPublished?'':'Private draft — ';
 if(previous?.team&&previous.team!==row.team)return prefix+'Moved from '+previous.team+' to '+row.team+' team.';
 if(!previous?.team)return prefix+'Added to '+row.team+' team'+(row.isPublished?' (published).':' (not published).');
 return prefix+'Assigned to '+row.team+' team'+(row.isPublished?' (published).':' (not published).');
}
function displayChanges(changes,manual=false){
 syncList.replaceChildren();
 const formCount=changes.filter(x=>(x.current||x.previous)?.source==='form').length;
 const guestCount=changes.filter(x=>(x.current||x.previous)?.source==='guest').length;
 syncSummary.textContent=manual
  ?'Current Form and Guest List team placement status. No new changes are being acknowledged.'
  :formCount+' Form '+(formCount===1?'change':'changes')+' · '+guestCount+
    ' Guest List '+(guestCount===1?'change':'changes')+'. Review who was assigned, then acknowledge.';
 if(!changes.length){
  syncList.append(createText('li','','No updates have arrived since your last acknowledgement.'));
 }
 for(const change of changes){
  const row=change.current||change.previous,old=change.previous;
  if(!row)continue;
  const li=document.createElement('li');
  li.append(createText('strong','',row.label||'Guest'));
  const source=row.source==='form'?'Google Form':'Guest List';
  const event=change.kind==='new'?'New entry':change.kind==='removed'?'Removed entry':
   change.kind==='updated'?'Updated entry':'Current status';
  li.append(createText('small','',source+' · '+event));
  const team=describeTeam(row,old,change.kind);
  li.append(createText('span','source-team'+(!row.team?' is-unassigned':''),team));
  for(const plus of Array.isArray(row.companions)?row.companions:[]){
   const where=plus.team
    ?(row.isPublished?'Team '+plus.team+' (published)':'Draft team '+plus.team+' (not published)')
    :'Not added to a team';
   li.append(createText('p','source-companion','Plus-one '+plus.name+': '+where));
  }
  syncList.append(li);
 }
 syncAck.textContent=manual?'Close report':'Acknowledge updates';
 syncLater.hidden=manual;
}
function openChanges(changes,manual=false){
 displayChanges(changes,manual);
 if(!syncDialog.open)syncDialog.showModal();
}
function changeKeyFor(changes){
 return JSON.stringify(changes.map(c=>[
  (c.current||c.previous)?.id||'',
  c.current?.signature||'removed',c.kind
 ]));
}
function considerUpdate(snapshot){
 if(!snapshot||!Array.isArray(snapshot.items))return;
 latestSnapshot=snapshot;
 const seen=storedAcknowledgement();
 // An existing dataset is a baseline, not a newly arrived change.
 if(!seen){markAcknowledged(snapshot);latestChanges=[];return}
 latestChanges=changesSince(snapshot,seen);
 changeIdentity=changeKeyFor(latestChanges);
 if(!latestChanges.length){
  dismissedIdentity='';
  return;
 }
 // If a second sync happens while this report is open, include the newly
 // changed entries before the user can acknowledge them.
 if(syncDialog.open){openChanges(latestChanges);return}
 if(changeIdentity===dismissedIdentity)return;
 if(document.querySelector('dialog[open]'))return;
 openChanges(latestChanges);
}
syncAck.addEventListener('click',()=>{
 if(latestChanges.length&&latestSnapshot){
  markAcknowledged(latestSnapshot);
  latestChanges=[];changeIdentity='';dismissedIdentity='';
 }
 syncDialog.close();
});
syncLater.addEventListener('click',()=>{
 dismissedIdentity=changeIdentity;
 syncDialog.close();
});
syncDialog.addEventListener('cancel',()=>{dismissedIdentity=changeIdentity});
settings.addEventListener('close',()=>{
 if(latestChanges.length&&changeIdentity!==dismissedIdentity&&!syncDialog.open){
  openChanges(latestChanges);
 }
});
$('viewSyncUpdates').addEventListener('click',()=>{
 if(!latestSnapshot)return;
 if(latestChanges.length){openChanges(latestChanges);return}
 const all=(latestSnapshot.items||[]).map(current=>({kind:'current',current,previous:{team:current.team}}));
 openChanges(all,true);
});
window.addEventListener('storage',event=>{
 if(event.key!==syncStorageKey)return;
 const ack=storedAcknowledgement();
 if(!latestSnapshot||!ack)return;
 latestChanges=changesSince(latestSnapshot,ack);
 if(!latestChanges.length&&syncDialog.open)syncDialog.close();
});
function responseSearch(query,matches){
 const results=[];
 for(const [id,category] of [['matchedNames','Ready for teams'],['reviewRows','Needs review'],['plusOneMatches','Plus-ones']]){
  const root=$(id);
  for(const li of root?.querySelectorAll('[data-search-index]')||[]){
   const heading=li.querySelector('span')?.textContent||'Response';
   const description=li.querySelector('small')?.textContent||'';
   if(!matches(query,heading,description,category))continue;
   results.push({
    title:heading,detail:description,group:category,
    activate:()=>window.FriendsgivingSearch?.navigate(li)
   });
  }
 }
 return results;
}
window.FriendsgivingSearch?.register(responseSearch);
async function load(silent=false){
 if(loading)return;
 loading=true;
 if(!silent)$('responseStatus').textContent='Checking form response matches…';
 try{
  const r=await fetch('/admin/api/form-responses',{cache:'no-store'});
  if(!r.ok)throw Error('Connection unavailable');
  const d=await r.json();
  $('responseCount').textContent=d.uniqueRespondents;
  $('matchCount').textContent=d.matchedCount;
  $('reviewCount').textContent=d.needsReviewCount;
  $('plusOneCount').textContent=d.plusOneMatchedCount;
  fill('matchedNames',d.matched||[],r=>item(r.guest,'Source row '+r.sourceRow+' · '+r.matchMethod+
   ' · '+(r.team?'Assigned to '+r.team+' team'+(d.isPublished?' (published)':' (private draft)'):'Not added to a team yet')));
  const reasons={
   'no-match':'Name not found in Guest List',
   'ambiguous-name':'Multiple possible guest matches; verify manually',
   'duplicate-match':'Guest List entry already matched to another form response',
   'payment-or-rsvp-pending':'RSVP and payment must both be Yes',
   'duplicate-first-name':'First name already used; distinguish before assigning'
  };
  fill('reviewRows',d.review||[],r=>{
   const heading=r.formHint?'Form: '+r.formHint:'Response row '+r.sourceRow;
   let detail='Form row '+r.sourceRow+' · '+(reasons[r.status]||'Review the original Form and Guest List');
   if(r.status==='payment-or-rsvp-pending'){
    detail+=' · Guest: '+(r.guest||'Matched')+
     ' · RSVP: '+(r.rsvpConfirmed?'Yes':'Not confirmed')+
     ' · Paid: '+(r.paidConfirmed?'Yes':'Not confirmed');
   }else if(Array.isArray(r.suggestedGuests)&&r.suggestedGuests.length){
    detail+=' · Possible Guest List name'+(r.suggestedGuests.length===1?'':'s')+
     ': '+r.suggestedGuests.join(', ')+' (verify manually)';
   }else if(r.guest){
    detail+=' · Guest: '+r.guest;
   }
   return item(heading,detail);
  });
  fill('plusOneMatches',d.plusOneMatches||[],r=>{
   const name=r.guest||'Response row '+r.sourceRow;
   const paired=r.with?'With '+r.with+' · ':'';
   const state=r.status==='matched'?'Eligible for teams':'Needs review';
   const placement=r.team?' · '+r.team+' team'+(d.isPublished?' (published)':' (private draft)'):' · Not added to a team';
   const description=paired+state+placement+' · '+(r.reason||'Verify payment and RSVP')+' · Form row '+r.sourceRow;
   return item(name,description);
  });
  const fmt=value=>value?new Date(value).toLocaleString():'No successful check';
  const formOk=d.formConnectionFresh===true,guestOk=d.guestConnectionFresh===true;
  const message='Guest List checked: '+fmt(d.lastGuestSync)+'. Forms received: '+fmt(d.lastImportedAt)+'.';
  $('responseStatus').textContent=message+(formOk&&guestOk
   ?' Both connections are receiving updates.'
   :' At least one source has not checked in recently; review the Apps Script triggers in Settings.')+
   (d.syncConflicts?' '+d.syncConflicts+' Guest List conflicts need review.':'')+
   ' '+d.eligibleParticipantCount+' eligible people including named companions. Teams are '+(d.isPublished?'published.':'unpublished.');
  considerUpdate(d.changeSnapshot);
  window.FriendsgivingSearch?.refresh();
 }catch{if(!silent)$('responseStatus').textContent='Unable to load response matching. Reload or check connections in Settings.'}
 finally{loading=false}
}
$('reloadMatches').addEventListener('click',()=>load(false));
setInterval(()=>{if(!document.hidden)load(true)},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load(true)});
load();
})();
