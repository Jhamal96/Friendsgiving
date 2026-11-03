/**
 * Private Forms-response integration for Friendsgiving admin.
 * Install in the original HALO FRIENDSGIVING FIELD DAY 🏆 (Responses) spreadsheet.
 * Does NOT transmit emails, phone numbers, dietary/allergy notes, or other free text.
 */
const FIELD_DAY_SHEET='1JRPCoLs2pB44-WyiGvACL0nnDVeiyj_NrgHS8cYrluY';
const FIELD_DAY_TAB='Form Responses 1';
const FIELD_DAY_ENDPOINT='https://ajd-friendsgiving.pages.dev/api/form-sync';
function syncFieldDayResponses(){
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))return;
 try{
  const token=PropertiesService.getScriptProperties().getProperty('FIELD_DAY_SYNC_TOKEN');
  if(!token)throw new Error('Add FIELD_DAY_SYNC_TOKEN under Project Settings > Script Properties.');
  const sh=SpreadsheetApp.openById(FIELD_DAY_SHEET).getSheetByName(FIELD_DAY_TAB);
  if(!sh)throw new Error('Form Responses 1 not found');
  const count=sh.getLastRow()-1;
  if(count<1)throw new Error('No form submissions; refusing an empty synchronization.');
  const input=sh.getRange(2,1,Math.min(count,500),12).getDisplayValues();
  const records=[];
  input.forEach((r,index)=>{
   if(!r[1]||!r[1].trim())return;
   records.push({
    sourceRow:index+2,name:r[1].trim(),shirt:r[4].trim(),
    plusOneYes:r[5].trim(),plusOne:r[6].trim(),plusOneShirt:r[7].trim(),
    additionalPlusOne:r[8].trim(),
    children:r[9].trim(),athletic:r[11].trim()
   });
  });
  const response=UrlFetchApp.fetch(FIELD_DAY_ENDPOINT,{
   method:'post',contentType:'application/json',
   headers:{'X-Friendsgiving-Form-Sync':token},
   payload:JSON.stringify({spreadsheetId:FIELD_DAY_SHEET,tab:FIELD_DAY_TAB,records}),
   muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)throw new Error('Form response sync failed: HTTP '+response.getResponseCode()+' '+response.getContentText().slice(0,200));
  console.log('Synced to Friendsgiving admin: '+response.getContentText());
 }finally{lock.releaseLock()}
}
function installFieldDayResponseSync(){
 const ss=SpreadsheetApp.openById(FIELD_DAY_SHEET);
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncFieldDayResponses').forEach(t=>ScriptApp.deleteTrigger(t));
 ScriptApp.newTrigger('syncFieldDayResponses').forSpreadsheet(ss).onFormSubmit().create();
 ScriptApp.newTrigger('syncFieldDayResponses').timeBased().everyMinutes(5).create();
 syncFieldDayResponses();
}
function stopFieldDayResponseSync(){
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncFieldDayResponses').forEach(t=>ScriptApp.deleteTrigger(t));
}
