(()=>{'use strict';
// The browser receives only the response for an exact name; team rosters never load.
const section=document.getElementById('teams');
const form=document.getElementById('teamLookupForm');
const root=document.getElementById('teamsGrid');
const nav=document.getElementById('teamsNav');
const input=document.getElementById('teamSearch');
const notice=document.getElementById('teamsNotice');
const submit=document.getElementById('teamLookupButton');
if(!section||!form||!root||!input||!notice||!submit)return;
let requestNumber=0,controller=null;
function el(tag,className,value){
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(value!==undefined)node.textContent=value;
 return node;
}
function clearResult(){
 requestNumber++;
 if(controller){controller.abort();controller=null}
 root.replaceChildren();
 notice.textContent='';
 submit.disabled=false;
}
input.addEventListener('input',clearResult);
form.addEventListener('submit',async e=>{
 e.preventDefault();
 const name=input.value.normalize('NFKC').trim().replace(/\s+/g,' ');
 clearResult();
 if(name.length<2){
  notice.textContent='Enter your first name or full name to search.';
  input.focus();
  return;
 }
 const mine=++requestNumber;
 controller=new AbortController();
 submit.disabled=true;
 notice.textContent='Checking your team assignment…';
 try{
  const response=await fetch('/api/teams',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({name}),
   signal:controller.signal,
   cache:'no-store'
  });
  const result=await response.json().catch(()=>({}));
  if(mine!==requestNumber)return;
  if(!response.ok)throw Error(result.error||'Unable to find your team. Try again.');
  if(!result.found){
   notice.textContent='No published team found for that name. Check the spelling or contact the organizers.';
   return;
  }
  const card=el('article','roster-card team-lookup-card');
  const header=el('div','roster-heading');
  header.append(el('span','roster-index','YOUR ASSIGNMENT'));
  header.append(el('h3','roster-name',result.team));
  card.append(header);
  card.append(el('p','roster-captain','★ TEAM CAPTAIN: '+result.captain));
  root.replaceChildren(card);
  notice.textContent='Your team assignment';
 }catch(err){
  if(mine!==requestNumber||err.name==='AbortError')return;
  notice.textContent=err.message||'Please try again.';
 }finally{
  if(mine===requestNumber){submit.disabled=false;controller=null}
 }
});
fetch('/api/teams',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{
 if(section.dataset.adminHidden==='1')return;
 section.hidden=false;
 if(nav)nav.hidden=false;
 if(data.hasPublishedTeams===false)notice.textContent='Team assignments have not been published yet.';
}).catch(()=>{
 // Keep the input available if the service is temporarily offline.
 if(section.dataset.adminHidden!=='1'){
  section.hidden=false;if(nav)nav.hidden=false;
  notice.textContent='Team lookups are temporarily unavailable.';
 }
});
})();
