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
 for(const entry of active)if(!entry.id)entry.id='planner:'+crypto.randomUUID();
 const activeIds=new Set(active.map(x=>x.id));
 const archived=history.filter(x=>!activeIds.has(x.id));
 return {active,history:[...active,...archived]};
}
export function tallyScore(value){
 return Number.isInteger(value)&&value>=0&&value<=9999?value:null;
}
