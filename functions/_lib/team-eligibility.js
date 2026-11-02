// Shared, idempotent matching and balancing for Friendsgiving teams.
// Only names in the form response list can be assigned as players, and they
// must be linked unambiguously to a paid AND RSVP-confirmed guest list entry.
// Changes to live teams are made only after an initial manual publication.
export const nameKey=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en-US').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const yes=value=>['yes','paid','confirmed','attending','true','1'].includes(String(value||'').trim().toLowerCase());
const words=s=>nameKey(s).split(' ').filter(Boolean);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function formEligible(organizer,form){
 const list=Array.isArray(organizer?.guests)?organizer.guests:[];
 const paymentRows=list.filter(r=>Array.isArray(r)&&nameKey(r[0]));
 const sources=new Map();
 for(const r of Array.isArray(form?.records)?form.records:[]){
  for(const name of [r?.name,r?.plusOne]){
   const k=nameKey(name);
   if(!k||k.length<2)continue;
   const prior=sources.get(k);
   if(!prior)sources.set(k,{name:String(name).trim(),key:k});
  }
 }
 const all=[...sources.values()];
 const firstFreq=new Map(),sheetFirst=new Map();
 for(const v of all){const first=words(v.name)[0];firstFreq.set(first,(firstFreq.get(first)||0)+1)}
 for(const v of paymentRows){const first=words(v[0])[0];sheetFirst.set(first,(sheetFirst.get(first)||0)+1)}
 const eligible=[],review=[],usedSheet=new Set(),aliases=new Map();
 for(const person of all){
  const key=person.key,parts=words(person.name),first=parts[0],last=parts.at(-1);
  let indexes=paymentRows.map((r,i)=>({r,i})).filter(x=>nameKey(x.r[0])===key);
  let method='exact';
  if(indexes.length===0&&parts.length>=2){
   indexes=paymentRows.map((r,i)=>({r,i})).filter(x=>{
    const p=words(x.r[0]);
    return p.length>=2&&p[0]===first&&p[p.length-1][0]===last[0];
   });
   method='initial';
  }
  if(indexes.length===0&&firstFreq.get(first)===1&&sheetFirst.get(first)===1){
   indexes=paymentRows.map((r,i)=>({r,i})).filter(x=>{
    const p=words(x.r[0]);return p.length===1&&p[0]===first;
   });
   method='unique-first-only';
  }
  if(indexes.length!==1||usedSheet.has(indexes[0].i)){
   review.push({reason:indexes.length>1?'ambiguous':indexes.length===1?'duplicate-sheet-match':'no-match'});
   continue;
  }
  const hit=indexes[0],row=hit.r;
  // Reserve a payment row for at most one person. No inferred or partial payments.
  usedSheet.add(hit.i);
  if(!yes(row[3])||!yes(row[4])){review.push({reason:'not-paid-and-confirmed'});continue}
  const player={name:person.name,alias:String(row[0]).trim(),method};
  eligible.push(player);
  aliases.set(key,key);aliases.set(nameKey(player.alias),key);
 }
 return {eligible,aliases,reviewCount:review.length,reasonCounts:review.reduce((o,x)=>(o[x.reason]=(o[x.reason]||0)+1,o),{}),sourceCount:all.length};
}
export function balanceTeams(input,eligibility){
 if(!Array.isArray(input)||input.length===0)return {teams:input||[],changed:false,assigned:0,removed:0,added:0,reason:'no-teams'};
 const existing=input.map(t=>({...t,members:Array.isArray(t.members)?[...t.members]:[]}));
 const occupied=new Set(),captains=new Set();
 for(const team of existing){
  const key=nameKey(team.captain);
  if(!key)continue;
  const canonical=eligibility.aliases.get(key)||key;
  if(captains.has(canonical))return {teams:input,changed:false,error:'Duplicate captain names'};
  captains.add(canonical);occupied.add(canonical);
 }
 const allowed=new Map(eligibility.eligible.map(p=>[nameKey(p.name),p.name]));
 let removed=0,added=0,moved=0;
 for(const team of existing){
  const clean=[];
  for(const member of team.members){
   const k=nameKey(member),canonical=eligibility.aliases.get(k)||k;
   if(!allowed.has(canonical)||occupied.has(canonical)){removed++;continue}
   occupied.add(canonical);
   clean.push(allowed.get(canonical)); // always use the form's full name
  }
  team.members=clean;
 }
 const size=t=>t.members.length+(nameKey(t.captain)?1:0);
 for(const p of eligibility.eligible){
  const canonical=nameKey(p.name);
  if(occupied.has(canonical))continue;
  const min=Math.min(...existing.map(size)),index=existing.findIndex(t=>size(t)===min);
  existing[index].members.push(p.name);occupied.add(canonical);added++;
 }
 // Minimize disturbance: move only enough players to get within one person.
 for(let count=0;count<2000;count++){
  const sizes=existing.map(size),max=Math.max(...sizes),min=Math.min(...sizes);
  if(max-min<=1)break;
  const from=sizes.indexOf(max),to=sizes.indexOf(min);
  if(from===to||!existing[from].members.length)break;
  existing[to].members.push(existing[from].members.pop());moved++;
 }
 return {teams:existing,changed:!same(existing,input),assigned:occupied.size,removed,added,moved};
}
// Refreshes private draft plus any ALREADY PUBLISHED team roster.
// Does not publish a new lineup. Never writes Form response details to public APIs.
export async function reconcileTeams(db){
 for(let attempt=0;attempt<3;attempt++){
  const [orgRow,formRow,draftRow]=await Promise.all([
   db.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first(),
   db.prepare('SELECT data,revision FROM friendsgiving_form_responses WHERE id=1').first(),
   db.prepare('SELECT content,revision FROM team_drafts WHERE id=1').first()
  ]);
  if(!orgRow||!formRow||!draftRow)return {ok:false,error:'Missing team source'};
  const organizer=JSON.parse(orgRow.content),form=JSON.parse(formRow.data);
  const eligibility=formEligible(organizer,form);
  const privateResult=balanceTeams(JSON.parse(draftRow.content),eligibility);
  const publicResult=balanceTeams(Array.isArray(organizer.teams)?organizer.teams:[],eligibility);
  if(privateResult.error||publicResult.error)return {ok:false,error:privateResult.error||publicResult.error,eligible:eligibility.eligible.length};
  if(!privateResult.changed&&!publicResult.changed)return {ok:true,eligible:eligibility.eligible.length,review:eligibility.reviewCount,changed:false,privateResult,publicResult};
  if(privateResult.changed){
   const result=await db.prepare('UPDATE team_drafts SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(privateResult.teams),draftRow.revision).run();
   if(!result.meta?.changes)continue;
  }
  if(publicResult.changed){
   const next={...organizer,teams:publicResult.teams};
   const result=await db.prepare('UPDATE organizer_data SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(next),orgRow.revision).run();
   if(!result.meta?.changes)continue;
  }
  return {ok:true,changed:true,eligible:eligibility.eligible.length,review:eligibility.reviewCount,privateResult,publicResult};
 }
 return {ok:false,error:'Concurrent changes; retry automatic assignment'};
}
