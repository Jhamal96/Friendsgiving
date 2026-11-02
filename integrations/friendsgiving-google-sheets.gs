/**
 * Friendsgiving Google Sheets -> Cloudflare automatic sync.
 * Install this in Extensions > Apps Script for "Friendsgiving Day 2k26".
 * Script Properties must contain FRIENDSGIVING_SYNC_TOKEN.
 * Never paste the sync token into this source file or GitHub.
 */
const FG_SPREADSHEET_ID='15KhO9_BuCQrJXeTzr4hAyNrqDocAbZsObu_FsWAjGuk';
const FG_TAB='Guest List';
const FG_ENDPOINT='https://ajd-friendsgiving.pages.dev/api/sheets-sync';
function pushFriendsgiving(){
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(12000))return;
 try{
  const token=PropertiesService.getScriptProperties().getProperty('FRIENDSGIVING_SYNC_TOKEN');
  if(!token)throw new Error('Add FRIENDSGIVING_SYNC_TOKEN in Apps Script Project Settings > Script Properties before syncing.');
  const sheet=SpreadsheetApp.openById(FG_SPREADSHEET_ID).getSheetByName(FG_TAB);
  if(!sheet)throw new Error('Guest List tab not found.');
  const count=Math.max(sheet.getLastRow()-1,0);
  if(count<1)throw new Error('No guest entries. Refusing to synchronize an empty guest list.');
  const rows=sheet.getRange(2,1,Math.min(500,count),7).getDisplayValues().map(r=>r.map(v=>String(v||'').trim())).filter(r=>r[0]);
  if(!rows.length)throw new Error('No valid guest names found.');
  const reply=UrlFetchApp.fetch(FG_ENDPOINT,{
   method:'post',contentType:'application/json',
   headers:{'X-Friendsgiving-Sheet-Sync':token},
   payload:JSON.stringify({spreadsheetId:FG_SPREADSHEET_ID,tab:FG_TAB,rows}),
   muteHttpExceptions:true
  });
  const status=reply.getResponseCode(),body=reply.getContentText();
  if(status!==200)throw new Error('Friendsgiving sync rejected ('+status+'): '+body.slice(0,300));
  const result=JSON.parse(body);
  console.log('Friendsgiving synchronized: '+JSON.stringify(result));
  return result;
 }finally{lock.releaseLock()}
}
/** Run this once after entering the script property and granting Google permission. */
function installFriendsgivingSync(){
 const id=FG_SPREADSHEET_ID;
 const ss=SpreadsheetApp.openById(id);
 const old=ScriptApp.getProjectTriggers();
 for(const t of old){
  if(t.getHandlerFunction()==='pushFriendsgiving')ScriptApp.deleteTrigger(t);
 }
 ScriptApp.newTrigger('pushFriendsgiving').forSpreadsheet(ss).onEdit().create();
 ScriptApp.newTrigger('pushFriendsgiving').timeBased().everyMinutes(5).create();
 return pushFriendsgiving();
}
/** Optional: remove only this integration's triggers, leaving other triggers untouched. */
function stopFriendsgivingSync(){
 for(const t of ScriptApp.getProjectTriggers()){
  if(t.getHandlerFunction()==='pushFriendsgiving')ScriptApp.deleteTrigger(t);
 }
}
