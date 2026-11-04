import {reconcileTeams,guestListEligible,nameKey as eligibleKey,cleanName,firstName} from '../../_lib/team-eligibility.js';
import {readSquadRoles,squadRoleKey} from '../../_lib/squad-roles.js';
import {cleanCaptainPhoto} from '../../_lib/captain-photo.js';
// Admin team drafts are stored separately from published teams.
// Public /api/teams reads only organizer_data.teams, never team_drafts.
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers});
const clean=v=>typeof v==='string'?v.trim():'';
const validHost=v=>['ajd-friendsgiving.pages.dev','friendsgiving.ajdapp.org'].includes(v);
const nameKey=s=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const validTeams=input=>{
 if(!Array.isArray(input)||input.length>32)return null;
 const ids=new Set(),used=new Set(),output=[];
 // Reserve captains first so no captain can be assigned to a different roster.
 for(const t of input){
  if(!t||typeof t.captain!=='string')return null;
  const captain=nameKey(t.captain);
  if(captain){if(used.has(captain))return null;used.add(captain)}
 }
 for(const t of input){
  if(!t||Array.isArray(t)||typeof t!=='object'||typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(t.id)||ids.has(t.id))return null;
  ids.add(t.id);
  if(typeof t.name!=='string'||!clean(t.name)||clean(t.name).length>80||typeof t.caption!=='string'||clean(t.caption).length>220||typeof t.captain!=='string'||clean(t.captain).length>100||!Array.isArray(t.members)||t.members.length>150)return null;
  const members=[];
  for(const member of t.members){
   if(typeof member!=='string'||!clean(member)||clean(member).length>100)return null;
   const v=cleanName(member)+(String(member).trim().endsWith('+1')?' +1':''),key=nameKey(v);
   if(used.has(key))return null;
   used.add(key);members.push(v);
  }
  const captainPhoto=cleanCaptainPhoto(t.captainPhoto);
  if(captainPhoto===null)return null;
  output.push({id:t.id,name:clean(t.name),caption:clean(t.caption),captain:cleanName(t.captain),captainPhoto,members});
 }
 return output;
};
export async function onRequestGet({request,env}){
 if(!validHost(new URL(request.url).hostname))return reply({error:'Invalid host'},403);
 try{
  const refreshed=await reconcileTeams(env.FRIENDSGIVING_DB);
  const [draft,current,form,guestSync]=await Promise.all([
   env.FRIENDSGIVING_DB.prepare('SELECT content,revision FROM team_drafts WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT data FROM friendsgiving_form_responses WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT last_success_at,last_conflicts FROM sheet_sync_status WHERE id=1').first()
  ]);
  if(!draft||!current)return reply({error:'Guest List or team drafts unavailable'},503);
  const organizer=JSON.parse(current.content),formData=form?.data?JSON.parse(form.data):{records:[]},matched=guestListEligible(organizer,formData);
  const roles=readSquadRoles(organizer.squadRoles),candidates=new Map(),captains=new Set();
  for(const p of matched.eligible){
   const key=squadRoleKey(p.name);
   if(key&&!candidates.has(key))candidates.set(key,{name:p.name,kind:p.method==='paid-companion'?'Plus-one':'Guest'});
  }
  for(const t of [...JSON.parse(draft.content),...(Array.isArray(organizer.teams)?organizer.teams:[])]){
   const key=squadRoleKey(t.captain);
   if(!key)continue;
   captains.add(key);
   candidates.set(key,{name:firstName(t.captain),kind:'Captain'});
  }
  return reply({
   teams:JSON.parse(draft.content),revision:draft.revision,
   guests:matched.eligible.filter(p=>!roles[squadRoleKey(p.name)]).map(p=>p.name).sort((a,b)=>a.localeCompare(b)),
   roleCandidates:[...candidates.values()].sort((a,b)=>a.name.localeCompare(b.name)),
   roleCaptains:[...captains],roles,roleRevision:current.revision,
   guestGroups:matched.groups,
   isPublished:organizer.teamsPublished===true||(organizer.teamsPublished!==false&&Array.isArray(organizer.teams)&&organizer.teams.length>0),
   eligible:matched.eligible.length,matchingReview:matched.reviewCount,matchingSource:matched.sourceCount,
   eligibilitySource:'guest-list',markedExcluded:matched.markedExcluded,markedIncluded:matched.markedIncluded,paymentPending:matched.paymentPending,rsvpPending:matched.rsvpPending,bothPending:matched.bothPending,ambiguousNames:matched.ambiguousCount,
   paidCompanions:matched.eligible.filter(x=>x.method==='paid-companion').length,
   plusOnePlayers:matched.eligible.filter(x=>x.method==='paid-companion').map(x=>({
    name:x.name,
    payment:x.payment,
    playing:!roles[squadRoleKey(x.name)]
   })),
   companionNeedsReview:matched.companionReviewCount,
   syncSources:{
    guestLastSuccessAt:guestSync?.last_success_at||null,
    formLastSuccessAt:formData.lastImportedAt||null,
    guestConflicts:guestSync?.last_conflicts||0
   },
   publishedTeams:organizer.teams||[],
   syncWarning:refreshed.ok?null:refreshed.error
  });
 }catch{return reply({error:'Unable to load team drafts'},503)}
}
export async function onRequestPost({request,env}){
 const url=new URL(request.url);
 if(!validHost(url.hostname)||request.headers.get('Origin')!==url.origin)return reply({error:'Invalid origin'},403);
 if(!String(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply({error:'JSON required'},415);
 try{
  const raw=await request.text();
  if(raw.length>1200000)return reply({error:'Draft or portraits too large. Choose smaller captain photos.'},413);
  const body=JSON.parse(raw);
  if(!Number.isSafeInteger(body.revision)||body.revision<1)return reply({error:'Invalid draft revision'},400);
  const teams=validTeams(body.teams);
  if(!teams)return reply({error:'Invalid or duplicate team assignments'},400);
  const [organizer,form]=await Promise.all([
   env.FRIENDSGIVING_DB.prepare('SELECT content FROM organizer_data WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT data FROM friendsgiving_form_responses WHERE id=1').first()
  ]);
  if(!organizer)return reply({error:'Guest List unavailable'},503);
  const orgData=JSON.parse(organizer.content);
  const matched=guestListEligible(orgData,form?.data?JSON.parse(form.data):{records:[]});
  const roles=readSquadRoles(orgData.squadRoles);
  const eligible=new Set(matched.eligible.filter(p=>!roles[squadRoleKey(p.name)]).map(p=>eligibleKey(p.name)));
  const canonical=name=>matched.aliases.get(eligibleKey(name))||eligibleKey(name);
  // Captains stay locked on their own teams. Every paid named companion is
  // otherwise an independent player and may join a different team from
  // their inviter, including via the Random Pick and Randomize controls.
  // Validate all assignments against the canonical Guest List identity,
  // not only the typed spelling (nicknames, initials or star markers).
  // A person may occur exactly once, as either captain or team member.
  const assignments=new Map();
  for(let i=0;i<teams.length;i++){
   for(const [person,position] of [[teams[i].captain,'captain'],...teams[i].members.map(name=>[name,'player'])]){
    const key=canonical(person);
    if(!key)continue;
    if(assignments.has(key)){
     const prior=assignments.get(key);
     return reply({error:'Duplicate player assignment: '+person+' is already on '+prior.team+'. Remove the extra entry before saving.'},400);
    }
    assignments.set(key,{team:teams[i].name,position});
   }
  }
  const captainOwners=new Map();
  for(let i=0;i<teams.length;i++){
   const k=canonical(teams[i].captain);
   if(squadRoleKey(teams[i].captain)&&roles[squadRoleKey(teams[i].captain)])
    return reply({error:'A non-playing person cannot be captain. Change their role to Playing or assign another captain.'},400);
   if(!k)continue;
   if(captainOwners.has(k))return reply({error:'One captain cannot lead multiple teams'},400);
   captainOwners.set(k,i);
  }
  for(let i=0;i<teams.length;i++)for(const member of teams[i].members){
   if(captainOwners.has(canonical(member)))
    return reply({error:'Captains must remain on their own teams and cannot also appear in a member list.'},400);
  }
  for(const team of teams)for(const name of team.members){
   if(!eligible.has(eligibleKey(name)))return reply({error:'Only active Guest List entries marked RSVP = Yes and Paid = Yes and without staff roles can join a team: '+name},400);
  }
  const result=await env.FRIENDSGIVING_DB.prepare('UPDATE team_drafts SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(teams),body.revision).run();
  if(!result.meta.changes)return reply({error:'Team draft changed in another tab. Refresh to review the latest changes.'},409);
  return reply({teams,revision:body.revision+1,ok:true});
 }catch{return reply({error:'Unable to save team draft'},500)}
}
