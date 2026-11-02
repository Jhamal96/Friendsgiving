// Admin-side team management. The public endpoint never returns planner/payment details.
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const validHost=host=>['ajd-friendsgiving.pages.dev','friendsgiving.ajdapp.org'].includes(host);
const clean=s=>typeof s==='string'?s.trim():'';
const safeTeams=teams=>Array.isArray(teams)?teams.map(t=>({id:t.id,name:t.name,caption:t.caption,captain:t.captain,members:t.members})).filter(t=>t&&typeof t.name==='string'):[];
export async function onRequestGet({request,env}){
 try{
  if(!validHost(new URL(request.url).hostname))return reply({error:'Invalid host'},403);
  const row=await env.FRIENDSGIVING_DB.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first();
  if(!row)return reply({error:'Team manager is unavailable'},503);
  const data=JSON.parse(row.content);
  return reply({teams:safeTeams(data.teams),guests:Array.from(new Set((data.guests||[]).map(g=>clean(g[0])).filter(Boolean))).slice(0,500),revision:row.revision});
 }catch{return reply({error:'Team manager is unavailable'},503)}
}
export async function onRequestPost({request,env}){
 const u=new URL(request.url);
 if(!validHost(u.hostname)||request.headers.get('Origin')!==u.origin)return reply({error:'Invalid origin'},403);
 if(!String(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply({error:'JSON required'},415);
 try{
  const raw=await request.text();
  if(raw.length>100000)return reply({error:'Request too large'},413);
  const {teams,revision}=JSON.parse(raw);
  if(!Number.isSafeInteger(revision)||!Array.isArray(teams)||teams.length>32)return reply({error:'Invalid team list'},400);
  const ids=new Set(),assigned=new Set(),cleaned=[];
  for(const t of teams){
   if(!t||typeof t!=='object'||Array.isArray(t)||typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(t.id)||ids.has(t.id))return reply({error:'Invalid or duplicate team ID'},400);
   ids.add(t.id);
   if(typeof t.name!=='string'||!clean(t.name)||clean(t.name).length>80||typeof t.caption!=='string'||clean(t.caption).length>220||typeof t.captain!=='string'||clean(t.captain).length>100||!Array.isArray(t.members)||t.members.length>150)return reply({error:'Invalid team fields'},400);
   const members=[];
   for(const member of t.members){
    if(typeof member!=='string'||!clean(member)||clean(member).length>100)return reply({error:'Invalid member name'},400);
    const name=clean(member),key=name.toLocaleLowerCase('en-US');
    if(assigned.has(key))return reply({error:'A guest can only belong to one team: '+name},400);
    assigned.add(key);members.push(name);
   }
   cleaned.push({id:t.id,name:clean(t.name),caption:clean(t.caption),captain:clean(t.captain),members});
  }
  const row=await env.FRIENDSGIVING_DB.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first();
  if(!row)return reply({error:'Planner unavailable'},503);
  if(row.revision!==revision)return reply({error:'The teams were updated elsewhere. Refresh before saving.'},409);
  const data=JSON.parse(row.content);
  const next={...data,teams:cleaned};
  const saved=await env.FRIENDSGIVING_DB.prepare('UPDATE organizer_data SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(next),revision).run();
  if(!saved.meta.changes)return reply({error:'The teams changed. Refresh before saving.'},409);
  return reply({revision:revision+1,teams:cleaned});
 }catch{return reply({error:'Unable to save teams'},500)}
}
