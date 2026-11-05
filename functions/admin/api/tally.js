import {emptyTally,collectTallyGames,reconcileTallyGames,tallyScore} from '../../_lib/game-tally.js';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const hosts=new Set(['ajd-friendsgiving.pages.dev','friendsgiving.ajdapp.org']);
async function readData(env){
 const db=env.FRIENDSGIVING_DB;
 const results=await Promise.all([
  db.prepare('SELECT content,revision FROM organizer_data WHERE id=1').first(),
  db.prepare('SELECT content FROM site_settings WHERE id=1').first(),
  db.prepare('SELECT content FROM team_drafts WHERE id=1').first(),
  db.prepare('SELECT content,revision,updated_at FROM game_tallies WHERE id=1').first()
 ]);
 if(!results[0]||!results[1])throw Error('Guest planning or Mission Control unavailable');
 const organizer=JSON.parse(results[0].content),settings=JSON.parse(results[1].content);
 const draft=results[2]?.content?JSON.parse(results[2].content):[];
 const published=organizer.teamsPublished===true;
 const candidate=published?organizer.teams:Array.isArray(draft)?draft:draft.teams;
 const teams=(Array.isArray(candidate)?candidate:organizer.teams||[])
  .filter(t=>t&&typeof t.id==='string'&&typeof t.name==='string')
  .map(t=>({id:t.id,name:t.name.trim().slice(0,80),captain:String(t.captain||'').trim().slice(0,100)}))
  .filter(t=>t.name);
 const tally=results[3]?.content?JSON.parse(results[3].content):emptyTally();
 const {active,history}=reconcileTallyGames(tally,collectTallyGames(settings,organizer));
 const scores=tally.scores&&typeof tally.scores==='object'&&!Array.isArray(tally.scores)?tally.scores:{};
 return {teams,games:active,history,scores,revision:results[3]?.revision??0,
  updatedAt:results[3]?.updated_at??null,published};
}
export async function onRequestGet({request,env}){
 if(!hosts.has(new URL(request.url).hostname))return reply({error:'Invalid host'},403);
 try{
  const state=await readData(env);
  return reply({teams:state.teams,games:state.games.map(g=>({
   id:g.id,source:g.source,slot:g.slot,title:g.title,
   scores:Object.fromEntries(state.teams.map(t=>[t.id,tallyScore(state.scores[g.id]?.[t.id])??0]))
  })),revision:state.revision,updatedAt:state.updatedAt,published:state.published});
 }catch{return reply({error:'Game scoreboard could not be loaded'},503)}
}
export async function onRequestPost({request,env}){
 const url=new URL(request.url);
 if(!hosts.has(url.hostname)||request.headers.get('Origin')!==url.origin)return reply({error:'Invalid origin'},403);
 if(!String(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply({error:'JSON required'},415);
 try{
  const raw=await request.text();
  if(raw.length>2000)return reply({error:'Invalid request size'},413);
  const input=JSON.parse(raw);
  if(!Number.isSafeInteger(input.revision)||input.revision<0||
    typeof input.gameId!=='string'||input.gameId.length>100||
    typeof input.teamId!=='string'||input.teamId.length>100||
    tallyScore(input.points)===null)return reply({error:'Invalid score request'},400);
  const state=await readData(env);
  if(state.revision!==input.revision)return reply({error:'Scores were updated elsewhere. The latest scoreboard has been loaded; try again.'},409);
  if(!state.games.some(g=>g.id===input.gameId))return reply({error:'This game has changed or was removed. Refresh the list.'},409);
  if(!state.teams.some(t=>t.id===input.teamId))return reply({error:'This team is no longer active. Refresh teams.'},409);
  const scores={...state.scores,[input.gameId]:{...(state.scores[input.gameId]||{}),[input.teamId]:input.points}};
  // Writing a score also saves newly discovered game IDs/names. Archived games
  // remain in history, so restoring a game or team also restores its points.
  const content=JSON.stringify({games:state.history,scores});
  if(content.length>200000)return reply({error:'Scoreboard storage limit exceeded'},413);
  const db=env.FRIENDSGIVING_DB;
  const result=await db.prepare(
   'INSERT INTO game_tallies (id,content,revision,updated_at) VALUES (1,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET content=excluded.content,revision=game_tallies.revision+1,updated_at=CURRENT_TIMESTAMP WHERE game_tallies.revision=?'
  ).bind(content,state.revision).run();
  if(result.meta?.changes!==1)return reply({error:'Scoreboard changed elsewhere. Reload and retry.'},409);
  return reply({ok:true,revision:state.revision+1,gameId:input.gameId,teamId:input.teamId,points:input.points});
 }catch{return reply({error:'Could not save game score'},500)}
}
