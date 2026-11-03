// One safe, consistent match projection for Guest List, Form responses, and teams.
// The organizer pages have no login, so do not send phone, email, allergy
// notes, or raw additional-plus-one free text.
import {formEligible,guestListEligible,firstName,nameKey} from '../../_lib/team-eligibility.js';
import {responseUpdateSnapshot} from '../../_lib/response-update-snapshot.js';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers});
export async function onRequestGet({env}){
 try{
  const [formRow,guestRow,syncRow,draftRow]=await Promise.all([
   env.FRIENDSGIVING_DB.prepare('SELECT data,revision FROM friendsgiving_form_responses WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT content FROM organizer_data WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT last_success_at,last_check_at,last_conflicts FROM sheet_sync_status WHERE id=1').first(),
   env.FRIENDSGIVING_DB.prepare('SELECT content FROM team_drafts WHERE id=1').first()
  ]);
  if(!formRow||!guestRow)return reply({error:'Form and guest sources are not initialized'},503);
  const form=JSON.parse(formRow.data),organizer=JSON.parse(guestRow.content);
  const eligibility=formEligible(organizer,form);
  const teamEligibility=guestListEligible(organizer,form);
  const qualifiedTeamNames=new Set(teamEligibility.eligible.map(p=>nameKey(firstName(p.name))));
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
  const paidByRowAndName=new Map(
   (eligibility.eligible||[]).filter(p=>p.method==='paid-companion').map(p=>[
    String(p.sourceRow)+'|'+nameKey(p.name),p.payment
   ])
  );
  const companionReviewByRowAndName=new Map(
   (eligibility.companionReview||[]).map(p=>[String(p.sourceRow)+'|'+nameKey(p.guest),p.reason])
  );
  const sponsorReviewByRow=new Map((eligibility.reviewRows||[]).map(r=>[r.sourceRow,r]));
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
    const paymentKey=String(record.sourceRow)+'|'+key;
    const paidThrough=paidByRowAndName.get(paymentKey)||null;
    const qualified=qualifiedTeamNames.has(nameKey(companion));
    const inviterReview=sponsorReviewByRow.get(record.sourceRow);
    const reviewCode=companionReviewByRowAndName.get(paymentKey)||
     (inviterReview?.reason==='no-match'||inviterReview?.reason==='ambiguous-name'
      ?'inviter-match-pending'
      :inviterReview?.reason==='payment-or-rsvp-pending'&&inviterReview.rsvpConfirmed===false
       ?'inviter-rsvp-pending':'companion-payment-pending');
    const issues={
     'companion-payment-pending':'Companion payment not confirmed',
     'duplicate-companion':'Duplicate first name; verify manually',
     'duplicate-payment':'Payment already linked to another companion',
     'ambiguous-payment':'More than one possible payment match',
     'ambiguous-sponsor':'More than one possible RSVP sponsor',
     'inviter-rsvp-pending':'Inviter has not confirmed RSVP',
     'inviter-match-pending':'Inviter must be matched to the Guest List'
    };
    plusOneMatches.push({
     sourceRow:record.sourceRow,
     status:qualified?'matched':'review',
     guest:companion,
     with:registered,
     paidThrough,
     reason:qualified
      ?'Eligible through their own paid and RSVP-confirmed Guest List entry'
      :'Their own Guest List entry must have both RSVP = Yes and Paid = Yes, without an asterisk (*)'
    });
   }
  }
  // A participant can be assigned in the public lineup or private draft.
  // Use only individual first-name lookups here; never return entire rosters.
  const isPublished=organizer.teamsPublished===true||(organizer.teamsPublished!==false&&Array.isArray(organizer.teams)&&organizer.teams.length>0);
  const teams=isPublished?organizer.teams||[]:draftRow?.content?JSON.parse(draftRow.content):[];
  const assigned=new Map();
  for(const team of teams){
   if(!team||typeof team.name!=='string')continue;
   for(const person of [team.captain,...(Array.isArray(team.members)?team.members:[])]){
    const key=nameKey(firstName(person));
    if(!key)continue;
    if(assigned.has(key)&&assigned.get(key)!==team.name)assigned.set(key,null);
    else if(!assigned.has(key))assigned.set(key,team.name);
   }
  }
  const captainNames=new Set((teams||[]).map(t=>nameKey(firstName(t.captain))).filter(Boolean));
  for(const entry of matched){
   const name=nameKey(firstName(entry.guest));
   entry.teamEligible=qualifiedTeamNames.has(name);
   entry.isCaptain=captainNames.has(name);
   entry.team=entry.teamEligible||entry.isCaptain?assigned.get(name)||null:null;
  }
  for(const entry of plusOneMatches){
   entry.teamEligible=qualifiedTeamNames.has(nameKey(entry.guest));
   entry.team=entry.teamEligible?assigned.get(nameKey(entry.guest))||null:null;
  }
  const changeSnapshot=await responseUpdateSnapshot({
   organizer,form,eligibility,teamEligibility,teams,isPublished
  });
  matched.sort((a,b)=>a.guest.localeCompare(b.guest));
  review.sort((a,b)=>(a.sourceRow||0)-(b.sourceRow||0));
  plusOneMatches.sort((a,b)=>a.with.localeCompare(b.with)||a.guest.localeCompare(b.guest));
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
   eligibleParticipantCount:teamEligibility.eligible.length,
   teamEligibilitySource:'Guest List (RSVP = Yes and Paid = Yes; * excluded)',
   matched,review,plusOneMatches,changeSnapshot,
   matchingReasons:eligibility.reasonCounts,
   matchingMethods:eligibility.matched.reduce((counts,m)=>{
    const key=m.method||'other';counts[key]=(counts[key]||0)+1;return counts;
   },{}),
   lastImportedAt:formLastSync,lastGuestSync:guestLastSync,
   formConnectionFresh:!stale(formLastSync),
   guestConnectionFresh:!stale(guestLastSync),
   syncConflicts:syncRow?.last_conflicts||0,
   isPublished,teamCount:(organizer.teams||[]).length,teamMode:isPublished?'published':'draft',
   revision:formRow.revision,
   privacy:'No contact information, payment amounts, dietary notes, or raw companion comments returned'
  });
 }catch{return reply({error:'Cannot check the connected forms and Guest List'},503)}
}
