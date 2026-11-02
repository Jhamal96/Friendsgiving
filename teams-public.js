(()=>{'use strict';
const section=document.getElementById('teams'),root=document.getElementById('teamsGrid'),nav=document.getElementById('teamsNav'),search=document.getElementById('teamSearch'),notice=document.getElementById('teamsNotice');
let teams=[];
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function draw(){
 const q=search.value.trim().toLocaleLowerCase('en-US'),visible=teams.filter(t=>[t.name,t.caption,t.captain,...t.members].some(v=>String(v||'').toLocaleLowerCase('en-US').includes(q)));
 root.replaceChildren();
 if(!visible.length){root.append(el('p','teams-empty',q?'No matching teams or squad members.':'Team announcements are coming soon.'));return}
 visible.forEach((t,i)=>{
  const card=el('article','roster-card'),head=el('div','roster-heading');
  head.append(el('span','roster-index','SQUAD / '+String(i+1).padStart(2,'0')));
  head.append(el('h3','roster-name',t.name));card.append(head);
  if(t.caption)card.append(el('p','roster-caption','“'+t.caption+'”'));
  card.append(el('div','roster-captain','★ CAPTAIN: '+(t.captain||'To be announced')));
  const title=el('p','roster-members-heading','TEAM MEMBERS · '+t.members.length);card.append(title);
  const list=el('ul','roster-members');
  if(!t.members.length)list.append(el('li','muted','Assignments coming soon'));
  else t.members.forEach(m=>list.append(el('li','',m)));
  card.append(list);root.append(card);
 });
 notice.textContent=visible.length+' '+(visible.length===1?'team':'teams')+' shown';
}
fetch('/api/teams',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Unable to load teams');return r.json()}).then(data=>{
 teams=Array.isArray(data.teams)?data.teams:[];
 if(!teams.length)return;
 section.hidden=section.dataset.adminHidden==='1';
 if(nav)nav.hidden=section.hidden;
 search.addEventListener('input',draw);draw();
}).catch(()=>{section.hidden=true;if(nav)nav.hidden=true});
})();