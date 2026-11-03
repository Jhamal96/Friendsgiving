import {reconcileTeams} from '../_lib/team-eligibility.js';
// Google Apps Script -> Cloudflare D1. Never expose the sync credential in browser code.
// The existing public /api/teams endpoint does not expose planner/payment fields.
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const spreadsheetId='15KhO9_BuCQrJXeTzr4hAyNrqDocAbZsObu_FsWAjGuk';
const fields=['Guest name','Size Shirt','Amount','RSVP','Paid','Paid via','Shirt size'];
const nameKey=s=>String(s||'').trim().toLocaleLowerCase('en-US');
const stripAmount=x=>String(x||'').trim().replace(/[$,]/g,'');
const normalized=r=>Array.from({length:7},(_,i)=>i===2?stripAmount(r[i]):String(r[i]??'').trim());
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
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
 if(!['ajd-friendsgiving.pages.dev','friendsgiving.ajdapp.org'].includes(new URL(request.url).hostname))return json({error:'Host not allowed'},403);
 if(!String(request.headers.get('Content-Type')||'').startsWith('application/json'))return json({error:'JSON required'},415);
 try{
  if(!await authorized(request,env))return json({error:'Invalid synchronization credential'},401);
  const raw=await request.text();
  if(raw.length>200000)return json({error:'Payload exceeds limit'},413);
  const input=JSON.parse(raw);
  if(input.spreadsheetId!==spreadsheetId||input.tab!=='Guest List'||!Array.isArray(input.rows)||input.rows.length<1||input.rows.length>500)return json({error:'Unexpected sheet or row count'},400);
  const incoming=new Map();
  for(const row of input.rows){
   if(!Array.isArray(row)||row.length!==7||row.some(x=>typeof x!=='string'||x.length>500))return json({error:'Invalid guest cells'},400);
   const fixed=normalized(row),key=nameKey(fixed[0]);
   if(!key||incoming.has(key))return json({error:'Missing or duplicate guest name'},400);
   incoming.set(key,fixed);
  }
  const row=await env.FRIENDSGIVING_DB.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first();
  if(!row)return json({error:'Planner missing'},503);
  const data=JSON.parse(row.content);
  if(!Array.isArray(data.guests))return json({error:'Planner data invalid'},503);
  const prior=data.sheetSync||{},baseline=prior.baseline||{},oldConflicts=new Set((prior.conflicts||[]).map(c=>nameKey(c.guest)+'::'+c.field));
  const known=new Map(data.guests.map((g,i)=>[nameKey(g?.[0]),i]).filter(([k])=>!!k));
  const removed=data.removedGuests&&typeof data.removedGuests==='object'&&!Array.isArray(data.removedGuests)
   ?data.removedGuests:{};
  let cellChanges=0,added=0;
  const conflicts=[];
  for(const [key,sheet] of incoming){
   // Keep a removed guest archived locally until an organizer restores them.
   // The full Google Sheets baseline remains authoritative but is never edited here.
   if(Object.hasOwn(removed,key))continue;
   const localIndex=known.get(key);
   if(localIndex===undefined){
    if(data.guests.length>=500)return json({error:'Guest limit reached'},409);
    data.guests.push(sheet);known.set(key,data.guests.length-1);added++;continue;
   }
   const local=data.guests[localIndex];
   const base=Array.isArray(baseline[key])?normalized(baseline[key]):null;
   for(let i=1;i<7;i++){
    const l=String(local[i]??'').trim(),remote=sheet[i],previous=base?.[i];
    if(l===remote)continue;
    if(base&&remote!==previous&&l===previous){local[i]=remote;cellChanges++;continue}
    if(!base&&l===''){local[i]=remote;cellChanges++;continue}
    if(base&&remote!==previous&&l!==previous){conflicts.push({guest:sheet[0],field:fields[i]});continue}
    if(oldConflicts.has(key+'::'+fields[i])&&l!==remote){conflicts.push({guest:sheet[0],field:fields[i]});continue}
    // Website-only changes are retained until two-way write-back is configured.
   }
  }
  // A full successful Sheet sync is authoritative for current source presence.
  // Keep removed guests in the website planner for history, but stop listing
  // them as active Google Guest List participants for team assignment.
  const nextBaseline=Object.fromEntries(incoming);
  const now=new Date().toISOString();
  const nextSync={...prior,spreadsheetId,tab:'Guest List',status:'sheet_to_site_active',lastImportedAt:now,baseline:nextBaseline,conflicts};
  const changed=cellChanges>0||added>0||!equal(prior.baseline,nextBaseline)||!equal(prior.conflicts||[],conflicts)||prior.status!=='sheet_to_site_active';
  if(changed){
   data.sheetSync=nextSync;
   const save=await env.FRIENDSGIVING_DB.prepare('UPDATE organizer_data SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(data),row.revision).run();
   if(!save.meta.changes)return json({error:'Planner was edited during sync; retry shortly'},409);
  }
  await env.FRIENDSGIVING_DB.prepare('INSERT INTO sheet_sync_status (id,last_check_at,last_success_at,last_changes,last_conflicts,last_error) VALUES (1,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET last_check_at=excluded.last_check_at,last_success_at=excluded.last_success_at,last_changes=excluded.last_changes,last_conflicts=excluded.last_conflicts,last_error=NULL').bind(now,now,cellChanges+added,conflicts.length).run();
  const teamRefresh=await reconcileTeams(env.FRIENDSGIVING_DB);
  return json({ok:true,matched:incoming.size,updatedCells:cellChanges,addedGuests:added,conflicts:conflicts.length,revision:(changed?row.revision+1:row.revision)+(teamRefresh.ok&&teamRefresh.publicResult?.changed?1:0),teamsAutoUpdated:teamRefresh.ok&&teamRefresh.changed,teamWarning:teamRefresh.ok?null:teamRefresh.error});
 }catch(e){return json({error:'Synchronization failed'},500)}
}
export async function onRequestGet({env}){
 try{
  const row=await env.FRIENDSGIVING_DB.prepare('SELECT last_check_at,last_success_at,last_changes,last_conflicts FROM sheet_sync_status WHERE id=1').first();
  return json({configured:!!row,lastCheckAt:row?.last_check_at||null,lastSuccessAt:row?.last_success_at||null,lastChanges:row?.last_changes||0,conflicts:row?.last_conflicts||0,direction:'Google Sheets to Friendsgiving'});
 }catch{return json({configured:false},503)}
}
