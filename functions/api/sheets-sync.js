import {reconcileTeams} from '../_lib/team-eligibility.js';
// Authorized Google Apps Script pushes the Guest List to Cloudflare D1.
// This is a ONE-WAY sync. The real Guest List is authoritative; prior website
// edits and removed spreadsheet rows are archived, never silently kept active.
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const spreadsheetId='15KhO9_BuCQrJXeTzr4hAyNrqDocAbZsObu_FsWAjGuk';
const nameKey=s=>String(s||'').trim().toLocaleLowerCase('en-US');
const normalized=r=>Array.from({length:7},(_,i)=>i===2?String(r[i]??'').trim().replace(/[$,]/g,''):String(r[i]??'').trim());
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const validHost=hostname=>['ajd-friendsgiving.pages.dev','friendsgiving.ajdapp.org'].includes(hostname);
const isHeader=row=>nameKey(row[0])==='guests'&&nameKey(row[2])==='amount'&&nameKey(row[4])==='paid';
const metadataNames=new Set(['select name ->','select namw->','guests','search:','name:','rsvp\'d:','paid','total:','total received:']);
const isMetadata=row=>metadataNames.has(nameKey(row[0]))||
  (!String(row[0]||'').trim()&&String(row[2]||'').toLowerCase().includes('total'));
function sourceRows(rows){
 // Old installed Apps Script versions start at row 2 and include the sheet's
 // controls / row-4 header. New versions start after that header.
 const header=rows.findIndex(isHeader);
 const actual=header>=0?rows.slice(header+1):rows;
 const result=new Map();
 for(const row of actual){
  if(!Array.isArray(row)||row.length!==7||row.some(v=>typeof v!=='string'||v.length>500))return null;
  const fixed=normalized(row),key=nameKey(fixed[0]);
  if(!key||isMetadata(fixed))continue;
  if(result.has(key))return null;
  result.set(key,fixed);
 }
 return result;
}
async function authorized(request,env){
 const key=request.headers.get('X-Friendsgiving-Sheet-Sync');
 if(!key||key.length<45||key.length>180)return false;
 const row=await env.FRIENDSGIVING_DB.prepare('SELECT secret_hash FROM sheet_sync_auth WHERE id=1').first();
 if(!row?.secret_hash||row.secret_hash.length!==64)return false;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
 const actual=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 let difference=0;
 for(let i=0;i<64;i++)difference|=actual.charCodeAt(i)^row.secret_hash.charCodeAt(i);
 return difference===0;
}
export async function onRequestPost({request,env}){
 if(!validHost(new URL(request.url).hostname))return json({error:'Host not allowed'},403);
 if(!String(request.headers.get('Content-Type')||'').startsWith('application/json'))return json({error:'JSON required'},415);
 try{
  if(!await authorized(request,env))return json({error:'Invalid synchronization credential'},401);
  const raw=await request.text();
  if(raw.length>200000)return json({error:'Payload exceeds limit'},413);
  const input=JSON.parse(raw);
  if(input.spreadsheetId!==spreadsheetId||input.tab!=='Guest List'||
     !Array.isArray(input.rows)||input.rows.length<1||input.rows.length>500)
   return json({error:'Unexpected sheet or row count'},400);
  const incoming=sourceRows(input.rows);
  if(!incoming||incoming.size===0)return json({error:'Invalid, duplicate or missing Guest List rows'},400);
  const current=await env.FRIENDSGIVING_DB.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first();
  if(!current)return json({error:'Planner missing'},503);
  const data=JSON.parse(current.content);
  if(!Array.isArray(data.guests))return json({error:'Planner data invalid'},503);
  const prior=data.sheetSync&&typeof data.sheetSync==='object'?data.sheetSync:{};
  const oldSource=Object.keys(prior.baseline||{}).filter(k=>!metadataNames.has(k)).length;
  // Refuse accidental mass deletions if the Sheet hook sends a partial batch.
  if(oldSource>=15&&incoming.size<Math.floor(oldSource*0.6))
   return json({error:'Guest List looks incomplete: refusing to replace active records'},409);
  const priorRows=new Map(data.guests.filter(r=>Array.isArray(r)&&r[0]).map(r=>[nameKey(r[0]),r]));
  const historic=prior.inactiveGuests&&typeof prior.inactiveGuests==='object'&&!Array.isArray(prior.inactiveGuests)?{...prior.inactiveGuests}:{};
  let added=0,updated=0,archived=0;
  for(const [key,row]of incoming){
   const old=priorRows.get(key);
   if(!old)added++;
   else for(let i=0;i<7;i++)if(String(old[i]??'').trim()!==row[i])updated++;
   delete historic[key]; // Reappearing on the Sheet restores the person.
  }
  for(const [key,row]of priorRows){
   if(incoming.has(key))continue;
   if(!Object.hasOwn(historic,key))archived++;
   historic[key]=row.slice(0,7);
  }
  const active=[...incoming.values()];
  const baseline=Object.fromEntries(incoming);
  const now=new Date().toISOString();
  const nextSync={...prior,spreadsheetId,tab:'Guest List',status:'sheet_to_site_active',
   lastImportedAt:now,baseline,inactiveGuests:historic,conflicts:[]};
  const changed=!equal(data.guests,active)||!equal(prior.baseline||{},baseline)||
   !equal(prior.inactiveGuests||{},historic)||!equal(prior.conflicts||[],[])||
   prior.status!=='sheet_to_site_active';
  if(changed){
   // Preserve team drafts, captain photos, staff roles and the original archive.
   const next={...data,guests:active,sheetSync:nextSync};
   const saved=await env.FRIENDSGIVING_DB.prepare('UPDATE organizer_data SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?')
    .bind(JSON.stringify(next),current.revision).run();
   if(!saved.meta?.changes)return json({error:'Planner changed during sync; retry shortly'},409);
  }
  await env.FRIENDSGIVING_DB.prepare(
   'INSERT INTO sheet_sync_status (id,last_check_at,last_success_at,last_changes,last_conflicts,last_error) VALUES (1,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET last_check_at=excluded.last_check_at,last_success_at=excluded.last_success_at,last_changes=excluded.last_changes,last_conflicts=excluded.last_conflicts,last_error=NULL'
  ).bind(now,now,updated+added+archived,0).run();
  const teamRefresh=await reconcileTeams(env.FRIENDSGIVING_DB);
  return json({ok:true,matched:incoming.size,updatedCells:updated,addedGuests:added,archivedGuests:archived,conflicts:0,
   revision:current.revision+(changed?1:0)+(teamRefresh.ok&&teamRefresh.publicResult?.changed?1:0),
   teamsAutoUpdated:teamRefresh.ok&&teamRefresh.changed,teamWarning:teamRefresh.ok?null:teamRefresh.error});
 }catch{return json({error:'Synchronization failed'},500)}
}
export async function onRequestGet({env}){
 try{
  const [status,organizer]=await Promise.all([
   env.FRIENDSGIVING_DB.prepare('SELECT last_check_at,last_success_at,last_changes,last_conflicts,last_error FROM sheet_sync_status WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT content FROM organizer_data WHERE id=1').first()
  ]);
  const d=organizer?.content?JSON.parse(organizer.content):{},source=d.sheetSync?.baseline||{};
  return json({configured:!!status,lastCheckAt:status?.last_check_at||null,lastSuccessAt:status?.last_success_at||null,
   lastChanges:status?.last_changes||0,conflicts:status?.last_conflicts||0,
   lastError:status?.last_error||null,activeGuests:Object.keys(source).filter(k=>!metadataNames.has(k)).length,
   direction:'Google Sheets to Friendsgiving'});
 }catch{return json({configured:false},503)}
}
