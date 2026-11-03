// One safe, consistent match projection for Guest List, Form responses, and teams.
// The organizer pages have no login, so do not send phone, email, allergy
// notes, or raw additional-plus-one free text.
import {formEligible} from '../../_lib/team-eligibility.js';
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
  const matched=eligibility.matched.map(m=>({
   sourceRow:m.sourceRow,status:'matched',guest:m.guest,matchMethod:
    m.method==='exact'?'Exact name':m.method==='unique-initial'?'First name and last initial':'Unique first name'
  }));
  const review=eligibility.reviewRows.map(r=>({sourceRow:r.sourceRow,status:r.reason}));
  const plusOneMatches=(eligibility.groups||[]).flatMap(g=>(g.companions||[]).map(name=>({
   sourceRow:g.sourceRow,status:'matched',guest:name
  })));
  matched.sort((a,b)=>a.guest.localeCompare(b.guest));
  review.sort((a,b)=>(a.sourceRow||0)-(b.sourceRow||0));
  plusOneMatches.sort((a,b)=>a.guest.localeCompare(b.guest));
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
   plusOneMatchedCount:plusOneMatches.length,
   plusOneNeedsReviewCount:0,
   eligibleParticipantCount:eligibility.eligible.length,
   matched,review,plusOneMatches,
   matchingReasons:eligibility.reasonCounts,
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
