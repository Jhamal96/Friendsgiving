(()=>{'use strict';
const $=id=>document.getElementById(id);
let teams=[],guests=[],draftRevision=null,publishedBaseline='[]',dirty=false;
let saving=false,publishing=false,blocked=false,version=0,autosaveTimer=null,savePromise=null;
const cards=$('teamCards'),status=$('teamStatus'),save=$('saveTeams');
const serial=teamList=>JSON.stringify(teamList);
function refreshPublishButton(){save.disabled=publishing||blocked||serial(teams)===publishedBaseline}
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
   status.textContent=dirty?'Saving newer team edits…':serial(teams)===publishedBaseline?'✓ Draft autosaved · Already published':'✓ Draft autosaved · Not yet published';
  }catch(e){dirty=true;status.textContent='⚠ '+e.message}
  finally{saving=false;refreshPublishButton();if(dirty&&!blocked&&version!==sentVersion){clearTimeout(autosaveTimer);autosaveTimer=setTimeout(saveDraft,400)}}
 })();
 await savePromise;
 return !dirty&&!blocked;
}

function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function btn(label,action,cls){const b=el('button',cls,label);b.type='button';b.addEventListener('click',action);return b}
function input(label,value,limit,change){const l=el('label','edit-label',label),i=el('input');i.type='text';i.maxLength=limit;i.value=value||'';i.addEventListener('input',()=>change(i.value));l.append(i);return {label:l,input:i}}
function nameKey(name){return String(name||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US')}
function uniqueMembers(xs){const seen=new Set();return xs.map(x=>x.trim()).filter(x=>{const k=nameKey(x);if(!k||seen.has(k))return false;seen.add(k);return true})}
function captainNames(){
 const names=new Map();
 for(const t of teams){const name=(t.captain||'').trim(),key=nameKey(name);if(!key)continue;if(names.has(key))return {error:'Captain '+name+' is already assigned to '+names.get(key)+'. Give each team its own captain.'};names.set(key,t.name||'another team')}
 return {names:new Set(names.keys())};
}
function randomIndex(length){const top=4294967296,limit=Math.floor(top/length)*length;let n;do{const x=new Uint32Array(1);crypto.getRandomValues(x);n=x[0]}while(n>=limit);return n%length}
function randomizeTeams(){
 if(teams.length<2){status.textContent='Create at least two teams before randomizing.';return}
 const captains=captainNames();
 if(captains.error){status.textContent='⚠ '+captains.error;return}
 if(!guests.length){status.textContent='No RSVP-confirmed guests are available.';return}
 const confirmed=new Map();
 for(const guest of guests){const key=nameKey(guest);if(key&&!confirmed.has(key))confirmed.set(key,guest)}
 const available=Array.from(confirmed.entries()).filter(([key])=>!captains.names.has(key)).map(([,guest])=>guest);
 if(teams.some(t=>t.members.length)&&!confirm('Randomize all confirmed guests across the teams? Each captain will stay on their own team and count once. This replaces the current private draft assignments.'))return;
 // Fisher-Yates with unbiased random indices; no captain can be chosen.
 for(let i=available.length-1;i>0;i--){const j=randomIndex(i+1);[available[i],available[j]]=[available[j],available[i]]}
 teams.forEach(t=>{t.members=[]});
 // Include each captain in team size when balancing, without duplicating them in members.
 const teamSize=teams.map(t=>nameKey(t.captain)?1:0);
 for(const guest of available){
  const min=Math.min(...teamSize),choices=[];
  for(let i=0;i<teamSize.length;i++)if(teamSize[i]===min)choices.push(i);
  const index=choices[randomIndex(choices.length)];
  teams[index].members.push(guest);teamSize[index]++;
 }
 markDirty();render();
 status.textContent='Randomized '+confirmed.size+' confirmed guests; captains stay on their own teams, without duplicates. Draft autosaves; select Publish teams when ready.';
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
 const caption=el('p','muted',creating?'Create and save this team first. After creating all teams, use Randomize Teams to distribute confirmed guests.':'Adjust assigned members manually here, or return to Randomize Teams to redistribute everyone.');area.append(caption);
 if(creating){const note=el('p','muted','No members are assigned during team creation.');area.append(note)}
 const entry=el('div','member-entry'),memberSelect=el('select');
 memberSelect.setAttribute('aria-label','Confirmed guests available for this team');
 const members=el('div','member-list'),error=el('p','error'),availableCount=el('p','muted');
 error.setAttribute('role','status');availableCount.setAttribute('aria-live','polite');
 const assignedElsewhere=name=>teams.some((t,j)=>j!==index&&t.members.some(m=>nameKey(m)===nameKey(name)));
 const reservedByCaptain=name=>teams.some((t,j)=>(j!==index||nameKey(t.captain)!==nameKey(draft.captain))&&nameKey(t.captain)&&nameKey(t.captain)===nameKey(name))||nameKey(draft.captain)===nameKey(name);
 const availableGuests=()=>guests.filter(g=>!reservedByCaptain(g)&&!draft.members.some(m=>nameKey(m)===nameKey(g))&&!assignedElsewhere(g));
 function drawChoices(){
  const choices=availableGuests(),previous=memberSelect.value;
  memberSelect.replaceChildren();
  const placeholder=el('option','','Select a confirmed guest…');placeholder.value='';memberSelect.append(placeholder);
  choices.forEach(g=>{const option=el('option','',g);option.value=g;memberSelect.append(option)});
  memberSelect.value=choices.includes(previous)?previous:'';
  memberSelect.disabled=!choices.length;addButton.disabled=!choices.length;randomButton.disabled=!choices.length;
  availableCount.textContent=choices.length+' confirmed '+(choices.length===1?'guest':'guests')+' available to assign';
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
  draft.members.push(member);error.textContent='';drawMembers();drawChoices();
 }
 const addButton=btn('+ Add member',()=>addMember(memberSelect.value));
 const randomButton=btn('🎲 Random Pick',()=>{
  const available=availableGuests();
  if(!available.length){error.textContent='No unassigned confirmed guests are available.';return}
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
 draft.name=draft.name.trim();draft.caption=draft.caption.trim();draft.captain=draft.captain.trim();draft.members=uniqueMembers(draft.members);
 const key=nameKey(draft.captain);
 if(key){
  const conflict=teams.some((t,i)=>i!==index&&(nameKey(t.captain)===key||t.members.some(m=>nameKey(m)===key)));
  if(conflict){error.textContent='This captain is already assigned to another team. Choose a different captain or remove their other assignment first.';return}
  // A captain belongs on their own team, never twice as an additional member.
  draft.members=draft.members.filter(m=>nameKey(m)!==key);
 }
 if(creating)teams.push(draft);else teams[index]=draft;
 modal.close();markDirty();render()
};
 cancel.onclick=()=>modal.close();
 modal.showModal();area.querySelector('input').focus();
}
async function start(){
 try{
  const response=await fetch('/admin/api/team-draft',{cache:'no-store'});
  if(!response.ok)throw Error('Unable to load saved team drafts.');
  const result=await response.json();
  if(!Array.isArray(result.teams)||!Array.isArray(result.publishedTeams)||!Number.isSafeInteger(result.revision))throw Error('Team draft data invalid.');
  teams=result.teams;guests=Array.isArray(result.guests)?result.guests:[];draftRevision=result.revision;
  publishedBaseline=serial(result.publishedTeams);dirty=false;blocked=false;
  $('addTeam').disabled=false;render();refreshPublishButton();
  status.textContent=serial(teams)===publishedBaseline?'Autosave on · All teams already published':'Autosave on · Private team draft recovered, not published';
 }catch(e){status.textContent='⚠ '+e.message;$('addTeam').disabled=true;save.disabled=true}
}
$('addTeam').addEventListener('click',()=>openEditor(null));
$('randomizeTeams').addEventListener('click',randomizeTeams);
save.addEventListener('click',async()=>{
 if(blocked||publishing)return;
 publishing=true;save.disabled=true;
 try{
  if(dirty||saving){const saved=await saveDraft();if(!saved)throw Error('Draft must be saved before publishing. Review the autosave status.')}
  const latest=await fetch('/admin/api/teams',{cache:'no-store'});
  if(!latest.ok)throw Error('Unable to confirm the published lineup.');
  const current=await latest.json();
  if(serial(current.teams||[])!==publishedBaseline)throw Error('Someone else published a new lineup. Refresh to review it before publishing yours.');
  const publishingVersion=version,snapshot=structuredClone(teams);
  status.textContent='Publishing saved team assignments…';
  const r=await fetch('/admin/api/teams',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teams:snapshot,revision:current.revision})});
  const result=await r.json().catch(()=>({}));
  if(r.status===409)throw Error('The guest list changed during publication. Refresh and review before publishing.');
  if(!r.ok)throw Error(result.error||'Unable to publish team lineup.');
  publishedBaseline=serial(result.teams);status.textContent=version===publishingVersion?'✓ Teams published! The main page is updated.':'✓ Earlier draft published; newer edits still need publishing.';
 }catch(e){status.textContent='⚠ '+e.message}
 finally{publishing=false;refreshPublishButton()}
});
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty&&!blocked)saveDraft()});
window.addEventListener('beforeunload',e=>{if(dirty||saving||publishing){e.preventDefault();e.returnValue=''}});
start();
})();
