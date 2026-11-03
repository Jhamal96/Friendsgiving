import {guestListEligible,nameKey as eligibleKey,cleanName,balanceTeams} from '../../_lib/team-eligibility.js';
import {readSquadRoles,squadRoleKey} from '../../_lib/squad-roles.js';
// Admin-side team management. The public endpoint never returns planner/payment details.
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const validHost=host=>['ajd-friendsgiving.pages.dev','friendsgiving.ajdapp.org'].includes(host);
const clean=s=>typeof s==='string'?s.trim():'';
const nameKey=s=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const confirmedGuests=data=>{
 const names=new Map();
 for(const row of Array.isArray(data.guests)?data.guests:[]){
  if(!Array.isArray(row)||typeof row[0]!=='string'||typeof row[3]!=='string')continue;
  const name=clean(row[0]),rsvp=clean(row[3]).toLocaleLowerCase('en-US');
  if(!name||!['yes','confirmed','attending'].includes(rsvp))continue;
  if(name.length<=100&&!names.has(name.toLocaleLowerCase('en-US')))names.set(name.toLocaleLowerCase('en-US'),name);
 }
 return Array.from(names.values()).slice(0,500).sort((a,b)=>a.localeCompare(b));
};
const safeTeams=teams=>Array.isArray(teams)?teams.map(t=>({id:t.id,name:t.name,caption:t.caption,captain:t.captain,members:t.members})).filter(t=>t&&typeof t.name==='string'):[];
export async function onRequestGet({request,env}){
 try{
  if(!validHost(new URL(request.url).hostname))return reply({error:'Invalid host'},403);
  const row=await env.FRIENDSGIVING_DB.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first();
  if(!row)return reply({error:'Team manager is unavailable'},503);
  const data=JSON.parse(row.content);
  return reply({teams:safeTeams(data.teams),isPublished:data.teamsPublished===true||(data.teamsPublished!==false&&Array.isArray(data.teams)&&data.teams.length>0),revision:row.revision});
 }catch{return reply({error:'Team manager is unavailable'},503)}
}
export async function onRequestPost({request,env}){
 const u=new URL(request.url);
 if(!validHost(u.hostname)||request.headers.get('Origin')!==u.origin)return reply({error:'Invalid origin'},403);
 if(!String(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply({error:'JSON required'},415);
 try{
  const raw=await request.text();
  if(raw.length>100000)return reply({error:'Request too large'},413);
  const {action='publish',teams,revision}=JSON.parse(raw);
  if(!Number.isSafeInteger(revision)||revision<0)return reply({error:'Invalid revision'},400);
  if(!['publish','unpublish'].includes(action))return reply({error:'Invalid action'},400);
  const prior=await env.FRIENDSGIVING_DB.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first();
  if(!prior)return reply({error:'Planner unavailable'},503);
  if(prior.revision!==revision)return reply({error:'The teams changed elsewhere. Refresh before continuing.'},409);
  const data=JSON.parse(prior.content);
  if(action==='unpublish'){
   // Retain private drafts and last public lineup, but hide it immediately and
   // prevent every form/payment sync from silently bringing it back.
   const updated={...data,teamsPublished:false};
   const saved=await env.FRIENDSGIVING_DB.prepare('UPDATE organizer_data SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?')
    .bind(JSON.stringify(updated),revision).run();
   if(!saved.meta.changes)return reply({error:'Changed elsewhere'},409);
   return reply({revision:revision+1,isPublished:false,teams:safeTeams(data.teams)});
  }
  if(!Array.isArray(teams)||!teams.length||teams.length>32)return reply({error:'Create at least one team before publishing'},400);
  const ids=new Set(),assigned=new Set(),cleaned=[];
  const form=await env.FRIENDSGIVING_DB.prepare('SELECT data FROM friendsgiving_form_responses WHERE id=1').first();
  // Form responses are optional companion labels, not an eligibility gate.
  const eligibility=guestListEligible(data,form?.data?JSON.parse(form.data):{records:[]});
  const roles=readSquadRoles(data.squadRoles);
  const canonical=value=>eligibility.aliases.get(eligibleKey(value))||eligibleKey(value);
  // Captain names count as reserved players, even though they aren't duplicated in members.
  for(const team of teams){
   if(!team||typeof team.captain!=='string'||clean(team.captain).length>100)return reply({error:'Invalid team captain'},400);
   const captain=canonical(team.captain);
   if(squadRoleKey(team.captain)&&roles[squadRoleKey(team.captain)])return reply({error:'A referee, staff member or non-player cannot lead a playing team. Change their role or captain.'},400);
   if(captain){
    if(assigned.has(captain))return reply({error:'A captain cannot lead more than one team or appear twice'},400);
    assigned.add(captain);
   }
  }
  for(const t of teams){
   if(!t||typeof t!=='object'||Array.isArray(t)||typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(t.id)||ids.has(t.id))return reply({error:'Invalid or duplicate team ID'},400);
   ids.add(t.id);
   if(typeof t.name!=='string'||!clean(t.name)||clean(t.name).length>80||typeof t.caption!=='string'||clean(t.caption).length>220||typeof t.captain!=='string'||clean(t.captain).length>100||!Array.isArray(t.members)||t.members.length>150)return reply({error:'Invalid team fields'},400);
   const members=[];
   for(const member of t.members){
    if(typeof member!=='string'||!clean(member)||clean(member).length>100)return reply({error:'Invalid member name'},400);
    const name=cleanName(member)+(String(member).trim().endsWith('+1')?' +1':''),key=canonical(name);
    if(assigned.has(key))return reply({error:'A guest can only belong to one team: '+name},400);
    assigned.add(key);members.push(name);
   }
   cleaned.push({id:t.id,name:clean(t.name),caption:clean(t.caption),captain:cleanName(t.captain),members});
  }
  const eligible=new Set(eligibility.eligible.filter(p=>!roles[squadRoleKey(p.name)]).map(p=>eligibleKey(p.name)));
  for(const team of cleaned)for(const member of team.members){
   if(!eligible.has(eligibleKey(member)))return reply({error:'Only Guest List players with both RSVP = Yes and Paid = Yes and without * or a non-playing role can be published: '+member},400);
  }
  // Verify all eligible individual players, including paid plus-ones, and keep teams balanced before publishing.
  const balanced=balanceTeams(cleaned,eligibility,roles);
  if(balanced.error)return reply({error:balanced.error},400);
  const next={...data,teams:balanced.teams,teamsPublished:true};
  const saved=await env.FRIENDSGIVING_DB.prepare('UPDATE organizer_data SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(next),revision).run();
  if(!saved.meta.changes)return reply({error:'The teams changed. Refresh before saving.'},409);
  return reply({revision:revision+1,teams:balanced.teams,isPublished:true});
 }catch{return reply({error:'Unable to save teams'},500)}
}
