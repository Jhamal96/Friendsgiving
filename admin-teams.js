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
 const caption=el('p','muted','Team members (choose an existing guest or type a new name)');area.append(caption);
 const entry=el('div','member-entry'),name=el('input'),list=el('datalist');name.type='text';name.maxLength=100;name.placeholder='Choose or enter a guest name';const listId='guestChoices';list.id=listId;name.setAttribute('list',listId);
 guests.forEach(g=>{const option=el('option');option.value=g;list.append(option)});
 const members=el('div','member-list'),error=el('p','error');error.setAttribute('role','status');
 const drawMembers=()=>{members.replaceChildren();if(!draft.members.length)members.append(el('span','muted','No members assigned yet'));draft.members.forEach((g,i)=>{const chip=el('span','member-chip',g+' ');chip.append(btn('×',()=>{draft.members.splice(i,1);drawMembers()},'remove-member'));members.append(chip)})};
 const add=()=>{const member=name.value.trim();if(!member)return;if(draft.members.some(m=>m.toLowerCase()===member.toLowerCase())){error.textContent='This person is already on this team.';return}const assignedElsewhere=teams.some((t,j)=>j!==index&&t.members.some(m=>m.toLowerCase()===member.toLowerCase()));if(assignedElsewhere){error.textContent=member+' is already assigned to another team.';return}draft.members.push(member);name.value='';error.textContent='';drawMembers()};
 entry.append(name,btn('+ Add member',add));name.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();add()}});
 area.append(entry,list,members,error);drawMembers();
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
