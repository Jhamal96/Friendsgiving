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
  // The live spreadsheet has search cells and a heading above the actual
  // guest rows. Detect the header instead of assuming the list starts at row 2.
  const rowCount=sheet.getLastRow();
  if(rowCount<5)throw new Error('Guest List appears empty or incomplete.');
  const raw=sheet.getRange(1,1,Math.min(520,rowCount),7).getDisplayValues();
  const headerIndex=raw.findIndex(r=>
   String(r[0]||'').trim().toLowerCase()==='guests'&&
   String(r[2]||'').trim().toLowerCase()==='amount'&&
   String(r[4]||'').trim().toLowerCase()==='paid'
  );
  if(headerIndex<0)throw new Error('Guest List column headings were not found. Check the sheet structure.');
  const rows=raw.slice(headerIndex+1)
   .map(r=>r.map(v=>String(v||'').trim()))
   .filter(r=>r[0]&&!/^(?:total|total received):?$/i.test(r[0]));
  if(!rows.length||rows.length>500)throw new Error('Invalid guest count; refusing an incomplete sync.');
  const unique=new Set(rows.map(r=>r[0].toLocaleLowerCase('en-US')));
  if(unique.size!==rows.length)throw new Error('Duplicate guest names; please resolve them in the original Guest List.');
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
