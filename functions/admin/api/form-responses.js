// Admin-only projection of form-response matching.
// Never returns phone numbers, emails, allergies, or other free-text response fields.
// CAUTION: organizer URL is not authenticated; return only existing short guest aliases.
const respond=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const norm=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9+ ]/g,' ').replace(/\s+/g,' ').trim();
function match(name,guests){
 const key=norm(name);if(!key)return {kind:'none'};
 const exact=guests.filter(g=>norm(g)===key);if(exact.length===1)return {kind:'matched',alias:exact[0],method:'Exact'};
 const parts=key.split(' ');const first=parts[0],last=parts.length>1?parts[parts.length-1]:'';
 const candidates=guests.filter(g=>norm(g).split(' ')[0]===first);
 if(last&&candidates.length>0){
  const initial=candidates.filter(g=>{const gg=norm(g).split(' ');return gg.length>1&&gg[gg.length-1][0]===last[0]});
  if(initial.length===1)return {kind:'matched',alias:initial[0],method:'First and last initial'};
 }
 if(candidates.length===1)return {kind:'matched',alias:candidates[0],method:'Unique first name'};
 return {kind:candidates.length?'ambiguous':'unmatched'};
}
export async function onRequestGet({env}){
 try{
  const [response,planner]=await Promise.all([
   env.FRIENDSGIVING_DB.prepare('SELECT data,revision,updated_at FROM friendsgiving_form_responses WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT content FROM organizer_data WHERE id=1').first()
  ]);
  if(!response||!planner)return respond({error:'Form integration not initialized'},503);
  const payload=JSON.parse(response.data),data=JSON.parse(planner.content);
  const guests=(Array.isArray(data.guests)?data.guests:[]).map(r=>r?.[0]).filter(v=>typeof v==='string'&&v.trim());
  const seen=new Map();
  for(const r of payload.records||[]){
   const k=norm(r.name);if(!k)continue;
   const exists=seen.get(k);
   if(!exists||r.sourceRow>exists.sourceRow)seen.set(k,r);
  }
  const matched=[],review=[],plusOneMatches=[];
  for(const r of seen.values()){
   const m=match(r.name,guests);
   const item={sourceRow:r.sourceRow,status:m.kind,guest:m.kind==='matched'?m.alias:null,matchMethod:m.kind==='matched'?m.method:null};
   if(m.kind==='matched')matched.push(item);else review.push(item);
   if(r.plusOne&&norm(r.plusOne)!==norm(r.name)){
    const plus=match(r.plusOne,guests);
    plusOneMatches.push({sourceRow:r.sourceRow,status:plus.kind,guest:plus.kind==='matched'?plus.alias:null});
   }
  }
  matched.sort((a,b)=>a.guest.localeCompare(b.guest));
  review.sort((a,b)=>a.sourceRow-b.sourceRow);
  return respond({source:'HALO FRIENDSGIVING FIELD DAY (Responses)',mode:payload.mode||'unknown',submitted:payload.records?.length||0,uniqueRespondents:seen.size,matchedCount:matched.length,needsReviewCount:review.length,plusOneMatchedCount:plusOneMatches.filter(x=>x.status==='matched').length,plusOneNeedsReviewCount:plusOneMatches.filter(x=>x.status!=='matched').length,matched,review,plusOneMatches,lastImportedAt:payload.lastImportedAt||null,revision:response.revision,publicVisibility:'not linked from public guest page',privacy:'Contacts and dietary notes are not copied into the site'});
 }catch{return respond({error:'Cannot load form matching status'},503)}
}
