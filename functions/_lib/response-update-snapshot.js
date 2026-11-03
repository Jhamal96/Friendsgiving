// Privacy-limited change detection for the admin Form Response Matching page.
// Content hashes ignore sync heartbeats; never send phone, email, payment amount,
// dietary notes, raw additional-plus-one comments, or full source snapshots.
import {firstName,nameKey,cleanName} from './team-eligibility.js';

const bytes=new TextEncoder();
async function digest(value){
 const data=bytes.encode(JSON.stringify(value));
 const sha=await crypto.subtle.digest('SHA-256',data);
 return Array.from(new Uint8Array(sha),n=>n.toString(16).padStart(2,'0')).join('');
}
const firstKey=value=>nameKey(firstName(value));
const yes=value=>['yes','paid','confirmed','attending','true','1'].includes(String(value||'').trim().toLowerCase());
const shortLabel=value=>{
 const parts=cleanName(value).split(' ').filter(Boolean);
 return firstName(value)+(parts.length>=2?' '+parts[parts.length-1][0].toUpperCase()+'.':'');
};
function assignmentLookup(teams){
 const assignments=new Map();
 for(const team of Array.isArray(teams)?teams:[]){
  if(!team||typeof team.name!=='string')continue;
  for(const name of [team.captain,...(Array.isArray(team.members)?team.members:[])]){
   const key=firstKey(name);
   if(!key)continue;
   if(assignments.has(key)&&assignments.get(key)!==team.name)assignments.set(key,null);
   else if(!assignments.has(key))assignments.set(key,team.name.trim());
  }
 }
 return assignments;
}
const displayAssignment=(lookup,name,isVerified)=>{
 if(!isVerified)return null;
 return lookup.get(firstKey(name))||null;
};
function companionsFor(record,eligible,lookup){
 const answer=String(record.plusOneYes||'').trim();
 const invited=answer?yes(answer):!!record.plusOne;
 if(!invited)return [];
 const names=[record.plusOne,...String(record.additionalPlusOne||'').split(/[\r\n]+/)];
 const seen=new Set(),result=[];
 for(const raw of names){
  const name=firstName(raw),key=firstKey(name);
  if(!key||key===firstKey(record.name)||seen.has(key)||key==='knickie'||key==='dannell')continue;
  seen.add(key);
  const qualified=eligible.some(p=>p.method==='paid-companion'&&p.sourceRow===record.sourceRow&&firstKey(p.name)===key);
  result.push({name,team:displayAssignment(lookup,name,qualified)});
 }
 return result;
}
export async function responseUpdateSnapshot({organizer,form,eligibility,teamEligibility,teams,isPublished}){
 const lookup=assignmentLookup(teams);
 const qualifiedTeams=new Set((teamEligibility?.eligible||[]).map(p=>firstKey(p.name)));
 const captainKeys=new Set((Array.isArray(teams)?teams:[]).map(t=>firstKey(t.captain)).filter(Boolean));
 const latest=new Map();
 for(const record of Array.isArray(form.records)?form.records:[]){
  const key=nameKey(record?.name);
  if(key)latest.set(key,record);
 }
 const records=[...latest.values()].sort((a,b)=>(a.sourceRow||0)-(b.sourceRow||0));
 const guests=organizer?.sheetSync?.status==='sheet_to_site_active'
  &&organizer?.sheetSync?.baseline&&typeof organizer.sheetSync.baseline==='object'
  ?Object.values(organizer.sheetSync.baseline)
  :organizer?.guests||[];
 const guestMap=new Map();
 for(const row of Array.isArray(guests)?guests:[]){
  if(!Array.isArray(row)||!nameKey(row[0]))continue;
  guestMap.set(nameKey(row[0]),row);
 }
 // Team placement is verified against the Guest List, not Form matching.
 // Starred captain names are a special locked exception for team leadership.
 const verifiedNames=new Set([...qualifiedTeams,...captainKeys]);
 const items=await Promise.all([
  ...records.map(async record=>{
   const name=shortLabel(record.name);
   const companions=companionsFor(record,teamEligibility?.eligible||[],lookup);
   const id='f'+(await digest(['form',nameKey(record.name)])).slice(0,24);
   const signature=(await digest([
    record.name,record.shirt,record.plusOneYes,record.plusOne,
    record.plusOneShirt,record.additionalPlusOne,record.children,record.athletic
   ])).slice(0,32);
   return {id,signature,source:'form',label:name||'Response row '+record.sourceRow,
    team:displayAssignment(lookup,record.name,verifiedNames.has(firstKey(record.name))),
    isPublished,companions,sourceRow:record.sourceRow};
  }),
  ...[...guestMap.values()].map(async row=>{
   const raw=String(row[0]||''),placeholder=/\+\s*1\s*$/i.test(raw);
   const id='g'+(await digest(['guest',nameKey(raw)])).slice(0,24);
   const signature=(await digest(row.map(v=>String(v??'').trim()))).slice(0,32);
   const key=nameKey(raw),first=firstKey(raw);
   const verified=!placeholder&&(verifiedNames.has(key)||verifiedNames.has(first));
   // A paid "+1" Guest List entry represents a named companion from the
   // sponsor's Form, not an independent participant on a team.
   const inviter=placeholder?records.find(r=>firstKey(r.name)===first):null;
   const companions=inviter?companionsFor(inviter,teamEligibility?.eligible||[],lookup):[];
   return {id,signature,source:'guest',
    label:placeholder?firstName(raw)+' +1 payment':shortLabel(raw),
    team:displayAssignment(lookup,raw,verified),
    isPublished,companions,paymentEntry:placeholder};
  })
 ]);
 items.sort((a,b)=>a.source.localeCompare(b.source)||a.label.localeCompare(b.label)||a.id.localeCompare(b.id));
 return {items,totals:{form:records.length,guest:guestMap.size},isPublished};
}
