import {formEligible,reconcileTeams} from '../../_lib/team-eligibility.js';
import {SQUAD_ROLE_LABELS,readSquadRoles,squadRoleKey} from '../../_lib/squad-roles.js';
// Organizer-only roster classification. Roles are not included in the public
// Guest List or team lookup API and never change Google Sheets/Forms source data.
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const validHost=host=>['ajd-friendsgiving.pages.dev','friendsgiving.ajdapp.org'].includes(host);

export async function onRequestPost({request,env}){
 const url=new URL(request.url);
 if(!validHost(url.hostname)||request.headers.get('Origin')!==url.origin)return reply({error:'Invalid origin'},403);
 if(!String(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply({error:'JSON required'},415);
 try{
  const raw=await request.text();
  if(raw.length>6000)return reply({error:'Role update too large'},413);
  const {name,role,customTitle='',revision}=JSON.parse(raw);
  if(!Number.isSafeInteger(revision)||revision<0)return reply({error:'Reload the role assignments before saving.'},400);
  if(typeof name!=='string'||name.length>100||typeof role!=='string'||!Object.hasOwn(SQUAD_ROLE_LABELS,role))
   return reply({error:'Choose a valid person and position.'},400);
  const key=squadRoleKey(name);
  if(!key||key.length>60)return reply({error:'Invalid person'},400);
  if(typeof customTitle!=='string'||customTitle.length>60)return reply({error:'Custom position must be 60 characters or less.'},400);
  const title=customTitle.trim().replace(/[<>]/g,'');
  if(role==='other'&&!title)return reply({error:'Enter a name for the custom position.'},400);
  const [orgRow,formRow,draftRow]=await Promise.all([
   env.FRIENDSGIVING_DB.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT data FROM friendsgiving_form_responses WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT content FROM team_drafts WHERE id=1').first()
  ]);
  if(!orgRow||!formRow||!draftRow)return reply({error:'Guest list or team draft unavailable'},503);
  if(orgRow.revision!==revision)return reply({error:'Team roles changed elsewhere. Refresh and review before editing.'},409);
  const organizer=JSON.parse(orgRow.content);
  const draft=JSON.parse(draftRow.content);
  const eligible=formEligible(organizer,JSON.parse(formRow.data));
  const people=new Set(eligible.eligible.map(p=>squadRoleKey(p.name)));
  const captains=new Set();
  for(const t of [...draft,...(Array.isArray(organizer.teams)?organizer.teams:[])]){
   const cap=squadRoleKey(t.captain);
   if(cap){captains.add(cap);people.add(cap)}
  }
  if(!people.has(key))return reply({error:'This person is not currently on the eligible Guest List or a team captain.'},400);
  if(captains.has(key)&&role!=='player')
   return reply({error:'Choose another captain for their team before assigning this person a non-playing position.'},400);
  const roles=readSquadRoles(organizer.squadRoles);
  if(role==='player')delete roles[key];
  else roles[key]={role,...(role==='other'?{title}:{})};
  const next={...organizer,squadRoles:roles};
  const saved=await env.FRIENDSGIVING_DB.prepare('UPDATE organizer_data SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?')
   .bind(JSON.stringify(next),revision).run();
  if(saved.meta?.changes!==1)return reply({error:'Roles changed elsewhere. Refresh this page before saving.'},409);
  const teams=await reconcileTeams(env.FRIENDSGIVING_DB);
  return reply({ok:true,roles,
   teamStatus:teams.ok?'updated':'review-needed',
   teamWarning:teams.ok?null:teams.error,
   changedRosters:teams.ok&&teams.changed});
 }catch{return reply({error:'Unable to save this position.'},500)}
}
