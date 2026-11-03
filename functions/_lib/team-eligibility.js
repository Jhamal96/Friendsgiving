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
 const paymentRows=(Array.isArray(organizer?.guests)?organizer.guests:[]).filter(r=>{
  if(!Array.isArray(r)||!nameKey(r[0])||/\+\s*1(?:\s|$)/i.test(String(r[0])))return false;
  return !activeSource||activeSource.has(String(r[0]).trim().toLocaleLowerCase('en-US'));
 });
 const responders=new Map();
 for(const r of Array.isArray(form?.records)?form.records:[]){
  const key=nameKey(r?.name);
  if(!key)continue;
  responders.set(key,{name:cleanName(r.name),rawName:String(r.name||''),key,sourceRow:Number.isInteger(r.sourceRow)?r.sourceRow:null,plusOne:cleanName(r.plusOne),plusOneYes:r.plusOneYes,additionalPlusOne:r.additionalPlusOne||''});
 }
 const forms=[...responders.values()],formFirst=new Map(),sheetFirst=new Map();
 for(const person of forms){const first=nameTokens(person.rawName)[0];if(first)formFirst.set(first,(formFirst.get(first)||0)+1)}
 for(const row of paymentRows){const first=nameTokens(row[0])[0];if(first)sheetFirst.set(first,(sheetFirst.get(first)||0)+1)}
 const review=[],usedSheet=new Set(),matched=[],seenFirst=new Set();
 const plan=forms.map(person=>{
  const candidates=paymentRows.map((row,index)=>{
   const quality=compareNameRank(person.rawName,row[0],formFirst,sheetFirst);
   return quality?{index,row,...quality}:null;
  }).filter(Boolean);
  const rank=candidates.length?Math.min(...candidates.map(c=>c.rank)):null;
  const best=rank===null?[]:candidates.filter(c=>c.rank===rank);
  // "Chris N" is not unique if the Guest List also has "Chris Noel".
  // Do not automatically match an initial when another guest has the same
  // first name and surname initial, even if their surname is fully written.
  const tokens=nameTokens(person.rawName),first=tokens[0],last=tokens.at(-1);
  const competingInitials=rank===2?paymentRows.filter(row=>{
   const parts=nameTokens(row[0]);
   return parts.length>=2&&parts[0]===first&&parts.at(-1)[0]===last?.[0];
  }):[];
  const ambiguousInitial=rank===2&&competingInitials.length>1;
  return {person,rank,best,ambiguousInitial,competingInitials};
 });
 // Strong full-name matches win before surname-initial and unique-first fallback.
 // A guest may only be claimed by one response. Never infer fuzzy matches.
 for(let priority=0;priority<=3;priority++){
  const eligible=plan.filter(p=>p.rank===priority&&!p.ambiguousInitial&&p.best.length===1&&!usedSheet.has(p.best[0].index));
  const collisions=new Map();
  for(const p of eligible){
   const index=p.best[0].index;
   collisions.set(index,(collisions.get(index)||0)+1);
  }
  for(const p of eligible){
   const hit=p.best[0];
   if(collisions.get(hit.index)!==1)continue;
   p.claimed=hit;
   usedSheet.add(hit.index);
  }
 }
 for(const p of plan){
  const person=p.person,hit=p.claimed;
  const common={sourceRow:person.sourceRow};
  if(!hit){
   const reason=p.ambiguousInitial||p.best.length>1?'ambiguous-name':
    p.best.length===1&&usedSheet.has(p.best[0].index)?'duplicate-match':
    p.best.length===1?'ambiguous-name':'no-match';
   const suggestions=p.ambiguousInitial?p.competingInitials.slice(0,3).map(x=>cleanName(x[0])):
    p.best.length?p.best.slice(0,3).map(x=>cleanName(x.row[0])):reviewSuggestions(person.rawName,paymentRows);
   review.push({...common,reason,suggestions});
   continue;
  }
  const row=hit.row;
  if(!yes(row[3])||!yes(row[4])){
   review.push({...common,reason:'payment-or-rsvp-pending',guest:cleanName(row[0]),method:hit.method,rsvpConfirmed:yes(row[3]),paidConfirmed:yes(row[4])});
   continue;
  }
  const first=nameTokens(person.name)[0];
  if(seenFirst.has(first)){
   review.push({...common,reason:'duplicate-first-name',guest:cleanName(row[0]),method:hit.method});
   continue;
  }
  seenFirst.add(first);
  matched.push({first:firstName(person.name),formName:person.name,sheetName:cleanName(row[0]),method:hit.method,sourceRow:person.sourceRow,person});
 }
 // Primary first names take priority over companion names, and each name
 // can appear on at most one team. Preserve full-name aliases for lookups.
 const primaryNames=new Set(matched.map(m=>firstKey(m.first)));
 const used=new Set(primaryNames),aliases=new Map(),eligible=[],groups=[];
 for(const p of matched){
  const id=firstKey(p.first);
  aliases.set(nameKey(p.formName),id);
  aliases.set(nameKey(p.sheetName),id);
  aliases.set(id,id);
  eligible.push({name:p.first,alias:p.sheetName,method:p.method});
 }
 for(const p of matched){
  const person=p.person,companions=[];
  const marked=typeof person.plusOneYes==='string'&&person.plusOneYes.trim()?yes(person.plusOneYes):!!person.plusOne;
  if(marked){
   const extras=[person.plusOne,...extraCompanions(person.additionalPlusOne)];
   for(const raw of extras){
    const name=firstName(raw),k=firstKey(name);
    if(!k||k===firstKey(p.first)||excludedCompanions.has(k)||used.has(k))continue;
    used.add(k);companions.push(name);
    eligible.push({name,alias:name,method:'named-companion',parent:firstKey(p.first)});
    aliases.set(nameKey(raw),k);aliases.set(k,k);
   }
  }
  groups.push({primary:p.first,alias:p.sheetName,sourceRow:p.sourceRow,companions});
 }
 return {eligible,groups,aliases,matched:matched.map(m=>({sourceRow:m.sourceRow,guest:m.sheetName,first:m.first,method:m.method})),reviewRows:review,reviewCount:review.length,reasonCounts:review.reduce((o,v)=>(o[v.reason]=(o[v.reason]||0)+1,o),{}),sourceCount:forms.length};
}

export function balanceTeams(input,eligibility){
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
 const allowed=new Set(eligibility.eligible.map(p=>canonical(p.name)));
 const groups=[],used=new Set();
 for(const g of eligibility.groups||[]){
  const base=Array.isArray(g.companions)?g.companions:g.plusOne?[g.plusOne]:[];
  const people=[g.primary];
  let homeCaptain=captainOwner.get(canonical(g.primary));
  // A respondent may list a second captain as a companion. Each captain
  // remains captain of their own team, never an opposing team's member.
  for(const companion of base){
   const owner=captainOwner.get(canonical(companion));
   if(owner!==undefined&&homeCaptain!==undefined&&owner!==homeCaptain)continue;
   if(owner!==undefined)homeCaptain=owner;
   people.push(companion);
  }
  const ids=people.map(canonical),primary=ids[0];
  if(!primary||used.has(primary)||ids.some(k=>!allowed.has(k)||used.has(k)))continue;
  ids.forEach(k=>used.add(k));
  groups.push({names:people,keys:ids});
 }
 const claimed=new Set(),buckets=teams.map(()=>[]),sizes=teams.map(t=>canonical(t.captain)?1:0);
 for(const group of groups){
  let fixed=null;
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
 teams.forEach((t,i)=>{t.members=buckets[i]});
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
  const privateResult=balanceTeams(JSON.parse(draftRow.content),eligibility);
  const isPublished=organizer.teamsPublished===true||(organizer.teamsPublished!==false&&Array.isArray(organizer.teams)&&organizer.teams.length>0);
  const publicResult=isPublished?balanceTeams(Array.isArray(organizer.teams)?organizer.teams:[],eligibility):{teams:organizer.teams||[],changed:false};
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
