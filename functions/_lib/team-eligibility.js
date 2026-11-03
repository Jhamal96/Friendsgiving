// Paid RSVP form matching. Use first names in team rosters and actual first
// names of companions; never make up "+1" placeholders.
export const cleanName=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z\s]/g,' ').replace(/\s+/g,' ').trim().slice(0,100);
export const firstName=value=>{const w=cleanName(value).split(' ')[0]||'';return w?w.charAt(0).toUpperCase()+w.slice(1).toLowerCase():''};
export const nameKey=value=>cleanName(value).toLowerCase();
const firstKey=value=>nameKey(firstName(value));
const words=s=>nameKey(s).split(' ').filter(Boolean);
const yes=value=>['yes','paid','confirmed','attending','true','1'].includes(String(value||'').trim().toLowerCase());
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const excludedCompanions=new Set(['knickie','dannell']);

const nameTokens=value=>{
 const text=String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/['’`]/g,'').replace(/[^a-z]+/g,' ').replace(/\s+/g,' ').trim();
 const tokens=text?text.split(' '):[];
 while(tokens.length>2&&['jr','sr','ii','iii','iv'].includes(tokens[tokens.length-1]))tokens.pop();
 return tokens;
};
function nameShapes(value){
 const original=String(value||''),normal=nameTokens(original);
 const shapes=[normal];
 // "Surname, First Middle" is an explicit, common spreadsheet format.
 if(original.includes(',')){
  const [last,first]=original.split(',',2);
  const a=nameTokens(last),b=nameTokens(first);
  if(a.length===1&&b.length)shapes.push([...b,a[0]]);
 }
 return shapes.filter(x=>x.length);
}
function compareNameRank(formName,guestName,formFrequency,guestFrequency){
 const forms=nameShapes(formName),guests=nameShapes(guestName);
 for(const f of forms)for(const g of guests){
  if(f.length>=2&&g.length>=2&&f.join(' ')===g.join(' '))return {rank:0,method:'exact'};
 }
 for(const f of forms)for(const g of guests){
  if(f.length>=2&&g.length>=2&&f[0]===g[0]&&f.at(-1)===g.at(-1)&&f.at(-1).length>1){
   return {rank:1,method:'first-last'};
  }
 }
 for(const f of forms)for(const g of guests){
  if(f.length>=2&&g.length>=2&&f[0]===g[0]&&f.at(-1)[0]===g.at(-1)[0]&&(f.at(-1).length===1||g.at(-1).length===1)){
   return {rank:2,method:'unique-initial'};
  }
 }
 for(const f of forms)for(const g of guests){
  if(f[0]&&g.length===1&&f[0]===g[0]&&formFrequency.get(f[0])===1&&guestFrequency.get(g[0])===1){
   return {rank:3,method:'unique-first'};
  }
 }
 return null;
}
const distanceAtMostOne=(a,b)=>{
 if(Math.abs(a.length-b.length)>1)return false;
 if(a===b)return true;
 let i=0,j=0,edits=0;
 while(i<a.length&&j<b.length){
  if(a[i]===b[j]){i++;j++;continue}
  if(++edits>1)return false;
  if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++}
 }
 return edits+(a.length-i)+(b.length-j)<=1;
};
function reviewSuggestions(formName,guestRows){
 const f=nameTokens(formName),first=f[0],last=f.at(-1);
 const scored=[];
 if(!first)return [];
 for(const row of guestRows){
  const g=nameTokens(row[0]),name=cleanName(row[0]);
  if(!g.length)continue;
  const sameFirst=g[0]===first;
  const possibleTypo=f.length>=2&&g.length>=2&&distanceAtMostOne(g[0],first)&&g.at(-1)[0]===last?.[0];
  if(sameFirst||possibleTypo)scored.push({name,score:sameFirst?0:1});
 }
 return scored.sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name)).slice(0,3).map(x=>x.name);
}


// Each entry is a distinct name on the Google Form. Extra companions appear
// on separate lines, possibly followed by shirt-size notes or parentheses.
function extraCompanions(value){
 return String(value||'').split(/[\r\n]+/).map(v=>firstName(v)).filter(Boolean);
}
export function formEligible(organizer,form){
 // Legacy placeholder guest rows such as "Yana +1" are not separate verified primary people.
 // Keep local planner history, but only assign a person if their guest entry
 // still appears in the latest successfully synced Google Guest List.
 const baseline=organizer?.sheetSync?.status==='sheet_to_site_active'?organizer.sheetSync.baseline:null;
 const activeSource=baseline&&typeof baseline==='object'&&!Array.isArray(baseline)
  ?new Set(Object.keys(baseline).map(k=>String(k).trim().toLocaleLowerCase('en-US'))):null;
 const removedGuests=organizer?.removedGuests&&typeof organizer.removedGuests==='object'
  ?organizer.removedGuests:{};
 const activeRows=(Array.isArray(organizer?.guests)?organizer.guests:[]).filter(r=>{
  if(!Array.isArray(r)||!nameKey(r[0]))return false;
  const key=String(r[0]).trim().toLocaleLowerCase('en-US');
  if(Object.hasOwn(removedGuests,key))return false;
  return !activeSource||activeSource.has(key);
 });
 // An explicit "<inviter> +1" is payment for one companion, not an
 // independent main participant or an unlimited number of companions.
 const paymentRows=activeRows.filter(r=>!/\+\s*1(?:\s|$)/i.test(String(r[0])));
 const companionPaymentRows=activeRows.filter(r=>/\+\s*1\s*$/i.test(String(r[0])));
 const responders=new Map();
 for(const r of Array.isArray(form?.records)?form.records:[]){
  const key=nameKey(r?.name);
  if(!key)continue;
  responders.set(key,{name:cleanName(r.name),rawName:String(r.name||''),key,sourceRow:Number.isInteger(r.sourceRow)?r.sourceRow:null,plusOne:cleanName(r.plusOne),plusOneYes:r.plusOneYes,additionalPlusOne:r.additionalPlusOne||''});
 }
 const forms=[...responders.values()],formFirst=new Map(),sheetFirst=new Map();
 for(const person of forms){const first=nameTokens(person.rawName)[0];if(first)formFirst.set(first,(formFirst.get(first)||0)+1)}
 for(const row of paymentRows){const first=nameTokens(row[0])[0];if(first)sheetFirst.set(first,(sheetFirst.get(first)||0)+1)}
 const review=[],usedSheet=new Set(),matched=[],sponsors=[],seenFirst=new Set();
 const plan=forms.map(person=>{
  const candidates=paymentRows.map((row,index)=>{
   const quality=compareNameRank(person.rawName,row[0],formFirst,sheetFirst);
   return quality?{index,row,...quality}:null;
  }).filter(Boolean);
  const rank=candidates.length?Math.min(...candidates.map(c=>c.rank)):null;
  const best=rank===null?[]:candidates.filter(c=>c.rank===rank);
  const tokens=nameTokens(person.rawName),first=tokens[0],last=tokens.at(-1);
  const competingInitials=rank===2?paymentRows.filter(row=>{
   const parts=nameTokens(row[0]);
   return parts.length>=2&&parts[0]===first&&parts.at(-1)[0]===last?.[0];
  }):[];
  const ambiguousInitial=rank===2&&competingInitials.length>1;
  return {person,rank,best,ambiguousInitial,competingInitials};
 });
 // Full-name matches take priority over initials and unique first names.
 for(let priority=0;priority<=3;priority++){
  const eligible=plan.filter(p=>p.rank===priority&&!p.ambiguousInitial&&p.best.length===1&&!usedSheet.has(p.best[0].index));
  const collisions=new Map();
  for(const p of eligible)collisions.set(p.best[0].index,(collisions.get(p.best[0].index)||0)+1);
  for(const p of eligible){
   const hit=p.best[0];
   if(collisions.get(hit.index)!==1)continue;
   p.claimed=hit;usedSheet.add(hit.index);
  }
 }
 for(const p of plan){
  const person=p.person,hit=p.claimed,bits=nameTokens(person.rawName);
  const formHint=firstName(person.name)+(bits.length>=2?' '+bits.at(-1)[0].toUpperCase()+'.':'');
  const common={sourceRow:person.sourceRow,formHint};
  if(!hit){
   const reason=p.ambiguousInitial||p.best.length>1?'ambiguous-name':
    p.best.length===1&&usedSheet.has(p.best[0].index)?'duplicate-match':
    p.best.length===1?'ambiguous-name':'no-match';
   const suggestions=p.ambiguousInitial?p.competingInitials.slice(0,3).map(x=>cleanName(x[0])):
    p.best.length?p.best.slice(0,3).map(x=>cleanName(x.row[0])):reviewSuggestions(person.rawName,paymentRows);
   review.push({...common,reason,suggestions});
   continue;
  }
  const row=hit.row,first=nameTokens(person.name)[0];
  const personInfo={
   first:firstName(person.name),formName:person.name,sheetName:cleanName(row[0]),
   method:hit.method,sourceRow:person.sourceRow,person,
   rsvpConfirmed:yes(row[3]),paidConfirmed:yes(row[4])
  };
  if(personInfo.rsvpConfirmed)sponsors.push(personInfo);
  if(!personInfo.rsvpConfirmed||!personInfo.paidConfirmed){
   review.push({...common,reason:'payment-or-rsvp-pending',guest:cleanName(row[0]),
    method:hit.method,rsvpConfirmed:personInfo.rsvpConfirmed,paidConfirmed:personInfo.paidConfirmed});
   continue;
  }
  if(seenFirst.has(first)){
   review.push({...common,reason:'duplicate-first-name',guest:cleanName(row[0]),method:hit.method});
   continue;
  }
  seenFirst.add(first);
  matched.push(personInfo);
 }
 // All primary participants have passed BOTH payment and RSVP checks.
 // Independently paid companions need a sponsor whose Guest List RSVP is Yes,
 // and an explicit Yes answer that includes their name on that Form.
 const primaryNames=new Set(matched.map(m=>firstKey(m.first)));
 const used=new Set(primaryNames),aliases=new Map(),eligible=[],groups=[],companionReview=[];
 for(const p of matched){
  const id=firstKey(p.first);
  aliases.set(nameKey(p.formName),id);
  aliases.set(nameKey(p.sheetName),id);
  aliases.set(id,id);
  eligible.push({name:p.first,alias:p.sheetName,method:p.method});
 }
 const sponsorCount=new Map();
 for(const p of sponsors)sponsorCount.set(firstKey(p.first),(sponsorCount.get(firstKey(p.first))||0)+1);
 const allNamedCompanions=[];
 for(const p of sponsors){
  const person=p.person;
  const rsvpMarked=typeof person.plusOneYes==='string'&&person.plusOneYes.trim()
   ?yes(person.plusOneYes):!!person.plusOne;
  if(!rsvpMarked)continue;
  const names=[person.plusOne,...String(person.additionalPlusOne||'').split(/[\r\n]+/)];
  const local=new Set();
  for(const raw of names){
   const name=firstName(raw),key=firstKey(name);
   if(!key||key===firstKey(p.first)||excludedCompanions.has(key)||local.has(key))continue;
   local.add(key);
   allNamedCompanions.push({owner:p,name,key,rawName:cleanName(raw)});
  }
 }
 const companionFrequency=new Map();
 for(const c of allNamedCompanions)companionFrequency.set(c.key,(companionFrequency.get(c.key)||0)+1);
 const companionGuestFrequency=new Map();
 for(const r of paymentRows){
  const key=firstKey(r[0]);
  companionGuestFrequency.set(key,(companionGuestFrequency.get(key)||0)+1);
 }
 const consumedPayment=new Set(),consumedPlus=new Set();
 const confirmedCompanions=new Map();
 // 1. A named Guest List row is authoritative. An unpaid named row cannot
 //    be overridden by an unrelated "<inviter> +1" payment.
 // 2. Only one named companion can consume each paid "<inviter> +1" row.
 // 3. Repeated first names, competing matches, and uncertain sponsor links
 //    are held for review, never assigned to the wrong player.
 for(const c of allNamedCompanions){
  const p=c.owner,key=c.key,ownerKey=firstKey(p.first);
  const common={sourceRow:p.sourceRow,guest:c.name,with:p.first};
  if(sponsorCount.get(ownerKey)!==1){
   companionReview.push({...common,reason:'ambiguous-sponsor'});
   continue;
  }
  if(companionFrequency.get(key)>1||used.has(key)){
   companionReview.push({...common,reason:'duplicate-companion'});
   continue;
  }
  const direct=paymentRows.map((row,index)=>({row,index})).filter(x=>{
   if(firstKey(x.row[0])!==key)return false;
   const raw=c.rawName,source=x.row[0];
   if(nameKey(raw)===nameKey(source))return true;
   const a=nameTokens(raw),b=nameTokens(source);
   if(a.length>=2&&b.length>=2&&a[0]===b[0]&&a.at(-1)[0]===b.at(-1)[0]&&
      (a.at(-1)===b.at(-1)||a.at(-1).length===1||b.at(-1).length===1))return true;
   return companionGuestFrequency.get(key)===1&&companionFrequency.get(key)===1;
  });
  if(direct.length>1){
   companionReview.push({...common,reason:'ambiguous-payment'});
   continue;
  }
  let payment=null;
  if(direct.length===1){
   if(!yes(direct[0].row[4])){
    companionReview.push({...common,reason:'companion-payment-pending'});
    continue;
   }
   if(consumedPayment.has(direct[0].index)){
    companionReview.push({...common,reason:'duplicate-payment'});
    continue;
   }
   consumedPayment.add(direct[0].index);
   payment='individual-guest';
  }else{
   const ownerAliases=new Set([nameKey(p.sheetName),firstKey(p.sheetName),nameKey(p.formName),firstKey(p.formName)]);
   const pooled=companionPaymentRows.map((row,index)=>({row,index})).filter(x=>{
    const holder=nameKey(String(x.row[0]).replace(/\+\s*1\s*$/i,''));
    return ownerAliases.has(holder);
   });
   if(pooled.length!==1){
    companionReview.push({...common,reason:pooled.length>1?'ambiguous-payment':'companion-payment-pending'});
    continue;
   }
   if(!yes(pooled[0].row[4])||consumedPlus.has(pooled[0].index)){
    companionReview.push({...common,reason:'companion-payment-pending'});
    continue;
   }
   consumedPlus.add(pooled[0].index);
   payment='inviter-plus-one';
  }
  used.add(key);
  eligible.push({name:c.name,alias:c.name,method:'paid-companion',parent:ownerKey,payment,sourceRow:p.sourceRow});
  aliases.set(key,key);
  const items=confirmedCompanions.get(p.sourceRow)||[];
  items.push(c.name);confirmedCompanions.set(p.sourceRow,items);
 }
 // A sponsor may be RSVP-confirmed but not have paid for themselves. Their
 // PAID companion remains eligible, without adding an unpaid sponsor.
 for(const p of sponsors){
  const names=confirmedCompanions.get(p.sourceRow)||[];
  if(!names.length&&!primaryNames.has(firstKey(p.first)))continue;
  groups.push({primary:p.first,alias:p.sheetName,sourceRow:p.sourceRow,companions:names});
 }
 return {
  eligible,groups,aliases,
  matched:matched.map(m=>({sourceRow:m.sourceRow,guest:m.sheetName,first:m.first,method:m.method})),
  reviewRows:review,reviewCount:review.length,
  reasonCounts:review.reduce((o,v)=>(o[v.reason]=(o[v.reason]||0)+1,o),{}),
  companionReview,companionReviewCount:companionReview.length,
  sourceCount:forms.length
 };
}

export function balanceTeams(input,eligibility,squadRoles={}){
 if(!Array.isArray(input)||!input.length)return {teams:input||[],changed:false,assigned:0,removed:0,added:0,moved:0};
 const teams=input.map(t=>({...t,captain:firstName(t.captain),members:Array.isArray(t.members)?[...t.members]:[]}));
 const alias=eligibility.aliases;
 const canonical=s=>alias.get(nameKey(s))||firstKey(s);
 const captainOwner=new Map();
 for(let i=0;i<teams.length;i++){
  const key=canonical(teams[i].captain);
  if(!key)continue;
  if(captainOwner.has(key))return {teams:input,changed:false,error:'The same captain is assigned to multiple teams'};
  captainOwner.set(key,i);
 }
 const before=new Map();
 for(let i=0;i<teams.length;i++)for(const member of teams[i].members){const k=canonical(member);if(!before.has(k))before.set(k,i)}
 // Every verified guest AND every individually paid/confirmed plus-one is
 // one independent player in team randomization. Their shared registration
 // determines eligibility, not which team they must be on.
 const excludedRoles=squadRoles&&typeof squadRoles==='object'?squadRoles:{};
 const playing=p=>!Object.hasOwn(excludedRoles,firstKey(p.name));
 const allowed=new Set(eligibility.eligible.filter(playing).map(p=>canonical(p.name)));
 const groups=[],used=new Set();
 for(const person of eligibility.eligible||[]){
  if(!playing(person))continue;
  const key=canonical(person.name);
  if(!key||!allowed.has(key)||used.has(key))continue;
  used.add(key);
  if(captainOwner.has(key))continue; // Captains are reserved on their own teams.
  groups.push({names:[person.name],keys:[key],sponsorCaptain:null});
 }

 const claimed=new Set(),buckets=teams.map(()=>[]),sizes=teams.map(t=>canonical(t.captain)?1:0);
 for(const group of groups){
  let fixed=group.sponsorCaptain??null;
  for(const key of group.keys){
   if(!captainOwner.has(key))continue;
   const owner=captainOwner.get(key);
   if(fixed!==null&&owner!==fixed)return {teams:input,changed:false,error:'A captain cannot be assigned to an opposing team'};
   fixed=owner;
  }
  const initial=fixed!==null?fixed:group.keys.map(k=>before.get(k)).find(v=>v!==undefined);
  const dest=initial===undefined?sizes.indexOf(Math.min(...sizes)):initial;
  group.members=group.names.filter((n,i)=>!captainOwner.has(group.keys[i])&&!claimed.has(group.keys[i]));
  buckets[dest].push(...group.members);
  group.keys.forEach(k=>claimed.add(k));
  group.owner=dest;group.locked=fixed!==null;
  sizes[dest]+=group.members.length;
 }
 // Move the minimum number of groups necessary to reduce imbalance.
 for(let pass=0;pass<groups.length*2;pass++){
  let best=null,score=sizes.reduce((v,n)=>v+n*n,0);
  for(const group of groups){
   if(group.locked||!group.members.length)continue;
   for(let to=0;to<teams.length;to++){
    if(to===group.owner)continue;
    const weight=group.members.length,from=group.owner;
    const next=score-sizes[from]**2-sizes[to]**2+(sizes[from]-weight)**2+(sizes[to]+weight)**2;
    if(next<score){score=next;best={group,to}}
   }
  }
  if(!best)break;
  const {group,to}=best,from=group.owner;
  buckets[from]=buckets[from].filter(m=>!group.members.some(x=>canonical(x)===canonical(m)));
  buckets[to].push(...group.members);
  sizes[from]-=group.members.length;sizes[to]+=group.members.length;group.owner=to;
 }
 // Keep the existing team-member display order when reconciliation has
 // nothing to change. Explicit randomization produces a new saved order.
 teams.forEach((t,i)=>{
  const positions=new Map(t.members.map((name,index)=>[canonical(name),index]));
  buckets[i].sort((a,b)=>{
   const left=positions.get(canonical(a)),right=positions.get(canonical(b));
   return (left===undefined?Infinity:left)-(right===undefined?Infinity:right);
  });
  t.members=buckets[i];
 });
 const now=new Set(teams.flatMap(t=>t.members.map(canonical)));
 let added=0,moved=0,removed=0;
 teams.forEach((t,i)=>t.members.forEach(n=>{const k=canonical(n);if(!before.has(k))added++;else if(before.get(k)!==i)moved++}));
 for(const t of input)for(const n of t.members||[])if(!now.has(canonical(n)))removed++;
 return {teams,changed:!same(teams,input),assigned:claimed.size,removed,added,moved};
}

export async function reconcileTeams(db){
 for(let attempt=0;attempt<3;attempt++){
  const [orgRow,formRow,draftRow]=await Promise.all([
   db.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first(),
   db.prepare('SELECT data FROM friendsgiving_form_responses WHERE id=1').first(),
   db.prepare('SELECT content,revision FROM team_drafts WHERE id=1').first()
  ]);
  if(!orgRow||!formRow||!draftRow)return {ok:false,error:'Team sources unavailable'};
  const organizer=JSON.parse(orgRow.content),form=JSON.parse(formRow.data);
  const eligibility=formEligible(organizer,form);
  const roles=organizer.squadRoles||{};
  const privateResult=balanceTeams(JSON.parse(draftRow.content),eligibility,roles);
  const isPublished=organizer.teamsPublished===true||(organizer.teamsPublished!==false&&Array.isArray(organizer.teams)&&organizer.teams.length>0);
  const publicResult=isPublished?balanceTeams(Array.isArray(organizer.teams)?organizer.teams:[],eligibility,roles):{teams:organizer.teams||[],changed:false};
  if(privateResult.error||publicResult.error)return {ok:false,error:privateResult.error||publicResult.error,eligible:eligibility.eligible.length};
  if(!privateResult.changed&&!publicResult.changed)return {ok:true,changed:false,eligible:eligibility.eligible.length,review:eligibility.reviewCount,privateResult,publicResult};
  if(privateResult.changed){
   const r=await db.prepare('UPDATE team_drafts SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(privateResult.teams),draftRow.revision).run();
   if(!r.meta?.changes)continue;
  }
  if(publicResult.changed){
   const r=await db.prepare('UPDATE organizer_data SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify({...organizer,teams:publicResult.teams}),orgRow.revision).run();
   if(!r.meta?.changes)continue;
  }
  return {ok:true,changed:true,eligible:eligibility.eligible.length,review:eligibility.reviewCount,privateResult,publicResult};
 }
 return {ok:false,error:'Team assignments changed elsewhere; retry'};
}
