(()=>{'use strict';
const $=id=>document.getElementById(id);
let teams=[],guests=[],guestGroups=[],draftRevision=null,publishedBaseline='[]',isPublished=false,dirty=false;
let saving=false,publishing=false,blocked=false,version=0,autosaveTimer=null,savePromise=null;
let roleCandidates=[],roles={},roleCaptains=new Set(),roleRevision=null,rolesBusy=false,plusOnePlayers=[];
const ROLE_OPTIONS=[
 ['player','Playing'],['not_playing','Not playing'],['referee','Referee'],
 ['assistant_referee','Assistant referee'],['scorekeeper','Scorekeeper'],
 ['timekeeper','Timekeeper'],['coach','Coach'],['team_manager','Team manager'],
 ['announcer','Announcer / MC'],['photographer','Photographer'],
 ['volunteer','Event staff / volunteer'],['spectator','Spectator'],['other','Other position']
];
const cards=$('teamCards'),status=$('teamStatus'),save=$('saveTeams'),unpublish=$('unpublishTeams'),publication=$('teamPublicationStatus');
const serial=teamList=>JSON.stringify(teamList);
function refreshPublishButton(){
 save.disabled=publishing||rolesBusy||blocked||!teams.length||(isPublished&&serial(teams)===publishedBaseline);
 save.textContent=isPublished?'Publish changes':'Publish teams';
 unpublish.disabled=publishing||rolesBusy||blocked||!isPublished;
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
async function compactCaptainPhoto(file){
 // Convert original camera photos to a small, metadata-free JPG avatar.
 if(!file||file.size>10000000)throw Error('Choose an image smaller than 10 MB.');
 if(file.type&&!file.type.startsWith('image/'))throw Error('Choose an image file.');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{
   image.onload=resolve;
   image.onerror=()=>reject(Error('Could not open this picture. Try a JPG or PNG.'));
   image.src=url;
  });
 }finally{URL.revokeObjectURL(url)}
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 if(!ctx||!image.naturalWidth||!image.naturalHeight)throw Error('Unable to process image.');
 const crop=Math.min(image.naturalWidth,image.naturalHeight);
 const x=(image.naturalWidth-crop)/2,y=(image.naturalHeight-crop)/2;
 for(const side of [320,280,240,200,160]){
  canvas.width=side;canvas.height=side;
  ctx.fillStyle='#0a203a';ctx.fillRect(0,0,side,side);
  ctx.drawImage(image,x,y,crop,crop,0,0,side,side);
  for(const quality of [.78,.66,.54,.43,.32]){
   const photo=canvas.toDataURL('image/jpeg',quality);
   if(photo.startsWith('data:image/jpeg;base64,')&&photo.length<=32000)return photo;
  }
 }
 throw Error('Photo is too detailed to compress. Try a different picture.');
}

function cleanName(name){return String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z\s]/g,' ').replace(/\s+/g,' ').trim()}
function nameKey(name){const s=String(name||'').trim(),plus=/\+\s*1\s*$/.test(s);return cleanName(plus?s.replace(/\+\s*1\s*$/,''):s).toLowerCase()+(plus?' +1':'')}
function canonical(name){const k=nameKey(name);const group=guestGroups.find(g=>nameKey(g.primary)===k||nameKey(g.alias)===k);return group?nameKey(group.primary):k}
function uniqueMembers(xs){const seen=new Set();return xs.map(x=>x.trim()).filter(x=>{const k=nameKey(x);if(!k||seen.has(k))return false;seen.add(k);return true})}
function roleNameKey(name){return nameKey(name).split(' ')[0]}
function roleLabel(record){
 const role=record?.role||'player';
 return role==='other'?String(record?.title||'Other position'):ROLE_OPTIONS.find(x=>x[0]===role)?.[1]||'Playing';
}
function renderRoles(){
 const root=$('roleList');if(!root)return;
 root.replaceChildren();
 const selected=$('roleFilter')?.value||'all';
 const search=String($('roleSearch')?.value||'').trim().toLocaleLowerCase();
 const entries=roleCandidates.filter(p=>{
  const key=roleNameKey(p.name),isStaff=!!roles[key];
  return (!search||p.name.toLocaleLowerCase().includes(search)||roleLabel(roles[key]).toLocaleLowerCase().includes(search))&&
   (selected==='all'||selected==='staff'&&isStaff||selected==='playing'&&!isStaff);
 });
 const allStaff=roleCandidates.filter(p=>!!roles[roleNameKey(p.name)]).length;
 $('roleSummary').textContent=(roleCandidates.length-allStaff)+' playing · '+allStaff+' staff / not playing';
 if(!entries.length){
  root.append(el('p','role-none',roleCandidates.length?'No matching participants in this view.':'No eligible guests or captains available yet.'));return;
 }
 for(const person of entries){
  const key=roleNameKey(person.name),captain=roleCaptains.has(key),current=roles[key]||null;
  const item=el('div','role-person'+(captain?' is-captain':current?' is-staff':''));item.dataset.roleKey=key;
  const identity=el('div','role-person-info');
  identity.append(el('div','role-person-name',person.name));
  identity.append(el('small','role-person-meta',captain?'Team captain · must remain playing':(person.kind==='Plus-one'?'Paid named plus-one':'Registered guest')+' · '+roleLabel(current)));
  const controls=el('div','role-person-controls');
  const select=el('select','role-person-select');
  select.setAttribute('aria-label','Choose playing or staff role for '+person.name);
  for(const [value,label] of ROLE_OPTIONS){
   const opt=el('option','',label);opt.value=value;select.append(opt);
  }
  select.value=current?.role||'player';
  select.disabled=rolesBusy||captain||blocked||roleRevision===null;
  if(captain)select.title='Change the team captain first to assign this person a non-playing position';
  controls.append(select);
  const custom=el('div','role-custom');
  custom.hidden=select.value!=='other';
  const title=el('input');
  title.type='text';title.maxLength=60;title.placeholder='Position name (e.g., Line judge)';
  title.setAttribute('aria-label','Custom position for '+person.name);
  title.value=current?.title||'';
  const apply=btn('Save position',()=>setSquadRole(person.name,'other',title.value),'primary');
  apply.disabled=rolesBusy||captain||blocked;
  title.disabled=rolesBusy||captain||blocked;
  title.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply.click()}});
  custom.append(title,apply);controls.append(custom);
  select.addEventListener('change',()=>{
   if(select.value==='other'){
    custom.hidden=false;title.focus();return;
   }
   custom.hidden=true;
   setSquadRole(person.name,select.value,'');
  });
  item.append(identity,controls);root.append(item);
 }
 window.FriendsgivingSearch?.refresh();
}
async function setSquadRole(name,role,title=''){
 const feedback=$('roleStatus');
 if(rolesBusy||blocked||roleRevision===null)return;
 if(role==='other'&&!title.trim()){feedback.textContent='Enter the custom position name first.';return}
 if(dirty||saving){
  const saved=await saveDraft();
  if(!saved){feedback.textContent='Save or resolve the team draft before changing roles.';return}
 }
 rolesBusy=true;renderRoles();refreshPublishButton();
 feedback.textContent='Saving '+name+' as '+(role==='other'?title:ROLE_OPTIONS.find(r=>r[0]===role)?.[1]||role)+'…';
 try{
  const response=await fetch('/admin/api/team-roles',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({name,role,customTitle:title,revision:roleRevision})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Unable to update the role.');
  await start();
  feedback.textContent=result.teamWarning
   ?'⚠ Role saved, but team synchronization needs review: '+result.teamWarning
   :'✓ '+name+' is now '+(role==='other'?title:ROLE_OPTIONS.find(r=>r[0]===role)?.[1]||role)+'. Team assignments updated.';
 }catch(e){
  feedback.textContent='⚠ '+e.message;
 }finally{rolesBusy=false;renderRoles();refreshPublishButton()}
}
$('roleSearch').addEventListener('input',renderRoles);
$('roleFilter').addEventListener('change',renderRoles);

function captainNames(){
 const names=new Map();
 for(const t of teams){const name=(t.captain||'').trim(),key=canonical(name);if(!key)continue;if(names.has(key))return {error:'Captain '+name+' is already assigned to '+names.get(key)+'. Give each team its own captain.'};names.set(key,t.name||'another team')}
 return {names:new Set(names.keys())};
}
function randomIndex(length){const top=4294967296,limit=Math.floor(top/length)*length;let n;do{const x=new Uint32Array(1);crypto.getRandomValues(x);n=x[0]}while(n>=limit);return n%length}
function paidPlusOneKeys(){
 return new Set(plusOnePlayers.filter(p=>p.playing).map(p=>canonical(p.name)));
}
function updatePlusOneDisplay(pending=0){
 const info=$('plusOneEligibilityInfo');if(!info)return;
 const active=paidPlusOneKeys();
 const playing=guests.filter(name=>active.has(canonical(name))).length;
 info.textContent='🎟️ '+playing+' paid +1 '+(playing===1?'player':'players')+
  ' included individually in the next shuffle'+(pending?' · '+pending+' companion '+(pending===1?'entry needs':'entries need')+' payment or name review':'')+
  '. Plus-ones may be on a different team from their inviter.';
}
function randomizeTeams(){
 if(rolesBusy){status.textContent='Finish saving player roles before randomizing.';return}
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
 const includedPlusOnes=shuffled.filter(name=>paidPlusOneKeys().has(canonical(name))).length;
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
 status.textContent='✓ Randomized '+shuffled.length+' eligible players, including '+includedPlusOnes+' paid +1 '+(includedPlusOnes===1?'player':'players')+' as independent entries. Captains are unchanged. Draft autosaving; publish when ready.';
}
function render(){
 cards.replaceChildren();
 if(!teams.length)cards.append(el('p','empty','No teams in your draft yet. Create a team to begin.'));
 teams.forEach((team,index)=>{
  const card=el('article','team-card');card.dataset.teamIndex=String(index);
  // Count unique assigned players in this box; the captain counts once.
  const captainKey=nameKey(team.captain);
  const memberKeys=new Set((team.members||[]).map(nameKey).filter(key=>key&&key!==captainKey));
  const playerCount=memberKeys.size+(captainKey?1:0);
  const heading=el('div','team-card-heading');
  heading.append(el('h2','',team.name||'New team'));
  const count=el('div','team-player-count');
  count.setAttribute('aria-label',playerCount+' '+(playerCount===1?'player':'players')+' assigned to '+(team.name||'this team'));
  count.append(el('strong','team-player-number',String(playerCount)));
  count.append(el('span','team-player-word',playerCount===1?'PLAYER':'PLAYERS'));
  heading.append(count);card.append(heading);
  if(team.caption)card.append(el('p','team-caption',team.caption));
  const details=memberKeys.size+' '+(memberKeys.size===1?'member':'members')+(captainKey?' + 1 captain':' · captain not assigned');
  card.append(el('p','team-count-details',details));
  const captainInfo=el('div','admin-captain-summary');
  if(/^data:image\/(?:jpeg|webp);base64,/.test(team.captainPhoto||'')){
   const photo=el('img','admin-captain-thumb');photo.src=team.captainPhoto;
   photo.alt='Portrait of captain '+(team.captain||'');photo.width=64;photo.height=64;photo.loading='lazy';
   captainInfo.append(photo);
  }else captainInfo.append(el('span','admin-captain-placeholder',(team.captain||'?').trim().charAt(0).toUpperCase()));
  captainInfo.append(el('span','admin-captain-name','Captain: '+(team.captain||'To be announced')));
  card.append(captainInfo);
  const roster=el('p','roster','Members: '+(team.members.length?team.members.join(', '):'No additional players yet'));card.append(roster);
  // Make it obvious that +1 companions were assigned individually, not as
  // hidden additions tied to their inviter's team.
  const plusKeys=paidPlusOneKeys();
  const plusMembers=team.members.filter(member=>plusKeys.has(canonical(member)));
  if(plusMembers.length){
   const plusWrap=el('div','team-plus-one-players');
   plusWrap.append(el('strong','team-plus-one-label','🎟️ Paid +1 players ('+plusMembers.length+')'));
   const people=el('div','team-plus-one-list');
   for(const member of plusMembers)people.append(el('span','team-plus-one-chip',member));
   plusWrap.append(people);card.append(plusWrap);
  }
  const actions=el('div','team-actions');
  actions.append(btn('Edit team',()=>openEditor(index),'primary'));
  const up=btn('↑',()=>move(index,-1)),down=btn('↓',()=>move(index,1));up.title='Move team up';down.title='Move team down';up.disabled=index===0;down.disabled=index===teams.length-1;actions.append(up,down);
  actions.append(btn('Remove',()=>{if(!confirm('Remove '+(team.name||'this team')+' from the team lineup?'))return;teams.splice(index,1);markDirty();render()},'danger'));
  card.append(actions);cards.append(card);
 });
 $('randomizeTeams').disabled=rolesBusy||teams.length<2||!guests.length;
 $('teamCount').textContent=teams.length+' '+(teams.length===1?'team':'teams')+' · '+teams.reduce((sum,t)=>sum+new Set([t.captain,...t.members].map(nameKey).filter(Boolean)).size,0)+' assigned people (captains included)';
 window.FriendsgivingSearch?.refresh();
}
function move(index,delta){const other=index+delta;if(other<0||other>=teams.length)return;[teams[index],teams[other]]=[teams[other],teams[index]];markDirty();render()}
function openEditor(index){
 const creating=index===null;
 const draft=creating?{id:'team-'+crypto.randomUUID(),name:'',caption:'',captain:'',members:[]}:structuredClone(teams[index]);
 const modal=$('editTeam');$('editTeamTitle').textContent=creating?'Add a team':'Edit team';
 const area=$('teamFields');area.replaceChildren();
 draft.captainPhoto=typeof draft.captainPhoto==='string'?draft.captainPhoto:'';
 let photoOwner=nameKey(draft.captain),updatePhotoPreview=()=>{};
 for(const [label,key,max] of [['Team name','name',80],['Team captain','captain',100],['Team motto (optional)','caption',220]]){
  const field=input(label,draft[key],max,v=>{draft[key]=v;if(key==='captain')updatePhotoPreview()});area.append(field.label);
 }
 const photoBox=el('div','captain-photo-editor');
 photoBox.append(el('strong','captain-photo-label','★ Captain gamer card photo'));
 const photoPreview=el('div','captain-photo-preview');
 const photoStatus=el('p','muted captain-photo-status','Upload a picture of the captain. Photos are cropped and optimized before cloud saving.');
 photoStatus.setAttribute('role','status');
 const photoInput=el('input','captain-photo-file');photoInput.type='file';photoInput.accept='image/*,.heic,.heif';
 photoInput.setAttribute('aria-label','Upload photo of the team captain');
 const removePhoto=btn('Remove photo',()=>{
  draft.captainPhoto='';photoOwner=nameKey(draft.captain);
  photoStatus.textContent='Captain photo removed from this draft. Save the team to keep the change.';
  updatePhotoPreview();
 },'captain-photo-remove');
 updatePhotoPreview=()=>{
  photoPreview.replaceChildren();
  const matchesOwner=photoOwner===nameKey(draft.captain),photo=matchesOwner?draft.captainPhoto:'';
  if(/^data:image\/(?:jpeg|webp);base64,/.test(photo)){
   const img=el('img','captain-photo-image');img.src=photo;
   img.alt='Preview of '+(draft.captain||'captain')+' photo';photoPreview.append(img);
  }else photoPreview.append(el('span','captain-photo-initial',(cleanName(draft.captain)||'?').charAt(0).toUpperCase()));
  removePhoto.disabled=!draft.captainPhoto;
  if(!matchesOwner&&draft.captainPhoto)photoStatus.textContent='Captain changed. Upload a new photo; the previous one will be cleared on save.';
 };
 const photoActions=el('div','captain-photo-actions');
 const pickerLabel=el('label','captain-photo-pick','Choose captain photo');pickerLabel.append(photoInput);
 photoActions.append(pickerLabel,removePhoto);
 photoBox.append(photoPreview,photoActions,photoStatus);
 area.append(photoBox);
 photoInput.addEventListener('change',async()=>{
  const file=photoInput.files?.[0];if(!file)return;
  if(!cleanName(draft.captain)){photoStatus.textContent='Enter the captain name before uploading their picture.';photoInput.value='';return}
  const done=$('confirmTeam');done.disabled=true;photoInput.disabled=true;
  photoStatus.textContent='Preparing the captain photo…';
  try{
   draft.captainPhoto=await compactCaptainPhoto(file);photoOwner=nameKey(draft.captain);
   updatePhotoPreview();
   photoStatus.textContent='✓ Photo ready. Save the team, then publish for guests to see it.';
  }catch(err){photoStatus.textContent='⚠ '+(err.message||'Could not read photo.')}
  finally{done.disabled=false;photoInput.disabled=false;photoInput.value=''}
 });
 updatePhotoPreview();
 const caption=el('p','muted',creating?'Create and save this team first. Randomize Teams includes players with both RSVP = Yes and Paid = Yes on the Guest List.':'Choose a Guest List player with both Paid = Yes and RSVP = Yes. An asterisk in the source Guest List does not prevent selection; non-playing roles remain excluded. Use Randomize Teams to reshuffle.');area.append(caption);
 if(creating){const note=el('p','muted','No members are assigned during team creation.');area.append(note)}
 const entry=el('div','member-entry'),memberSelect=el('select');
 memberSelect.setAttribute('aria-label','Guest List players with RSVP Yes and Paid Yes');
 const members=el('div','member-list'),error=el('p','error'),availableCount=el('p','muted');
 error.setAttribute('role','status');availableCount.setAttribute('aria-live','polite');
 const assignedElsewhere=name=>teams.some((t,j)=>j!==index&&t.members.some(m=>nameKey(m)===nameKey(name)));
 const reservedByCaptain=name=>teams.some((t,j)=>j!==index&&canonical(t.captain)&&canonical(t.captain)===canonical(name))||(canonical(draft.captain)&&canonical(draft.captain)===canonical(name));
 const availableGuests=()=>guests.filter(g=>!reservedByCaptain(g)&&!draft.members.some(m=>nameKey(m)===nameKey(g))&&!assignedElsewhere(g));
 function drawChoices(){
  const choices=availableGuests(),previous=memberSelect.value;
  memberSelect.replaceChildren();
  const placeholder=el('option','','Select a paid, RSVP-confirmed Guest List player…');placeholder.value='';memberSelect.append(placeholder);
  const plusKeys=paidPlusOneKeys();
  choices.forEach(g=>{
   const option=el('option','',plusKeys.has(canonical(g))?'🎟️ Paid +1 · '+g:g);
   option.value=g;memberSelect.append(option);
  });
  memberSelect.value=choices.includes(previous)?previous:'';
  memberSelect.disabled=!choices.length;addButton.disabled=!choices.length;randomButton.disabled=!choices.length;
  const plusAvailable=choices.filter(g=>plusKeys.has(canonical(g))).length;
  availableCount.textContent=choices.length+' eligible '+(choices.length===1?'player':'players')+' available'+
    (plusAvailable?' · '+plusAvailable+' paid +1 '+(plusAvailable===1?'player':'players'):'');
 }
 function drawMembers(){
  members.replaceChildren();
  if(!draft.members.length)members.append(el('span','muted','No members assigned yet'));
  draft.members.forEach((g,i)=>{
   const chip=el('span','member-chip',paidPlusOneKeys().has(canonical(g))?'🎟️ +1 '+g+' ':g+' ');
   chip.append(btn('×',()=>{draft.members.splice(i,1);drawMembers();drawChoices()},'remove-member'));
   members.append(chip);
  });
 }
 function addMember(member){
  if(!member){error.textContent='Choose a Guest List player confirmed as paid and RSVP Yes.';return}
  if(!availableGuests().includes(member)){error.textContent='This guest is already assigned, not Playing, or no longer Paid and RSVP-confirmed.';return}
  // Members, including named plus-ones, may be assigned to separate teams.
  // Do not silently move the person's inviter or any other companion.
  if(canonical(member)!==canonical(draft.captain)&&!draft.members.some(m=>nameKey(m)===nameKey(member)))draft.members.push(member);
  error.textContent='';drawMembers();drawChoices();
 }
 const addButton=btn('+ Add member',()=>addMember(memberSelect.value));
 const randomButton=btn('🎲 Random Pick',()=>{
  const available=availableGuests();
  if(!available.length){error.textContent='No unassigned Guest List players with Paid = Yes and RSVP = Yes are available.';return}
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
 if(nameKey(draft.captain)!==photoOwner)draft.captainPhoto='';
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
function teamsSearch(query,matches){
 const result=[];
 teams.forEach((team,index)=>{
  const name=String(team.name||'Untitled team');
  const captain=String(team.captain||'Unassigned');
  const people=Array.isArray(team.members)?team.members:[];
  const reveal=()=>window.FriendsgivingSearch?.navigate(cards.querySelector('[data-team-index="'+index+'"]'));
  if(matches(query,name,team.caption,'team','captain',captain)){
   result.push({title:name,detail:'Captain: '+captain+' · '+(people.length+(captain==='Unassigned'?0:1))+' players'+(team.caption?' · '+team.caption:''),group:'Team assignments',activate:reveal});
  }
  for(const person of people){
   if(!matches(query,person))continue;
   result.push({title:person,detail:'Playing on '+name+' team',group:'Team player',activate:reveal});
  }
 });
 for(const person of roleCandidates){
  const key=roleNameKey(person.name);
  const job=roleLabel(roles[key]),captain=roleCaptains.has(key);
  if(!matches(query,person.name,job,person.kind))continue;
  result.push({
   title:person.name,group:'Player & staff roles',
   detail:captain?'Captain · Playing':(roles[key]?'Not playing · '+job:'Playing')+(person.kind==='Plus-one'?' · Plus-one':''),
   activate:()=>{
    $('squadRolesSection').open=true;
    $('roleSearch').value='';$('roleFilter').value='all';renderRoles();
    window.FriendsgivingSearch?.navigate($('roleList').querySelector('[data-role-key="'+key+'"]'));
   }
  });
 }
 return result;
}
window.FriendsgivingSearch?.register(teamsSearch);
function updateSourceStatus(result){
 const node=$('teamSourcesStatus'),info=result.syncSources||{};
 if(!node)return;
 const format=value=>value?new Date(value).toLocaleString():'no check recorded';
 const recent=value=>value&&Number.isFinite(Date.parse(value))&&Date.now()-Date.parse(value)<30*60*1000;
 node.textContent='Google Guest List (team source): '+format(info.guestLastSuccessAt)+
  ' · Google Form (companion labels only): '+format(info.formLastSuccessAt)+'. '+
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
  plusOnePlayers=Array.isArray(result.plusOnePlayers)?result.plusOnePlayers:[];
  updatePlusOneDisplay(result.companionNeedsReview||0);
  roles=result.roles&&typeof result.roles==='object'?result.roles:{};
  roleCandidates=Array.isArray(result.roleCandidates)?result.roleCandidates:[];
  roleCaptains=new Set(Array.isArray(result.roleCaptains)?result.roleCaptains:[]);
  roleRevision=Number.isSafeInteger(result.roleRevision)?result.roleRevision:null;
  renderRoles();
  const info=$('teamEligibilityInfo');if(info)info.textContent=guests.length+' confirmed Guest List players (RSVP = Yes and Paid = Yes, excluding non-playing roles) · '+(result.markedIncluded||0)+' starred Guest List entries included · '+(result.paymentPending||0)+' RSVP-confirmed entries waiting for payment · '+(result.rsvpPending||0)+' paid entries waiting for RSVP. No Form submission required.';
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
  const previousRevision=draftRevision,previousGuests=JSON.stringify(guests),wasPublished=isPublished,previousRoleRevision=roleRevision;
  draftRevision=result.revision;
  guests=result.guests;guestGroups=Array.isArray(result.guestGroups)?result.guestGroups:[];isPublished=result.isPublished===true;
  plusOnePlayers=Array.isArray(result.plusOnePlayers)?result.plusOnePlayers:[];
  updatePlusOneDisplay(result.companionNeedsReview||0);
  roles=result.roles&&typeof result.roles==='object'?result.roles:{};
  roleCandidates=Array.isArray(result.roleCandidates)?result.roleCandidates:[];
  roleCaptains=new Set(Array.isArray(result.roleCaptains)?result.roleCaptains:[]);
  roleRevision=Number.isSafeInteger(result.roleRevision)?result.roleRevision:null;
  if(previousRoleRevision!==roleRevision)renderRoles();
  publishedBaseline=serial(result.publishedTeams||[]);
  const info=$('teamEligibilityInfo');
  if(info)info.textContent=guests.length+' eligible people: primary guests paid and RSVP-confirmed, plus named companions paid with inviter RSVP. '+(result.companionNeedsReview||0)+' companions need payment or RSVP review.';
  updateSourceStatus(result);
  if(previousRevision!==draftRevision||previousGuests!==JSON.stringify(guests)||wasPublished!==isPublished||previousRoleRevision!==roleRevision){
   teams=result.teams;render();refreshPublishButton();
   status.textContent=isPublished?'✓ Published teams refreshed from Guest List RSVP/payment changes.':'✓ Team draft refreshed from Guest List; guest lookups remain unpublished.';
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
