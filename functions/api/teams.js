// Public, read-only projection: never return private planner, RSVP, or payment columns.
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function onRequestGet({env}){
 try{
  const row=await env.FRIENDSGIVING_DB.prepare('SELECT content FROM organizer_data WHERE id=1').first();
  if(!row)return new Response(JSON.stringify({teams:[]}),{headers});
  const data=JSON.parse(row.content);
  const teams=Array.isArray(data.teams)?data.teams.map(t=>({
   id:String(t.id||''),name:String(t.name||''),caption:String(t.caption||''),captain:String(t.captain||''),
   members:Array.isArray(t.members)?t.members.filter(x=>typeof x==='string').slice(0,150):[]
  })).filter(t=>t.name).slice(0,32):[];
  return new Response(JSON.stringify({teams}),{headers});
 }catch{return new Response(JSON.stringify({error:'Teams unavailable'}),{status:503,headers})}
}
