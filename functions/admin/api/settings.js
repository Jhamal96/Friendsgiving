const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const respond=(x,status=200)=>new Response(JSON.stringify(x),{status,headers});
const validOrder=(o,n)=>Array.isArray(o)&&o.length===n&&new Set(o).size===n&&o.every(i=>Number.isInteger(i)&&i>=0&&i<n);
export async function onRequestPost({request,env}){
 const u=new URL(request.url);
 if(!['ajd-friendsgiving.pages.dev','friendsgiving.ajdapp.org'].includes(u.hostname)||request.headers.get('Origin')!==u.origin)return respond({error:'Invalid origin'},403);
 if(!String(request.headers.get('Content-Type')||'').startsWith('application/json'))return respond({error:'JSON required'},415);
 try{
  const raw=await request.text();
  if(raw.length>30000)return respond({error:'Too large'},413);
  const body=JSON.parse(raw);
  if(!Array.isArray(body.text)||body.text.length!==40||body.text.some(x=>typeof x!=='string'||x.length>500)||!Array.isArray(body.hidden)||![5,6].includes(body.hidden.length)||body.hidden.some(x=>typeof x!=='boolean'))return respond({error:'Invalid settings'},400);
  const hidden=body.hidden.length===5?[body.hidden[0],body.hidden[1],body.hidden[2],false,body.hidden[3],body.hidden[4]]:body.hidden;
  let order=body.order;
  if(validOrder(order,5)){const oldToNew=[0,1,2,4,5];order=order.map(i=>oldToNew[i]);order.splice(order.indexOf(2)+1,0,3)}
  if(!validOrder(order,6))return respond({error:'Invalid section order'},400);
  const saved=JSON.stringify({text:body.text,hidden,order});
  // Use the original complete settings string for optimistic concurrency;
  // other tabs cannot silently overwrite edits made since this page loaded.
  if(typeof body.expected!=='string'||body.expected.length>30000)return respond({error:'Reload settings before saving'},428);
  const result=await env.FRIENDSGIVING_DB.prepare('UPDATE site_settings SET content=?,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND content=?').bind(saved,body.expected).run();
  if(result.meta.changes!==1)return respond({error:'Settings changed elsewhere. Keep this page open and reload before editing again.'},409);
  return respond({ok:true,settings:JSON.parse(saved)});
 }catch{return respond({error:'Unable to save settings'},500)}
}
