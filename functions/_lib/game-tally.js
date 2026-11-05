// Friendsgiving scoreboard source reconciliation. No guest or payment details
// are exposed to the tally page. Mission slots retain fixed IDs; Planner game
// rows match by title first, then by their previous slot on a rename.
export const emptyTally=()=>({games:[],scores:{}});
export const normGame=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
export function collectTallyGames(settings,organizer){
 const source=[];
 const text=Array.isArray(settings?.text)?settings.text:[];
 for(let slot=0;slot<4;slot++){
  const title=String(text[25+slot*2]||'').trim().slice(0,500);
  if(title)source.push({id:'mission:'+slot,source:'mission',slot,title});
 }
 for(let slot=0;slot<(organizer?.planning||[]).length;slot++){
  const row=organizer.planning[slot];
  if(!Array.isArray(row))continue;
  const title=String(row[0]||'').trim().slice(0,500);
  if(title)source.push({source:'planner',slot,title});
 }
 return source;
}
export function reconcileTallyGames(current,source){
 const history=Array.isArray(current?.games)?current.games.filter(x=>
  x&&typeof x.id==='string'&&typeof x.title==='string'&&
  ['mission','planner'].includes(x.source)&&Number.isInteger(x.slot)):[]; 
 const incoming=Array.isArray(source)?source:[];
 const used=new Set(),claimed=new Set(),active=[];
 // Preserve identity across Planner rearrangements; a game title is considered
 // unique within each source, not across Mission Control and Planner.
 for(const entry of incoming){
  let match=null;
  if(entry.source==='mission')match=history.find(x=>x.id===entry.id);
  else{
   const same=history.filter(x=>x.source==='planner'&&
    normGame(x.title)===normGame(entry.title)&&!used.has(x.id));
   if(same.length)match=same.find(x=>x.slot===entry.slot)||same[0];
  }
  if(match){used.add(match.id);claimed.add(entry.source+':'+entry.slot)}
  active.push({...entry,id:match?.id||entry.id||null});
 }
 // Match renamed Planner entries by their old row, but don't attach an
 // unrelated archived score if the old title was simply moved elsewhere.
 for(const entry of active){
  if(entry.id||entry.source!=='planner')continue;
  const prior=history.find(x=>x.source==='planner'&&x.slot===entry.slot&&
   !used.has(x.id)&&!active.some(now=>now.source==='planner'&&normGame(now.title)===normGame(x.title)));
  if(prior){entry.id=prior.id;used.add(prior.id)}
 }
 // A single renamed game can also move to a new row. When exactly one
 // unmatched current game and one unmatched former game remain, reuse the ID.
 const missing=active.filter(x=>x.source==='planner'&&!x.id);
 const past=history.filter(x=>x.source==='planner'&&!used.has(x.id)&&
   !active.some(now=>now.source==='planner'&&normGame(now.title)===normGame(x.title)));
 if(missing.length===1&&past.length===1){
  missing[0].id=past[0].id;
  used.add(past[0].id);
 }
 // Newly discovered games need a deterministic identity before the first
 // score is saved; otherwise a refresh would generate a different ID.
 const seenNew=new Map();
 for(const entry of active)if(!entry.id){
  const title=normGame(entry.title);
  let hash=2166136261;
  for(const char of title){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619)}
  const key=(hash>>>0).toString(36);
  const occurrence=seenNew.get(key)||0;seenNew.set(key,occurrence+1);
  entry.id='planner:'+key+(occurrence?'-'+occurrence:'');
 }
 const activeIds=new Set(active.map(x=>x.id));
 const archived=history.filter(x=>!activeIds.has(x.id));
 return {active,history:[...active,...archived]};
}
export function tallyScore(value){
 return Number.isInteger(value)&&value>=0&&value<=9999?value:null;
}
