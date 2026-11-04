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
  // Only recognized team names can select a color class. Unknown teams keep
  // the original neutral style, with no styles coming from user input.
  const teamColor=String(result.team||'').trim().toLowerCase();
  if(teamColor==='yellow'||teamColor==='blue')card.classList.add('team-lookup-'+teamColor);
  const header=el('div','roster-heading');
  header.append(el('span','roster-index','YOUR ASSIGNMENT'));
  header.append(el('h3','roster-name',result.team));
  card.append(header);
  const gamer=el('section','captain-gamer-card');
  gamer.setAttribute('aria-label','Team captain gamer card');
  const portrait=el('div','captain-gamer-portrait');
  const imgData=String(result.captainPhoto||'');
  const fallback=()=>{
   portrait.replaceChildren();
   const initials=String(result.captain||'?').trim().split(/\s+/).slice(0,2).map(part=>part.charAt(0).toUpperCase()).join('')||'?';
   portrait.append(el('span','captain-gamer-initials',initials));
  };
  if(/^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(imgData)&&imgData.length<=32000){
   const img=el('img','captain-gamer-image');
   img.src=imgData;img.alt='Portrait of team captain '+result.captain;
   img.width=280;img.height=280;img.decoding='async';
   img.addEventListener('error',fallback,{once:true});
   portrait.append(img);
  }else fallback();
  const info=el('div','captain-gamer-info');
  info.append(el('span','captain-gamer-eyebrow','★ SQUAD COMMAND / CAPTAIN'));
  info.append(el('h4','captain-gamer-name',result.captain||'To be announced'));
  info.append(el('p','captain-gamer-rank','TEAM LEADER · FRIENDSGIVING 2026'));
  if(typeof result.caption==='string'&&result.caption.trim()){
   info.append(el('p','captain-gamer-motto',result.caption.slice(0,220)));
  }
  const status=el('div','captain-gamer-footer','PLAYER ID VERIFIED  //  TEAM '+String(result.team||'').toUpperCase());
  gamer.append(portrait,info,status);
  card.append(gamer);
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
