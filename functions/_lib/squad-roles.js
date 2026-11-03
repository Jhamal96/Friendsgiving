// Private organizer roles. A named person defaults to "player"; any other
// role excludes them from public and private playing-team assignments.
import {firstName,nameKey} from './team-eligibility.js';

export const SQUAD_ROLE_LABELS=Object.freeze({
 player:'Playing',
 not_playing:'Not playing',
 referee:'Referee',
 assistant_referee:'Assistant referee',
 scorekeeper:'Scorekeeper',
 timekeeper:'Timekeeper',
 coach:'Coach',
 team_manager:'Team manager',
 announcer:'Announcer / MC',
 photographer:'Photographer',
 volunteer:'Event staff / volunteer',
 spectator:'Spectator',
 other:'Other position'
});
export const squadRoleKey=name=>nameKey(firstName(name));
export const readSquadRoles=raw=>{
 const result={};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return result;
 for(const [key,value] of Object.entries(raw)){
  if(key!==squadRoleKey(key)||!key||key.length>60)continue;
  const role=typeof value==='string'?value:value?.role;
  if(!Object.hasOwn(SQUAD_ROLE_LABELS,role)||role==='player')continue;
  const title=role==='other'&&typeof value?.title==='string'
   ?value.title.trim().replace(/[<>]/g,'').slice(0,60):'';
  if(role==='other'&&!title)continue;
  result[key]={role,...(title?{title}:{})};
 }
 return result;
};
export const isPlayingSquadMember=(name,roles)=>!readSquadRoles(roles)[squadRoleKey(name)];
