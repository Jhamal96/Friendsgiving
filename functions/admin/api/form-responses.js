// One safe, consistent match projection for Guest List, Form responses, and teams.
// The organizer pages have no login, so do not send phone, email, allergy
// notes, or raw additional-plus-one free text.
import {formEligible,firstName,nameKey} from '../../_lib/team-eligibility.js';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers});
export async function onRequestGet({env}){
 try{
  const [formRow,guestRow,syncRow]=await Promise.all([
   env.FRIENDSGIVING_DB.prepare('SELECT data,revision FROM friendsgiving_form_responses WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT content FROM organizer_data WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT last_success_at,last_check_at,last_conflicts FROM sheet_sync_status WHERE id=1').first()
  ]);
  if(!formRow||!guestRow)return reply({error:'Form and guest sources are not initialized'},503);
  const form=JSON.parse(formRow.data),organizer=JSON.parse(guestRow.content);
  const eligibility=formEligible(organizer,form);
  const methodLabels={
   'exact':'Exact full name',
   'first-last':'First and surname (middle name ignored)',
   'unique-initial':'First name and last initial',
   'unique-first':'Unique first name'
  };
  const matched=eligibility.matched.map(m=>({
   sourceRow:m.sourceRow,status:'matched',guest:m.guest,
   matchMethod:methodLabels[m.method]||'Verified name match'
  }));
  const review=eligibility.reviewRows.map(r=>({
   sourceRow:r.sourceRow,status:r.reason,
   formHint:r.formHint||null,
   guest:r.guest||null,
   matchMethod:r.method?methodLabels[r.method]||null:null,
   suggestedGuests:Array.isArray(r.suggestions)?r.suggestions.slice(0,3):[],
   rsvpConfirmed:r.rsvpConfirmed===true,
   paidConfirmed:r.paidConfirmed===true
  }));
  // List the actual first names from the structured plus-one field and
  // the additional-plus-one field. Show non-qualifying entries as needing
  // review, rather than hiding their names behind "Response row" labels.
  // Never return raw companion comments, shirt sizes, contact details, etc.
  const latest=new Map();
  for(const record of Array.isArray(form.records)?form.records:[]){
   const key=nameKey(record?.name);
   if(key)latest.set(key,record);
  }
  const eligibleByRow=new Map((eligibility.groups||[]).map(g=>[
   g.sourceRow,new Set((g.companions||[]).map(nameKey))
  ]));
  const excluded=new Set(['knickie','dannell']);
  const plusOneMatches=[],listed=new Set();
  for(const record of latest.values()){
   const registered=firstName(record.name);
   const answer=String(record.plusOneYes||'').trim().toLowerCase();
   const hasCompanion=answer?['yes','true','1'].includes(answer):!!record.plusOne;
   if(!hasCompanion)continue;
   const names=[record.plusOne,...String(record.additionalPlusOne||'').split(String.fromCharCode(10))];
   for(const text of names){
    const companion=firstName(text),key=nameKey(companion);
    if(!key||key===nameKey(registered)||excluded.has(key))continue;
    const unique=String(record.sourceRow)+'|'+key;
    if(listed.has(unique))continue;
    listed.add(unique);
    const qualified=eligibleByRow.get(record.sourceRow)?.has(key)===true;
    plusOneMatches.push({
     sourceRow:record.sourceRow,
     status:qualified?'matched':'review',
     guest:companion,
     with:registered,
     reason:qualified?'Eligible with respondent':'Not team-eligible; check Guest List status or duplicate names'
    });
   }
  }
  matched.sort((a,b)=>a.guest.localeCompare(b.guest));
  review.sort((a,b)=>(a.sourceRow||0)-(b.sourceRow||0));
  plusOneMatches.sort((a,b)=>a.with.localeCompare(b.with)||a.guest.localeCompare(b.guest));
  const isPublished=organizer.teamsPublished===true||(organizer.teamsPublished!==false&&Array.isArray(organizer.teams)&&organizer.teams.length>0);
  const guestLastSync=syncRow?.last_success_at||null,formLastSync=form.lastImportedAt||null;
  const stale=t=>!t||!Number.isFinite(Date.parse(t))||Date.now()-Date.parse(t)>30*60*1000;
  return reply({
   source:'Halo Friendsgiving Form + Guest List',
   mode:form.mode||'unknown',
   submitted:Array.isArray(form.records)?form.records.length:0,
   uniqueRespondents:eligibility.sourceCount,
   matchedCount:matched.length,
   needsReviewCount:review.length,
   plusOneMatchedCount:plusOneMatches.filter(x=>x.status==='matched').length,
   plusOneNeedsReviewCount:plusOneMatches.filter(x=>x.status!=='matched').length,
   eligibleParticipantCount:eligibility.eligible.length,
   matched,review,plusOneMatches,
   matchingReasons:eligibility.reasonCounts,
   matchingMethods:eligibility.matched.reduce((counts,m)=>{
    const key=m.method||'other';counts[key]=(counts[key]||0)+1;return counts;
   },{}),
   lastImportedAt:formLastSync,lastGuestSync:guestLastSync,
   formConnectionFresh:!stale(formLastSync),
   guestConnectionFresh:!stale(guestLastSync),
   syncConflicts:syncRow?.last_conflicts||0,
   isPublished,teamCount:(organizer.teams||[]).length,
   revision:formRow.revision,
   privacy:'No contact information, payment amounts, dietary notes, or raw companion comments returned'
  });
 }catch{return reply({error:'Cannot check the connected forms and Guest List'},503)}
}
