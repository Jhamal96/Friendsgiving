(()=>{'use strict';
const $=id=>document.getElementById(id);
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
let data=null,busy=false,activeView='game',lastFetch=0;
const status=$('tallyStatus');
const gameType=game=>game.source==='mission'?'Mission Control':'Planner';
const allGames=()=>data?.games||[];
const allTeams=()=>data?.teams||[];
const score=(game,team)=>Number(game.scores?.[team.id]||0);
const total=team=>allGames().reduce((sum,g)=>sum+score(g,team),0);
const scoreLabel=game=>{
 const sorted=allTeams().map(team=>({team,value:score(game,team)})).sort((a,b)=>b.value-a.value);
 if(!sorted.length||sorted[0].value===0)return 'Not scored yet';
 const leaders=sorted.filter(x=>x.value===sorted[0].value);
 return leaders.length===1?'Leading: '+leaders[0].team.name:'Tied at '+sorted[0].value+' points';
};
const freshText=()=>{
 const time=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 $('syncStamp').textContent='Checked '+time;
};
function setStatus(text){status.textContent=text}
function showView(next){
 activeView=next;
 $('byGame').setAttribute('aria-selected',String(next==='game'));
 $('byTeam').setAttribute('aria-selected',String(next==='team'));
 $('gamesView').hidden=next!=='game';$('teamsView').hidden=next!=='team';
}
function renderSummary(){
 const root=$('leaderboard');root.replaceChildren();
 if(!data)return;
 const ranked=[...allTeams()].sort((a,b)=>total(b)-total(a)||a.name.localeCompare(b.name));
 const leaders=ranked.length?total(ranked[0]):0;
 for(const [i,team] of ranked.entries()){
  const box=el('article','stat');
  box.append(el('small','',i===0&&leaders>0?'★ Current leader':'Squad '+(i+1)));
  box.append(el('strong','',team.name));
  box.append(el('span','stat-detail',total(team)+' total '+(total(team)===1?'point':'points')));
  root.append(box);
 }
 const games=el('article','stat');
 games.append(el('small','','Active games'));
 games.append(el('strong','',String(allGames().length)));
 games.append(el('span','stat-detail','From Mission Control + Planner'));
 root.append(games);
}
function controls(game,team){
 const box=el('div','score-controls');
 const decrease=el('button','', '−');
 decrease.type='button';decrease.title='Remove one point from '+team.name+' in '+game.title;
 decrease.setAttribute('aria-label',decrease.title);
 const input=el('input');input.type='number';input.min='0';input.max='9999';
 input.step='1';input.value=String(score(game,team));
 input.setAttribute('aria-label',team.name+' points for '+game.title);
 const increase=el('button','', '+');
 increase.type='button';increase.title='Add one point to '+team.name+' in '+game.title;
 increase.setAttribute('aria-label',increase.title);
 const update=points=>saveScore(game.id,team.id,points);
 decrease.disabled=busy||score(game,team)===0;increase.disabled=busy||score(game,team)>=9999;input.disabled=busy;
 decrease.addEventListener('click',()=>update(Math.max(0,score(game,team)-1)));
 increase.addEventListener('click',()=>update(Math.min(9999,score(game,team)+1)));
 input.addEventListener('change',()=>{
  const value=Number(input.value);
  if(!Number.isInteger(value)||value<0||value>9999){input.value=String(score(game,team));setStatus('⚠ Enter a whole number from 0 to 9,999.');return}
  if(value!==score(game,team))update(value);
 });
 box.append(decrease,input,increase);return box;
}
function renderGameCard(game){
 const card=el('article','game-card');
 const head=el('div','game-card-head');
 head.append(el('span','card-source',gameType(game)));
 head.append(el('h3','',game.title));
 head.append(el('div','card-state',scoreLabel(game)));
 card.append(head);
 const list=el('div','score-list');
 for(const team of allTeams()){
  const row=el('div','score-row');
  row.append(el('strong','score-team',team.name),controls(game,team));
  list.append(row);
 }
 if(!allTeams().length)list.append(el('p','muted','Create teams in Team Assignments to begin scoring.'));
 card.append(list);return card;
}
function renderByGame(){
 const root=$('gamesContent');root.replaceChildren();
 if(!allGames().length){root.append(el('div','empty','No games found yet. Add games in Mission Control or the Planner.'));return}
 for(const source of ['mission','planner']){
  const subset=allGames().filter(game=>game.source===source);
  if(!subset.length)continue;
  const heading=el('div','source-heading');
  heading.append(el('h2','',source==='mission'?'Mission Control Games':'Planner Games & Relays'));
  heading.append(el('small','',subset.length+' '+(subset.length===1?'game':'games')));
  root.append(heading);
  const grid=el('div','game-grid');
  subset.forEach(game=>grid.append(renderGameCard(game)));
  root.append(grid);
 }
}
function renderTeamCard(team){
 const card=el('article','team-card');
 const head=el('div','team-card-head');
 head.append(el('span','card-source','Squad tally'));
 head.append(el('h3','',team.name));
 head.append(el('div','card-state','Total: '+total(team)+' points'));
 card.append(head);
 const list=el('div','score-list');
 for(const game of allGames()){
  const row=el('div','score-row');
  const info=el('div','');
  info.append(el('strong','score-team',game.title));
  info.append(el('div','card-source',gameType(game)));
  row.append(info,controls(game,team));list.append(row);
 }
 if(!allGames().length)list.append(el('p','muted','Add games in Mission Control or the Planner.'));
 card.append(list);return card;
}
function renderByTeam(){
 const root=$('teamsContent');root.replaceChildren();
 if(!allTeams().length){root.append(el('div','empty','No teams found. Create squads in Team Assignments.'));return}
 const heading=el('div','source-heading');
 heading.append(el('h2','','Score by Team'));
 heading.append(el('small','',allTeams().length+' squads'));
 root.append(heading);
 const grid=el('div','team-grid');allTeams().forEach(team=>grid.append(renderTeamCard(team)));root.append(grid);
}
function render(){
 if(!data)return;
 renderSummary();renderByGame();renderByTeam();
}
async function loadScores(manual=false){
 if(busy)return;
 // Preserve keyboard entry while an organizer is editing the number field.
 const focus=document.activeElement;
 if(!manual&&focus?.matches('.score-controls input'))return;
 try{
  const response=await fetch('/admin/api/tally',{cache:'no-store'});
  const next=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(next.error||'Cannot retrieve the latest scores.');
  if(!Array.isArray(next.games)||!Array.isArray(next.teams))throw Error('Incomplete scoreboard response.');
  const prior=data?JSON.stringify({games:data.games,teams:data.teams,revision:data.revision}):null;
  const fresh=JSON.stringify({games:next.games,teams:next.teams,revision:next.revision});
  data=next;lastFetch=Date.now();freshText();
  if(manual||prior!==fresh)render();
  if(manual||prior!==fresh)setStatus('✓ Live scores updated · '+next.games.length+' games · '+next.teams.length+' teams'+(!next.published?' · Using private team draft':''));
 }catch(e){setStatus('⚠ '+e.message)}
}
async function saveScore(gameId,teamId,points){
 if(!data||busy)return;
 const previous=data;
 busy=true;render();
 try{
  const response=await fetch('/admin/api/tally',{method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({gameId,teamId,points,revision:previous.revision})});
  const out=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(out.error||'Unable to save the score');
  const game=data.games.find(g=>g.id===gameId);
  if(game)game.scores[teamId]=points;
  data.revision=out.revision;
  setStatus('✓ Score saved to cloud');
 }catch(e){setStatus('⚠ '+e.message+' Refreshing the latest scores…');data=null}
 finally{busy=false;render();if(!data)await loadScores(true)}
}
$('byGame').addEventListener('click',()=>showView('game'));
$('byTeam').addEventListener('click',()=>showView('team'));
$('refreshScores').addEventListener('click',()=>loadScores(true));
$('printScores').addEventListener('click',()=>window.print());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadScores()});
setInterval(()=>{if(!document.hidden)loadScores()},15000);
showView('game');loadScores(true);
})();