// Public team lookup only. Never transmit full rosters or guest/payment records.
const headers={
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store, private',
 'Pragma':'no-cache',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer'
};
const reply=(result,status=200)=>new Response(JSON.stringify(result),{status,headers});
const validHost=hostname=>['ajd-friendsgiving.pages.dev','friendsgiving.ajdapp.org'].includes(hostname);
// Team rosters use unique first names; accept either first name or full name
// as guest input. Ambiguous duplicate first names return no result below.
const normalized=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z\s]/g,' ').trim().replace(/\s+/g,' ').split(' ')[0]?.toLowerCase()||'';
function publishedTeams(data){
 if(data.teamsPublished===false)return [];
 return Array.isArray(data.teams)?data.teams.filter(team=>team&&typeof team.name==='string'&&team.name.trim()&&Array.isArray(team.members)):[];
}
export async function onRequestGet({request,env}){
 if(!validHost(new URL(request.url).hostname))return reply({error:'Invalid website'},403);
 try{
  const row=await env.FRIENDSGIVING_DB.prepare('SELECT content FROM organizer_data WHERE id=1').first();
  if(!row)return reply({hasPublishedTeams:false});
  const teams=publishedTeams(JSON.parse(row.content));
  // Do not reveal team names, captains, member names, or member counts here.
  return reply({hasPublishedTeams:teams.some(t=>t.members.length>0||normalized(t.captain))});
 }catch{return reply({error:'Team lookup unavailable'},503)}
}
export async function onRequestPost({request,env}){
 const url=new URL(request.url);
 if(!validHost(url.hostname)||request.headers.get('Origin')!==url.origin)return reply({error:'Invalid request origin'},403);
 if(!String(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply({error:'JSON required'},415);
 try{
  const raw=await request.text();
  if(raw.length>600)return reply({error:'Invalid name'},400);
  const input=JSON.parse(raw);
  if(!input||typeof input.name!=='string'||input.name.length>100)return reply({error:'Enter your name'},400);
  const key=normalized(input.name);
  if(key.length<2||key.length>100)return reply({error:'Enter your full name'},400);
  const row=await env.FRIENDSGIVING_DB.prepare('SELECT content FROM organizer_data WHERE id=1').first();
  if(!row)return reply({found:false});
  const teams=publishedTeams(JSON.parse(row.content));
  let result=null;
  for(const team of teams){
   // Match exactly against a published player name. Never perform prefix or partial search.
   if(normalized(team.captain)!==key&&!team.members.some(member=>typeof member==='string'&&normalized(member)===key))continue;
   if(result)return reply({found:false}); // Ambiguous assignments: disclose nothing.
   result={found:true,team:team.name.trim(),captain:typeof team.captain==='string'&&team.captain.trim()?team.captain.trim():'To be announced'};
  }
  return reply(result||{found:false});
 }catch{return reply({error:'Unable to look up your team'},503)}
}
