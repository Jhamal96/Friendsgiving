(()=>{'use strict';
const $=id=>document.getElementById(id);
let teams=[],guests=[],guestGroups=[],draftRevision=null,publishedBaseline='[]',isPublished=false,dirty=false;
let saving=false,publishing=false,blocked=false,version=0,autosaveTimer=null,savePromise=null;
const cards=$('teamCards'),status=$('teamStatus'),save=$('saveTeams'),unpublish=$('unpublishTeams'),publication=$('teamPublicationStatus');
const serial=teamList=>JSON.stringify(teamList);
function refreshPublishButton(){
 save.disabled=publishing||blocked||!teams.length||(isPublished&&serial(teams)===publishedBaseline);
 save.textContent=isPublished?'Publish changes':'Publish teams';
 unpublish.disabled=publishing||blocked||!isPublished;
 publication.textContent=isPublished?'● Published — guests can look up their team.':'○ Unpublished — guest lookups are hidden.';
}
function markDirty(){
 dirty=true;version++;status.textContent='Draft changed · Saving automatically…';
 refreshPublishButton();clearTimeout(autosaveTimer);
 if(!blocked)autosaveTimer=setTimeout(saveDraft,700);
}
async function saveDraft(){
 clearTimeout(autosaveTimer);autosaveTimer=null;
 if(blocked||!dirty)return !blocked;
 if(saving){await savePromise;if(dirty&&!blocked)return saveDraft();return !blocked}
 saving=true;const snapshot=structuredClone(teams),sentVersion=version,atRevision=draftRevision;
 status.textContent='Autosaving private team draft…';
 savePromise=(async()=>{
  try{
   const response=await fetch('/admin/api/team-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teams:snapshot,revision:atRevision})});
   const result=await response.json().catch(()=>({}));
   if(response.status===409){blocked=true;throw Error('Team draft changed in another tab. Your unsaved edits are still here; refresh to review before saving again.')}
   if(!response.ok)throw Error(result.error||'Could not autosave teams. Please try editing again.');
   draftRevision=result.revision;
   if(sentVersion===version)dirty=false;
   status.textContent=dirty?'Saving newer team edits…':isPublished&&serial(teams)===publishedBaseline?'✓ Draft autosaved · Published':'✓ Draft autosaved · Not yet published';
  }catch(e){dirty=true;status.textContent='⚠ '+e.message}
  finally{saving=false;refreshPublishButton();if(dirty&&!blocked&&version!==sentVersion){clearTimeout(autosaveTimer);autosaveTimer=setTimeout(saveDraft,400)}}
 })();
 await savePromise;
 return !dirty&&!blocked;
}

function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function btn(label,action,cls){const b=el('button',cls,label);b.type='button';b.addEventListener('click',action);return b}
function input(label,value,limit,change){const l=el('label','edit-label',label),i=el('input');i.type='text';i.maxLength=limit;i.value=value||'';i.addEventListener('input',()=>change(i.value));l.append(i);return {label:l,input:i}}
function cleanName(name){return String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z\s]/g,' ').replace(/\s+/g,' ').trim()}
function nameKey(name){const s=String(name||'').trim(),plus=/\+\s*1\s*$/.test(s);return cleanName(plus?s.replace(/\+\s*1\s*$/,''):s).toLowerCase()+(plus?' +1':'')}
function canonical(name){const k=nameKey(name);const group=guestGroups.find(g=>nameKey(g.primary)===k||nameKey(g.alias)===k);return group?nameKey(group.primary):k}
function uniqueMembers(xs){const seen=new Set();return xs.map(x=>x.trim()).filter(x=>{const k=nameKey(x);if(!k||seen.has(k))return false;seen.add(k);return true})}
function captainNames(){
 const names=new Map();
 for(const t of teams){const name=(t.captain||'').trim(),key=canonical(name);if(!key)continue;if(names.has(key))return {error:'Captain '+name+' is already assigned to '+names.get(key)+'. Give each team its own captain.'};names.set(key,t.name||'another team')}
 return {names:new Set(names.keys())};
}
function randomIndex(length){const top=4294967296,limit=Math.floor(top/length)*length;let n;do{const x=new Uint32Array(1);crypto.getRandomValues(x);n=x[0]}while(n>=limit);return n%length}
function randomizeTeams(){
 if(teams.length<2){status.textContent='Create at least two teams before randomizing.';return}
 const captains=captainNames();
 if(captains.error){status.textContent='⚠ '+captains.error;return}
 if(!guests.length){status.textContent='No eligible paid players or plus-ones are available.';return}
 if(teams.some(t=>t.members.length)&&!confirm('Randomize all eligible players, including each paid and RSVP-confirmed plus-one independently? Captains stay with their teams. This replaces the private draft assignments, but does not publish them automatically.'))return;
 // One random slot per verified participant. A paid +1 is a named player,
 // and can land on a different team from the person who registered them.
 const eligible=new Map();
 for(const name of guests){
  const key=canonical(name);
  if(!key||captains.names.has(key)||eligible.has(key))continue;
  eligible.set(key,name);
 }
 const shuffled=[...eligible.values()];
 // Fisher-Yates: uniform shuffle using cryptographically secure indices.
 for(let i=shuffled.length-1;i>0;i--){
  const j=randomIndex(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
 }
 const next=teams.map(()=>[]);
 const sizes=teams.map(t=>canonical(t.captain)?1:0);
 for(const name of shuffled){
  const min=Math.min(...sizes);
  const available=sizes.map((size,i)=>size===min?i:-1).filter(i=>i>=0);
  const target=available[randomIndex(available.length)];
  next[target].push(name);sizes[target]++;
 }
 teams.forEach((team,i)=>{team.members=next[i]});
 markDirty();render();
 status.textContent='✓ Randomized '+shuffled.length+' eligible players, including paid plus-ones independently. Captains remain on their own teams. Save the draft and publish changes when ready.';
}
function render(){
 cards.replaceChildren();
 if(!teams.length)cards.append(el('p','empty','No teams in your draft yet. Create a team to begin.'));
 teams.forEach((team,index)=>{
  const card=el('article','team-card');
  const h=el('h2','',team.name||'New team');card.append(h);
  if(team.caption)card.append(el('p','team-caption',team.caption));
  card.append(el('p','muted','Captain: '+(team.captain||'To be announced')));
  const roster=el('p','roster','Members: '+(team.members.length?team.members.join(', '):'No additional players yet'));card.append(roster);
  const actions=el('div','team-actions');
  actions.append(btn('Edit team',()=>openEditor(index),'primary'));
  const up=btn('↑',()=>move(index,-1)),down=btn('↓',()=>move(index,1));up.title='Move team up';down.title='Move team down';up.disabled=index===0;down.disabled=index===teams.length-1;actions.append(up,down);
  actions.append(btn('Remove',()=>{if(!confirm('Remove '+(team.name||'this team')+' from the team lineup?'))return;teams.splice(index,1);markDirty();render()},'danger'));
  card.append(actions);cards.append(card);
 });
 $('randomizeTeams').disabled=teams.length<2||!guests.length;
 $('teamCount').textContent=teams.length+' '+(teams.length===1?'team':'teams')+' · '+teams.reduce((sum,t)=>sum+t.members.length+(nameKey(t.captain)?1:0),0)+' assigned people (captains included)';
}
function move(index,delta){const other=index+delta;if(other<0||other>=teams.length)return;[teams[index],teams[other]]=[teams[other],teams[index]];markDirty();render()}
function openEditor(index){
 const creating=index===null;
 const draft=creating?{id:'team-'+crypto.randomUUID(),name:'',caption:'',captain:'',members:[]}:structuredClone(teams[index]);
 const modal=$('editTeam');$('editTeamTitle').textContent=creating?'Add a team':'Edit team';
 const area=$('teamFields');area.replaceChildren();
 for(const [label,key,max] of [['Team name','name',80],['Team captain','captain',100],['Team motto (optional)','caption',220]]){
  const field=input(label,draft[key],max,v=>draft[key]=v);area.append(field.label);
 }
 const caption=el('p','muted',creating?'Create and save this team first. Randomize Teams includes paid and RSVP-confirmed guests plus paid named companions, each drawn independently.':'Choose eligible guests and paid companions with inviter RSVPs. Each player can be placed on either team, or use Randomize Teams to reshuffle.');area.append(caption);
 if(creating){const note=el('p','muted','No members are assigned during team creation.');area.append(note)}
 const entry=el('div','member-entry'),memberSelect=el('select');
 memberSelect.setAttribute('aria-label','Form participants who are paid and RSVP confirmed');
 const members=el('div','member-list'),error=el('p','error'),availableCount=el('p','muted');
 error.setAttribute('role','status');availableCount.setAttribute('aria-live','polite');
 const assignedElsewhere=name=>teams.some((t,j)=>j!==index&&t.members.some(m=>nameKey(m)===nameKey(name)));
 const reservedByCaptain=name=>teams.some((t,j)=>j!==index&&canonical(t.captain)&&canonical(t.captain)===canonical(name))||(canonical(draft.captain)&&canonical(draft.captain)===canonical(name));
 const availableGuests=()=>guests.filter(g=>!reservedByCaptain(g)&&!draft.members.some(m=>nameKey(m)===nameKey(g))&&!assignedElsewhere(g));
 function drawChoices(){
  const choices=availableGuests(),previous=memberSelect.value;
  memberSelect.replaceChildren();
  const placeholder=el('option','','Select an eligible form participant…');placeholder.value='';memberSelect.append(placeholder);
  choices.forEach(g=>{const option=el('option','',g);option.value=g;memberSelect.append(option)});
  memberSelect.value=choices.includes(previous)?previous:'';
  memberSelect.disabled=!choices.length;addButton.disabled=!choices.length;randomButton.disabled=!choices.length;
  availableCount.textContent=choices.length+' eligible form '+(choices.length===1?'participant':'participants')+' available';
 }
 function drawMembers(){
  members.replaceChildren();
  if(!draft.members.length)members.append(el('span','muted','No members assigned yet'));
  draft.members.forEach((g,i)=>{
   const chip=el('span','member-chip',g+' ');
   chip.append(btn('×',()=>{draft.members.splice(i,1);drawMembers();drawChoices()},'remove-member'));
   members.append(chip);
  });
 }
 function addMember(member){
  if(!member){error.textContent='Choose a confirmed guest first.';return}
  if(!availableGuests().includes(member)){error.textContent='This guest is already assigned or no longer confirmed.';return}
  // Members, including named plus-ones, may be assigned to separate teams.
  // Do not silently move the person's inviter or any other companion.
  if(canonical(member)!==canonical(draft.captain)&&!draft.members.some(m=>nameKey(m)===nameKey(member)))draft.members.push(member);
  error.textContent='';drawMembers();drawChoices();
 }
 const addButton=btn('+ Add member',()=>addMember(memberSelect.value));
 const randomButton=btn('🎲 Random Pick',()=>{
  const available=availableGuests();
  if(!available.length){error.textContent='No unassigned eligible guests or paid companions are available.';return}
  // Use the browser's random values, avoiding modulo bias for a fair random pick.
  const max=0x100000000,limit=Math.floor(max/available.length)*available.length;
  let value;do{const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);value=bytes[0]}while(value>=limit);
  addMember(available[value%available.length]);
 },'random-pick');
 entry.append(memberSelect,addButton,randomButton);
 if(!creating)area.append(entry,availableCount,members,error);else area.append(error);drawMembers();drawChoices();
 const submit=$('confirmTeam'),cancel=$('cancelTeam');
 submit.onclick=()=>{
 if(!draft.name.trim()){error.textContent='Enter a team name.';area.querySelector('input').focus();return}
 draft.name=draft.name.trim();draft.caption=draft.caption.trim();draft.captain=cleanName(draft.captain);draft.members=uniqueMembers(draft.members);
 const key=canonical(draft.captain);
 if(key){
  const conflict=teams.some((t,i)=>i!==index&&(canonical(t.captain)===key||t.members.some(m=>canonical(m)===key)));
  if(conflict){error.textContent='This captain is already assigned to another team. Choose a different captain or remove their other assignment first.';return}
  // A captain belongs on their own team, never twice as an additional member.
  draft.members=draft.members.filter(m=>canonical(m)!==key);
 }
 if(creating)teams.push(draft);else teams[index]=draft;
 modal.close();markDirty();render()
};
 cancel.onclick=()=>modal.close();
 modal.showModal();area.querySelector('input').focus();
}
function updateSourceStatus(result){
 const node=$('teamSourcesStatus'),info=result.syncSources||{};
 if(!node)return;
 const format=value=>value?new Date(value).toLocaleString():'no check recorded';
 const recent=value=>value&&Number.isFinite(Date.parse(value))&&Date.now()-Date.parse(value)<30*60*1000;
 node.textContent='Google Guest List: '+format(info.guestLastSuccessAt)+
  ' · Google Form: '+format(info.formLastSuccessAt)+'. '+
  (recent(info.guestLastSuccessAt)&&recent(info.formLastSuccessAt)
   ?'Both automatic feeds are recent.'
   :'One or both feeds may need checking in Settings.')+
  (info.guestConflicts?' '+info.guestConflicts+' Guest List conflict(s) need review.':'');
}
async function start(){
 try{
  const response=await fetch('/admin/api/team-draft',{cache:'no-store'});
  if(!response.ok)throw Error('Unable to load saved team drafts.');
  const result=await response.json();
  if(!Array.isArray(result.teams)||!Array.isArray(result.publishedTeams)||!Number.isSafeInteger(result.revision))throw Error('Team draft data invalid.');
  teams=result.teams;guests=Array.isArray(result.guests)?result.guests:[];guestGroups=Array.isArray(result.guestGroups)?result.guestGroups:[];isPublished=result.isPublished===true;draftRevision=result.revision;
  const info=$('teamEligibilityInfo');if(info)info.textContent=guests.length+' eligible people: primary guests paid and RSVP-confirmed, plus named companions paid with inviter RSVP. '+(result.companionNeedsReview||0)+' companions need payment or RSVP review.';
  updateSourceStatus(result);
  if(result.syncWarning)status.textContent='⚠ '+result.syncWarning;
  publishedBaseline=serial(result.publishedTeams);dirty=false;blocked=false;
  $('addTeam').disabled=false;render();refreshPublishButton();
  if(!result.syncWarning)status.textContent=isPublished&&serial(teams)===publishedBaseline?'Autosave on · Teams published':'Autosave on · Private draft ready; publish when you choose';
 }catch(e){status.textContent='⚠ '+e.message;$('addTeam').disabled=true;save.disabled=true}
}
$('addTeam').addEventListener('click',()=>openEditor(null));
$('randomizeTeams').addEventListener('click',randomizeTeams);
// Keep an open organizer page aligned with Google Sheet and Form response changes.
setInterval(async()=>{
 if(document.hidden||dirty||saving||publishing||blocked||$('editTeam').open)return;
 try{
  const response=await fetch('/admin/api/team-draft',{cache:'no-store'});
  if(!response.ok)return;
  const result=await response.json();
  if(!Array.isArray(result.teams)||!Array.isArray(result.guests)||!Number.isSafeInteger(result.revision))return;
  if(dirty||saving||publishing||$('editTeam').open)return;
  const previousRevision=draftRevision,previousGuests=JSON.stringify(guests),wasPublished=isPublished;
  draftRevision=result.revision;
  guests=result.guests;guestGroups=Array.isArray(result.guestGroups)?result.guestGroups:[];isPublished=result.isPublished===true;
  publishedBaseline=serial(result.publishedTeams||[]);
  const info=$('teamEligibilityInfo');
  if(info)info.textContent=guests.length+' eligible people: primary guests paid and RSVP-confirmed, plus named companions paid with inviter RSVP. '+(result.companionNeedsReview||0)+' companions need payment or RSVP review.';
  updateSourceStatus(result);
  if(previousRevision!==draftRevision||previousGuests!==JSON.stringify(guests)||wasPublished!==isPublished){
   teams=result.teams;render();refreshPublishButton();
   status.textContent=isPublished?'✓ Published teams refreshed from form and payment changes.':'✓ Team draft refreshed; guest lookups remain unpublished.';
  }
 }catch{}
},60000);

save.addEventListener('click',async()=>{
 if(blocked||publishing)return;
 publishing=true;save.disabled=true;
 try{
  if(dirty||saving){const saved=await saveDraft();if(!saved)throw Error('Draft must be saved before publishing. Review the autosave status.')}
  const latest=await fetch('/admin/api/teams',{cache:'no-store'});
  if(!latest.ok)throw Error('Unable to confirm the published lineup.');
  const current=await latest.json();
  if(serial(current.teams||[])!==publishedBaseline||current.isPublished!==isPublished)throw Error('Publication changed elsewhere. Refresh to review it.');
  const publishingVersion=version,snapshot=structuredClone(teams);
  status.textContent='Publishing saved team assignments…';
  const r=await fetch('/admin/api/teams',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'publish',teams:snapshot,revision:current.revision})});
  const result=await r.json().catch(()=>({}));
  if(r.status===409)throw Error('The guest list changed during publication. Refresh and review before publishing.');
  if(!r.ok)throw Error(result.error||'Unable to publish team lineup.');
  publishedBaseline=serial(result.teams);isPublished=true;status.textContent=version===publishingVersion?'✓ Teams published! The main page is updated.':'✓ Earlier draft published; newer edits still need publishing.';
 }catch(e){status.textContent='⚠ '+e.message}
 finally{publishing=false;refreshPublishButton()}
});
unpublish.addEventListener('click',async()=>{
 if(!isPublished||publishing||blocked)return;
 if(!confirm('Hide published teams from the Friendsgiving page? Your saved teams and private drafts will remain.'))return;
 publishing=true;refreshPublishButton();
 try{
  const latest=await fetch('/admin/api/teams',{cache:'no-store'});
  if(!latest.ok)throw Error('Unable to check publication status.');
  const current=await latest.json();
  if(!current.isPublished||serial(current.teams||[])!==publishedBaseline)throw Error('The public lineup changed. Refresh before unpublishing.');
  const response=await fetch('/admin/api/teams',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'unpublish',revision:current.revision})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Unable to unpublish teams.');
  isPublished=false;publishedBaseline=serial(result.teams||[]);
  status.textContent='✓ Teams unpublished. Public lookups are hidden. Your private draft remains saved.';
 }catch(e){status.textContent='⚠ '+e.message}
 finally{publishing=false;refreshPublishButton()}
});
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty&&!blocked)saveDraft()});
window.addEventListener('beforeunload',e=>{if(dirty||saving||publishing){e.preventDefault();e.returnValue=''}});
start();
})();
