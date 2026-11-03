// Friendsgiving team assignment. Only form respondents matched to the guest list
// with both paid and RSVP confirmed qualify. Companions are named "Yana +1".
export const cleanName=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z\s]/g,' ').replace(/\s+/g,' ').trim().slice(0,100);
export const nameKey=value=>{
 const s=String(value||'').trim(),plus=/\+\s*1\s*$/.test(s),base=plus?s.replace(/\+\s*1\s*$/,''):s;
 const text=cleanName(base).toLowerCase();
 return text+(plus&&text?' +1':'');
};
const yes=value=>['yes','paid','confirmed','attending','true','1'].includes(String(value||'').trim().toLowerCase());
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const words=s=>nameKey(s).split(' ').filter(Boolean);

export function formEligible(organizer,form){
 const paymentRows=(Array.isArray(organizer?.guests)?organizer.guests:[]).filter(r=>Array.isArray(r)&&nameKey(r[0]));
 // Last valid form submission for the same identity wins. Never use an
 // unverified plus-one's submitted full name as a standalone roster name.
 const responders=new Map();
 for(const r of Array.isArray(form?.records)?form.records:[]){
  const key=nameKey(r?.name);
  if(!key)continue;
  responders.set(key,{name:cleanName(r.name),key,plusOne:cleanName(r.plusOne),plusOneYes:r.plusOneYes});
 }
 const all=[...responders.values()];
 const firstFreq=new Map(),sheetFirst=new Map();
 for(const r of all){const first=words(r.name)[0];firstFreq.set(first,(firstFreq.get(first)||0)+1)}
 for(const r of paymentRows){const first=words(r[0])[0];sheetFirst.set(first,(sheetFirst.get(first)||0)+1)}
 const eligible=[],groups=[],review=[],usedSheet=new Set(),aliases=new Map(),usedNames=new Set();
 for(const person of all){
  const parts=words(person.name),first=parts[0],last=parts.at(-1),key=person.key;
  let hits=paymentRows.map((r,i)=>({r,i})).filter(x=>nameKey(x.r[0])===key);
  let method='exact';
  if(!hits.length&&parts.length>=2){
   hits=paymentRows.map((r,i)=>({r,i})).filter(x=>{
    const p=words(x.r[0]);return p.length>=2&&p[0]===first&&p.at(-1)[0]===last[0];
   });
   method='unique-initial';
  }
  if(!hits.length&&firstFreq.get(first)===1&&sheetFirst.get(first)===1){
   hits=paymentRows.map((r,i)=>({r,i})).filter(x=>{
    const p=words(x.r[0]);return p.length===1&&p[0]===first;
   });
   method='unique-first';
  }
  if(hits.length!==1||usedSheet.has(hits[0].i)){
   review.push({reason:hits.length>1?'ambiguous-name':hits.length===1?'duplicate-match':'no-match'});
   continue;
  }
  const hit=hits[0],row=hit.r;usedSheet.add(hit.i);
  if(!yes(row[3])||!yes(row[4])){review.push({reason:'payment-or-rsvp-pending'});continue}
  const player={name:person.name,alias:cleanName(row[0]),method};
  const pk=nameKey(player.name);
  if(usedNames.has(pk))continue;
  eligible.push(player);usedNames.add(pk);
  aliases.set(pk,pk);aliases.set(nameKey(row[0]),pk);
  let companion=null;
  // Legacy sync entries contain a named plusOne only when "Yes" was selected.
  const marked=person.plusOneYes===undefined||person.plusOneYes===null||person.plusOneYes===''?!!person.plusOne:yes(person.plusOneYes);
  if(marked&&person.plusOne&&nameKey(person.plusOne)!==pk){
   const firstBase=cleanName(row[0]).split(' ')[0]||player.name.split(' ')[0];
   const duplicateFirst=firstFreq.get(first)>1||sheetFirst.get(first)>1;
   const label=(duplicateFirst?player.name:firstBase)+' +1';
   const ck=nameKey(label);
   if(!usedNames.has(ck)){
    companion=label;usedNames.add(ck);
    eligible.push({name:companion,alias:companion,method:'form-plus-one',parent:pk});
    aliases.set(ck,ck);
   }else review.push({reason:'ambiguous-plus-one'});
  }
  groups.push({primary:player.name,plusOne:companion,alias:player.alias});
 }
 return {eligible,groups,aliases,reviewCount:review.length,reasonCounts:review.reduce((o,v)=>(o[v.reason]=(o[v.reason]||0)+1,o),{}),sourceCount:all.length};
}

export function balanceTeams(input,eligibility){
 if(!Array.isArray(input)||!input.length)return {teams:input||[],changed:false,assigned:0,removed:0,added:0,moved:0};
 const teams=input.map(t=>({...t,captain:cleanName(t.captain),members:Array.isArray(t.members)?[...t.members]:[]}));
 const captainOwner=new Map(),alias=eligibility.aliases;
 const canonical=s=>alias.get(nameKey(s))||nameKey(s);
 for(let i=0;i<teams.length;i++){
  const captain=canonical(teams[i].captain);
  if(!captain)continue;
  if(captainOwner.has(captain))return {teams:input,changed:false,error:'The same captain is assigned to multiple teams'};
  captainOwner.set(captain,i);
 }
 const current=new Map();
 let removed=0;
 for(let i=0;i<teams.length;i++)for(const member of teams[i].members){
  const key=canonical(member);
  if(!current.has(key))current.set(key,i);
 }
 const grouped=[];
 const used=new Set(),eligibleKeys=new Set(eligibility.eligible.map(p=>nameKey(p.name)));
 for(const g of eligibility.groups||[]){
  const primary=canonical(g.primary);
  if(!primary||used.has(primary))continue;
  const names=[g.primary,...(g.plusOne?[g.plusOne]:[])];
  if(names.some(n=>!eligibleKeys.has(nameKey(n))))continue;
  const k=names.map(canonical);
  if(k.some(v=>used.has(v)))continue;
  k.forEach(v=>used.add(v));
  grouped.push({names,k});
 }
 const claimed=new Set(),capKeys=new Set(captainOwner.keys());
 const buckets=teams.map(()=>[]);
 const sizes=teams.map(t=>canonical(t.captain)?1:0);
 // Existing placements take precedence, followed by least-filled teams.
 for(const group of grouped){
  let fixed=null;
  for(const key of group.k){
   if(!captainOwner.has(key))continue;
   if(fixed!==null&&captainOwner.get(key)!==fixed)return {teams:input,changed:false,error:'Companion cannot be a captain on an opposing team'};
   fixed=captainOwner.get(key);
  }
  const initial=fixed!==null?fixed:current.get(group.k[0])??current.get(group.k[1]);
  const dest=initial===undefined?sizes.indexOf(Math.min(...sizes)):initial;
  const members=group.names.filter((name,i)=>!capKeys.has(group.k[i])&&!claimed.has(group.k[i]));
  for(const name of members){buckets[dest].push(name)}
  group.k.forEach(k=>claimed.add(k));
  group.owner=dest;group.members=members;
  group.locked=fixed!==null;
  sizes[dest]+=members.length;
 }
 // Preserve paired companions while shifting only groups whose move improves balance.
 for(let pass=0;pass<grouped.length*2;pass++){
  const score=sizes.reduce((total,n)=>total+n*n,0);
  let candidate=null,best=score;
  for(const group of grouped){
   if(group.locked||!group.members.length)continue;
   for(let to=0;to<teams.length;to++){
    if(to===group.owner)continue;
    const weight=group.members.length;
    const next=score-sizes[group.owner]**2-sizes[to]**2+(sizes[group.owner]-weight)**2+(sizes[to]+weight)**2;
    if(next<best){candidate={group,to};best=next}
   }
  }
  if(!candidate)break;
  const {group,to}=candidate,from=group.owner;
  buckets[from]=buckets[from].filter(v=>!group.members.some(x=>nameKey(x)===nameKey(v)));
  buckets[to].push(...group.members);
  sizes[from]-=group.members.length;sizes[to]+=group.members.length;group.owner=to;
 }
 for(let i=0;i<teams.length;i++){teams[i].members=buckets[i]}
 const before=new Map();
 for(const [i,team] of input.entries())for(const name of team.members||[]){const k=canonical(name);if(!before.has(k))before.set(k,i)}
 let added=0,moved=0;
 for(const [i,team] of teams.entries())for(const name of team.members){
  const k=canonical(name);
  if(!before.has(k))added++;
  else if(before.get(k)!==i)moved++;
 }
 const now=new Set(teams.flatMap(t=>t.members.map(canonical)));
 for(const t of input)for(const name of t.members||[])if(!now.has(canonical(name)))removed++;
 return {teams,changed:!same(teams,input),assigned:claimed.size,removed,added,moved};
}

export async function reconcileTeams(db){
 for(let attempt=0;attempt<3;attempt++){
  const [orgRow,formRow,draftRow]=await Promise.all([
   db.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first(),
   db.prepare('SELECT data FROM friendsgiving_form_responses WHERE id=1').first(),
   db.prepare('SELECT content,revision FROM team_drafts WHERE id=1').first()
  ]);
  if(!orgRow||!formRow||!draftRow)return {ok:false,error:'Team sources are unavailable'};
  const organizer=JSON.parse(orgRow.content),form=JSON.parse(formRow.data);
  const eligibility=formEligible(organizer,form);
  const privateResult=balanceTeams(JSON.parse(draftRow.content),eligibility);
  // Unpublish is authoritative: background changes must never re-publish or
  // silently modify the hidden public lineup.
  const isPublished=organizer.teamsPublished===true || (organizer.teamsPublished!==false&&Array.isArray(organizer.teams)&&organizer.teams.length>0);
  const publicResult=isPublished?balanceTeams(Array.isArray(organizer.teams)?organizer.teams:[],eligibility):{teams:organizer.teams||[],changed:false};
  if(privateResult.error||publicResult.error)return {ok:false,error:privateResult.error||publicResult.error,eligible:eligibility.eligible.length};
  if(!privateResult.changed&&!publicResult.changed)return {ok:true,changed:false,eligible:eligibility.eligible.length,review:eligibility.reviewCount,privateResult,publicResult};
  if(privateResult.changed){
   const saved=await db.prepare('UPDATE team_drafts SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?')
    .bind(JSON.stringify(privateResult.teams),draftRow.revision).run();
   if(!saved.meta?.changes)continue;
  }
  if(publicResult.changed){
   const saved=await db.prepare('UPDATE organizer_data SET content=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?')
    .bind(JSON.stringify({...organizer,teams:publicResult.teams}),orgRow.revision).run();
   if(!saved.meta?.changes)continue;
  }
  return {ok:true,changed:true,eligible:eligibility.eligible.length,review:eligibility.reviewCount,privateResult,publicResult};
 }
 return {ok:false,error:'Team assignments changed in another tab; try again'};
}
