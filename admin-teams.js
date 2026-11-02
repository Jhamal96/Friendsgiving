(()=>{'use strict';
const $=id=>document.getElementById(id);
let teams=[],guests=[],revision=null,dirty=false;
const cards=$('teamCards'),status=$('teamStatus'),save=$('saveTeams');
function markDirty(){dirty=true;save.disabled=false;status.textContent='Unsaved team assignments. Select Publish teams to update the main page.'}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function btn(label,action,cls){const b=el('button',cls,label);b.type='button';b.addEventListener('click',action);return b}
function input(label,value,limit,change){const l=el('label','edit-label',label),i=el('input');i.type='text';i.maxLength=limit;i.value=value||'';i.addEventListener('input',()=>change(i.value));l.append(i);return {label:l,input:i}}
function uniqueMembers(xs){return xs.map(x=>x.trim()).filter((x,i,a)=>x&&a.findIndex(y=>y.toLowerCase()===x.toLowerCase())===i)}
function render(){
 cards.replaceChildren();
 if(!teams.length)cards.append(el('p','empty','No teams published yet. Add a team to create the squad assignments.'));
 teams.forEach((team,index)=>{
  const card=el('article','team-card');
  const h=el('h2','',team.name||'New team');card.append(h);
  if(team.caption)card.append(el('p','team-caption',team.caption));
  card.append(el('p','muted','Captain: '+(team.captain||'To be announced')));
  const roster=el('p','roster','Members: '+(team.members.length?team.members.join(', '):'None assigned yet'));card.append(roster);
  const actions=el('div','team-actions');
  actions.append(btn('Edit team',()=>openEditor(index),'primary'));
  const up=btn('↑',()=>move(index,-1)),down=btn('↓',()=>move(index,1));up.title='Move team up';down.title='Move team down';up.disabled=index===0;down.disabled=index===teams.length-1;actions.append(up,down);
  actions.append(btn('Remove',()=>{if(!confirm('Remove '+(team.name||'this team')+' from the team lineup?'))return;teams.splice(index,1);markDirty();render()},'danger'));
  card.append(actions);cards.append(card);
 });
 $('teamCount').textContent=teams.length+' '+(teams.length===1?'team':'teams')+' · '+teams.reduce((sum,t)=>sum+t.members.length,0)+' assigned members';
}
function move(index,delta){const other=index+delta;if(other<0||other>=teams.length)return;[teams[index],teams[other]]=[teams[other],teams[index]];markDirty();render()}
function openEditor(index){
 const creating=index===null;
 const draft=creating?{id:'team-'+crypto.randomUUID(),name:'',caption:'',captain:'',members:[]}:structuredClone(teams[index]);
 const modal=$('editTeam');$('editTeamTitle').textContent=creating?'Add a team':'Edit team';
 const area=$('teamFields');area.replaceChildren();
 for(const [label,key,max] of [['Team name','name',80],['Team caption / motto','caption',220],['Team captain','captain',100]]){
  const field=input(label,draft[key],max,v=>draft[key]=v);area.append(field.label);
 }
 const caption=el('p','muted','Choose an RSVP-confirmed guest from the dropdown, or use Random Pick to add an available guest.');area.append(caption);
 const entry=el('div','member-entry'),memberSelect=el('select');
 memberSelect.setAttribute('aria-label','Confirmed guests available for this team');
 const members=el('div','member-list'),error=el('p','error'),availableCount=el('p','muted');
 error.setAttribute('role','status');availableCount.setAttribute('aria-live','polite');
 const assignedElsewhere=name=>teams.some((t,j)=>j!==index&&t.members.some(m=>m.toLocaleLowerCase('en-US')===name.toLocaleLowerCase('en-US')));
 const availableGuests=()=>guests.filter(g=>!draft.members.some(m=>m.toLocaleLowerCase('en-US')===g.toLocaleLowerCase('en-US'))&&!assignedElsewhere(g));
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
 area.append(entry,availableCount,members,error);drawMembers();drawChoices();
 const submit=$('confirmTeam'),cancel=$('cancelTeam');
 submit.onclick=()=>{if(!draft.name.trim()){error.textContent='Enter a team name.';area.querySelector('input').focus();return}
 draft.name=draft.name.trim();draft.caption=draft.caption.trim();draft.captain=draft.captain.trim();draft.members=uniqueMembers(draft.members);
 if(creating)teams.push(draft);else teams[index]=draft;modal.close();markDirty();render()};
 cancel.onclick=()=>modal.close();
 modal.showModal();area.querySelector('input').focus();
}
async function start(){
 try{
  const r=await fetch('/admin/api/teams',{cache:'no-store'});
  if(!r.ok)throw Error('Unable to load team assignments.');
  const data=await r.json();
  if(!Array.isArray(data.teams)||!Number.isSafeInteger(data.revision))throw Error('Unexpected team data.');
  teams=data.teams;guests=Array.isArray(data.guests)?data.guests:[];revision=data.revision;dirty=false;
  $('addTeam').disabled=false;save.disabled=true;render();
  status.textContent='Changes appear on the public Friendsgiving page after you publish.';
 }catch(e){status.textContent=e.message;$('addTeam').disabled=true;save.disabled=true}
}
$('addTeam').addEventListener('click',()=>openEditor(null));
save.addEventListener('click',async()=>{save.disabled=true;status.textContent='Publishing team assignments…';try{
 const r=await fetch('/admin/api/teams',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teams,revision})});
 const data=await r.json().catch(()=>({}));
 if(r.status===409)throw Error('Another organizer saved changes. Refresh to review the latest teams before publishing.');
 if(!r.ok)throw Error(data.error||'Unable to publish teams.');
 revision=data.revision;teams=data.teams;dirty=false;render();status.textContent='Published! The public page now shows your teams.';save.disabled=true;
 }catch(e){status.textContent=e.message;save.disabled=false}});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
start();
})();
