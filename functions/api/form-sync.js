import {reconcileTeams} from '../_lib/team-eligibility.js';
// Secure Forms response sync: only minimal participant/registration fields are accepted.
// Email, telephone and dietary/allergy free text are deliberately never copied.
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const sheetId='1JRPCoLs2pB44-WyiGvACL0nnDVeiyj_NrgHS8cYrluY';
async function auth(request,db){
 const token=request.headers.get('X-Friendsgiving-Form-Sync')||'';
 if(token.length<44||token.length>150)return false;
 const saved=await db.prepare('SELECT secret_hash FROM friendsgiving_form_sync_auth WHERE id=1').first();
 if(!saved?.secret_hash||saved.secret_hash.length!==64)return false;
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 const digest=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
 let delta=0;for(let i=0;i<64;i++)delta|=digest.charCodeAt(i)^saved.secret_hash.charCodeAt(i);
 return delta===0;
}
export async function onRequestPost({request,env}){
 const url=new URL(request.url);
 if(!['ajd-friendsgiving.pages.dev','friendsgiving.ajdapp.org'].includes(url.hostname))return json({error:'Host not allowed'},403);
 if(!String(request.headers.get('Content-Type')||'').startsWith('application/json'))return json({error:'JSON required'},415);
 if(!await auth(request,env.FRIENDSGIVING_DB))return json({error:'Invalid sync credential'},401);
 try{
  const body=await request.text();if(body.length>120000)return json({error:'Too large'},413);
  const payload=JSON.parse(body);
  if(payload.spreadsheetId!==sheetId||payload.tab!=='Form Responses 1'||!Array.isArray(payload.records)||payload.records.length<1||payload.records.length>500)return json({error:'Invalid form source'},400);
  const fields=['name','shirt','plusOne','plusOneShirt','children','athletic'],items=[];
  for(const r of payload.records){
   if(!r||!Number.isInteger(r.sourceRow)||r.sourceRow<2||r.sourceRow>10000||fields.some(k=>typeof r[k]!=='string'||r[k].length>300)||!r.name.trim())return json({error:'Invalid response fields'},400);
   items.push({sourceRow:r.sourceRow,...Object.fromEntries(fields.map(k=>[k,r[k].trim()])),plusOneYes:typeof r.plusOneYes==='string'?r.plusOneYes.trim().slice(0,30):''});
  }
  const existing=await env.FRIENDSGIVING_DB.prepare('SELECT revision FROM friendsgiving_form_responses WHERE id=1').first();
  if(!existing)return json({error:'Form table unavailable'},503);
  const record={sourceSpreadsheet:sheetId,tab:'Form Responses 1',records:items,mode:'live_google_form_sync',lastImportedAt:new Date().toISOString()};
  const write=await env.FRIENDSGIVING_DB.prepare('UPDATE friendsgiving_form_responses SET data=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(record),existing.revision).run();
  if(!write.meta.changes)return json({error:'Concurrent sync; retry'},409);
  const teamRefresh=await reconcileTeams(env.FRIENDSGIVING_DB);
  return json({ok:true,processed:items.length,revision:existing.revision+1,teamsAutoUpdated:teamRefresh.ok&&teamRefresh.changed,teamWarning:teamRefresh.ok?null:teamRefresh.error});
 }catch{return json({error:'Unable to process form responses'},500)}
}
