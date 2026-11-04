(()=>{'use strict';
const defs=[{name:'Games',cols:[0],labels:['Game or relay']},{name:'Drinks & supplies',cols:[1],labels:['Item']},{name:'Appetizers',cols:[2],labels:['Item']},{name:'Main course',cols:[3],labels:['Item']},{name:'Schedule',cols:[4,5],labels:['Activity','Time']},{name:'Groceries',cols:[6,7],labels:['Item','Price']},{name:'Notes',cols:[8],labels:['Note']}],guestLabels={0:'Guest name',2:'Amount',3:'RSVP',4:'Paid',5:'Paid via',6:'Shirt size'};
let data,rev,dirty=false,view='guests',guestSubView='all',filter='all',saving=false,blocked=false,version=0,autoTimer=null;
const $=s=>document.querySelector(s),status=$('#status');
function changed(){
 dirty=true;version++;status.textContent='Changes detected · Autosaving…';
 updatePaidTotal();window.FriendsgivingSearch?.refresh();clearTimeout(autoTimer);if(!blocked)autoTimer=setTimeout(saveChanges,900);
}
async function saveChanges(){
 clearTimeout(autoTimer);autoTimer=null;
 if(!data||!dirty||blocked||saving)return;
 saving=true;const sentVersion=version;
 const snapshot={planning:data.planning.map(r=>r.slice()),guests:data.guests.map(r=>r.slice()),completion:{...data.completion},removedGuests:{...(data.removedGuests||{})}};
 status.textContent='Saving planner changes…';
 const btn=$('#save');btn.disabled=true;
 try{
  const r=await fetch('/admin/api/planner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:snapshot,revision:rev})});
  if(r.status===409){blocked=true;throw Error('Another change was saved to the cloud. Your edits remain here. Refresh to review before saving again.')}
  if(!r.ok)throw Error('Autosave failed. Your edits remain here; select Save now to retry.');
  const out=await r.json();rev=out.revision;
  if(sentVersion===version){dirty=false;status.textContent='✓ Saved automatically to the cloud';}
  else{dirty=true;status.textContent='Saving latest changes…';}
 }catch(e){dirty=true;status.textContent='⚠ '+e.message}
 finally{saving=false;btn.disabled=false;if(dirty&&!blocked&&sentVersion!==version){clearTimeout(autoTimer);autoTimer=setTimeout(saveChanges,450)}}
}
function field(label,value,onchange){const wrap=document.createElement('label');wrap.textContent=label;const inp=document.createElement('input');inp.type='text';inp.maxLength=500;inp.value=value||'';inp.addEventListener('input',()=>{onchange(inp.value);changed()});wrap.append(inp);return wrap}
function button(text,fn,cls){const b=document.createElement('button');b.type='button';b.textContent=text;if(cls)b.className=cls;b.addEventListener('click',fn);return b}
function renderTabs(){
 const root=$('#tabs');root.replaceChildren();
 [['guests','Guests & payments'],...defs.map((g,i)=>[String(i),g.name])].forEach(([key,label])=>{
  const b=button(label,()=>{view=key;renderTabs();renderView()});
  b.setAttribute('aria-pressed',String(view===key));
  root.append(b);
 });
}
function renderGuestSubTabs(){
 const root=$('#guestSubTabs');root.replaceChildren();
 const awaiting=guestEntries().entries.filter(({row})=>row[0].trim()&&!rsvpConfirmed(row)).length;
 [['all','All guests'],['not-rsvp','Not RSVP’d ('+awaiting+')'],['removed','Removed ('+Object.keys(data?.removedGuests||{}).length+')']].forEach(([key,label])=>{
  const b=button(label,()=>{guestSubView=key;renderGuests()});
  b.setAttribute('aria-pressed',String(guestSubView===key));
  root.append(b);
 });
}
function renderView(){
 const guestTab=view==='guests';
 $('#guestSection').hidden=!guestTab;
 $('#lists').hidden=guestTab;
 if(guestTab)renderGuests();else renderList(Number(view));
}
function renderList(gi){const root=$('#lists');root.replaceChildren();const g=defs[gi],section=document.createElement('div');section.className='group';const title=document.createElement('h2');title.textContent=g.name;section.append(title);const desc=document.createElement('p');desc.className='muted';desc.textContent='Mark items complete as you go. Changes save automatically.';section.append(desc);data.planning.forEach((row,ri)=>{if(!g.cols.some(c=>row[c]))return;const key=gi+':'+ri,line=document.createElement('div');line.className='line'+(data.completion[key]?' done':'');line.dataset.plannerRow=String(ri);g.cols.forEach((c,i)=>line.append(field(g.labels[i],row[c],v=>row[c]=v)));const done=button(data.completion[key]?'✓ Completed':'Mark complete',()=>{data.completion[key]=!data.completion[key];changed();renderList(gi)},'complete');done.setAttribute('aria-pressed',String(!!data.completion[key]));line.append(done,button('Remove',()=>{g.cols.forEach(c=>row[c]='');delete data.completion[key];changed();renderList(gi)},'danger'));section.append(line)});section.append(button('+ Add '+g.name,()=>{const row=Array(9).fill('');data.planning.push(row);const ri=data.planning.length-1,line=document.createElement('div');line.className='line';line.dataset.plannerRow=String(ri);g.cols.forEach((c,i)=>line.append(field(g.labels[i],'',v=>row[c]=v)));line.append(button('Remove',()=>{line.remove();g.cols.forEach(c=>row[c]='');changed()},'danger'));section.insertBefore(line,section.lastChild);line.querySelector('input').focus();changed()}));root.append(section)}
// The Google Guest List is the active source of truth. Display a name once,
// even when a duplicate copy exists in historical organizer data. Keep those
// original rows intact for audit/reconciliation instead of deleting payments.
function syncGuestKey(value){return String(value||'').trim().toLocaleLowerCase('en-US')}
function guestKey(value){
 return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9+ ]/g,' ').replace(/\s+/g,' ').trim();
}
function guestEntries(){
 const entries=[],lookup=new Map();
 let duplicateCount=0,conflicts=0;
 const baseline=data?.sheetSync?.baseline||{};
 const normalizeRow=row=>row.map(v=>String(v||'').trim().toLowerCase()).join('|');
 for(let index=0;index<(data?.guests||[]).length;index++){
  const row=data.guests[index],key=guestKey(row[0]);
  if(!key){entries.push({row,index});continue}
  if(!lookup.has(key)){
   lookup.set(key,entries.length);entries.push({row,index});continue;
  }
  duplicateCount++;
  const slot=lookup.get(key),prev=entries[slot];
  if(normalizeRow(prev.row)!==normalizeRow(row))conflicts++;
  const source=baseline[key];
  // If one of the duplicates is the latest Google Sheet row, display it.
  const sourceKey=Array.isArray(source)?normalizeRow(source):null;
  const prevScore=sourceKey&&normalizeRow(prev.row)===sourceKey?100:prev.row.filter(Boolean).length;
  const nextScore=sourceKey&&normalizeRow(row)===sourceKey?100:row.filter(Boolean).length;
  if(nextScore>prevScore)entries[slot]={row,index};
 }
 return {entries,duplicateCount,conflicts};
}
function rsvpConfirmed(row){
 const status=String(row?.[3]||'').trim().toLowerCase();
 return ['yes','confirmed','attending','true','1'].includes(status);
}
function rsvpStatus(row){
 const status=String(row?.[3]||'').trim().toLowerCase();
 if(rsvpConfirmed(row))return 'Confirmed';
 if(!status)return 'Awaiting response';
 if(['no','declined','not attending','false','0'].includes(status))return 'RSVP: No';
 return 'Not confirmed: '+String(row[3]).trim().slice(0,45);
}
function pay(row){const p=(row[4]||'').trim().toLowerCase(),amount=(row[2]||'').trim().toLowerCase();if(p==='yes'||p==='paid')return 'paid';if(p==='no'||p==='unpaid')return 'unpaid';if(amount==='waived'||p==='waived')return 'waived';return 'unknown'}
function updatePaidTotal(){const el=$('#paidTotal');if(!el||!data)return;let cents=0,missing=0;for(const {row} of guestEntries().entries){if(!row[0].trim()||pay(row)!=='paid')continue;const raw=(row[2]||'').trim().replace(/^[$]/, '').replace(/,/g,'');if(!/^[0-9]+(?:[.][0-9]{1,2})?$/.test(raw)){missing++;continue}const [whole,dec='']=raw.split('.');const n=Number(whole)*100+Number(dec.padEnd(2,'0'));if(!Number.isSafeInteger(n)||!Number.isSafeInteger(cents+n)){missing++;continue}cents+=n}el.textContent='Total marked paid: '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)+(missing?' · '+missing+' paid '+(missing===1?'guest has':'guests have')+' no valid amount':'')} 
function editGuest(index){
 const isNew=index===null,draft=isNew?Array(7).fill(''):data.guests[index].slice();
 while(draft.length<7)draft.push('');
 const dialog=document.createElement('dialog');dialog.className='guest-edit-dialog';
 const title=document.createElement('h2');title.textContent=isNew?'Add guest':'Edit guest';dialog.append(title);
 const grid=document.createElement('div');grid.className='grid';
 const presets={3:['','Yes','No','Maybe'],4:['','Yes','No','Waived'],5:['','Zelle','CashApp','Venmo','Cash','Apple Pay','PayPal','Other'],6:['','N/A','XS','S','M','L','XL','XXL','2XL','3X','3XL','4XL']};
 for(const i of [0,2,3,4,5,6]){
  const label=document.createElement('label');label.textContent=guestLabels[i];let control;
  if(presets[i]){
   control=document.createElement('select');
   const values=[...presets[i]],current=String(draft[i]||'').trim();
   if(current&&!values.some(v=>v.toLowerCase()===current.toLowerCase()))values.push(current);
   for(const value of values){const option=document.createElement('option');option.value=value;option.textContent=value||'Not provided';control.append(option)}
   control.value=values.find(v=>v.toLowerCase()===current.toLowerCase())||'';
   control.addEventListener('change',()=>{draft[i]=control.value});
  }else{
   control=document.createElement('input');control.type='text';control.maxLength=i===0?100:30;
   control.value=draft[i]||'';control.addEventListener('input',()=>{draft[i]=control.value});
  }
  label.append(control);grid.append(label);
 }
 dialog.append(grid);
 const error=document.createElement('p');error.setAttribute('role','status');dialog.append(error);
 const actions=document.createElement('div');actions.className='guest-actions';
 actions.append(button('Save details',()=>{
  if(!draft[0].trim()){error.textContent='Enter a guest name.';return}
  const newKey=guestKey(draft[0]),oldKey=isNew?'':guestKey(data.guests[index][0]);
  if(newKey&&(isNew||newKey!==oldKey)&&data.guests.some((row,i)=>i!==index&&guestKey(row[0])===newKey)){
   error.textContent='That guest is already in the Guest List. Edit the existing entry instead of creating a duplicate.';return;
  }
  if(isNew)data.guests.push(draft);else data.guests[index]=draft;
  filter='all';changed();dialog.close();dialog.remove();renderTabs();renderGuests();
 },'primary'),button('Cancel',()=>{dialog.close();dialog.remove()}));
 if(!isNew&&data.guests[index][0]?.trim())actions.append(button('Remove entry',()=>{
  dialog.close();dialog.remove();removeGuestEntry(index);
 },'danger'));
 dialog.append(actions);dialog.addEventListener('cancel',()=>dialog.remove());
 document.body.append(dialog);dialog.showModal();grid.querySelector('input,select')?.focus();
}
function removeGuestEntry(index){
 const row=data.guests[index];if(!row||!row[0]?.trim())return;
 const name=String(row[0]).trim(),key=syncGuestKey(name);
 if(!confirm('Remove “'+name+'” from the Friendsgiving planner and playing teams? The original Google Sheet will not change. You can restore this entry under Guests & Payments → Removed.'))return;
 if(!data.removedGuests||typeof data.removedGuests!=='object')data.removedGuests={};
 data.removedGuests[key]=row.slice();
 data.guests=data.guests.filter(g=>syncGuestKey(g?.[0])!==key);
 changed();renderGuestSubTabs();renderGuests();window.FriendsgivingSearch?.refresh();
}
function restoreGuestEntry(key){
 const row=data.removedGuests?.[key];if(!Array.isArray(row)||row.length!==7)return;
 if(!data.guests.some(r=>syncGuestKey(r[0])===key))data.guests.push(row.slice());
 delete data.removedGuests[key];
 changed();renderGuestSubTabs();renderGuests();window.FriendsgivingSearch?.refresh();
}
function renderGuests(){
 updatePaidTotal();
 const notRsvp=guestSubView==='not-rsvp',removed=guestSubView==='removed',root=$('#guests'),totals=$('#totalEntries');
 renderGuestSubTabs();
 root.replaceChildren();totals.replaceChildren();
 $('#guestSectionTitle').textContent='Guests & payments';
 $('#guestSectionDescription').textContent=removed
  ?'Entries removed from Friendsgiving remain here for restoration. They are not deleted from Google Sheets and will not be reimported while removed.'
  :notRsvp
  ?'Guests without a confirmed RSVP. Confirm, edit, or remove unwanted entries; removed guests stay hidden from future Google Sheet syncs.'
  :'Mark payments, check RSVPs, and manage guest details. Blank payment statuses are shown as unknown.';
 $('#paidTotal').hidden=notRsvp||removed;
 $('#filters').hidden=notRsvp||removed;
 $('#addGuestToolbar').hidden=notRsvp||removed;
 $('#notRsvpInfo').hidden=!notRsvp;
 if(removed){
  const archived=Object.entries(data.removedGuests||{}).sort((a,b)=>String(a[1]?.[0]||a[0]).localeCompare(String(b[1]?.[0]||b[0])));
  $('#counts').textContent=archived.length+' removed '+(archived.length===1?'entry':'entries')+' · Not shown in active guests or team assignments';
  $('#sheetTotal').hidden=true;
  if(!archived.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='No removed entries. Remove unwanted guests from Not RSVP’d or All Guests.';root.append(empty)}
  for(const [key,row] of archived){
   const card=document.createElement('article');card.className='guest';
   const heading=document.createElement('h3');heading.textContent=String(row[0]||key);card.append(heading);
   const note=document.createElement('p');note.className='muted';note.textContent='Removed from Friendsgiving · Original Google Sheet unchanged';card.append(note);
   const actions=document.createElement('div');actions.className='guest-actions';
   actions.append(button('Restore entry',()=>restoreGuestEntry(key),'primary'));card.append(actions);root.append(card);
  }
  return;
 }
 const {entries,duplicateCount,conflicts}=guestEntries();
 let counts={all:0,paid:0,unpaid:0,unknown:0,waived:0};
 const awaiting=entries.filter(({row})=>row[0].trim()&&!rsvpConfirmed(row));
 const noCount=awaiting.filter(({row})=>String(row[3]||'').trim().toLowerCase()==='no').length;
 const blankCount=awaiting.filter(({row})=>!String(row[3]||'').trim()).length;
 const otherCount=awaiting.length-noCount-blankCount;
 entries.forEach(({row})=>{if(!row[0].trim())return;counts.all++;counts[pay(row)]++});
 $('#counts').textContent=notRsvp
  ?'Not RSVP’d: '+awaiting.length+' · Marked No: '+noCount+' · No response: '+blankCount+(otherCount?' · Other unconfirmed: '+otherCount:'')
  :'Guests: '+counts.all+' · Paid: '+counts.paid+' · Unpaid: '+counts.unpaid+' · Unknown: '+counts.unknown+' · Waived: '+counts.waived+
    (duplicateCount?' · '+duplicateCount+' duplicate Guest List '+(duplicateCount===1?'entry':'entries')+' hidden (original records retained)':'')+
    (conflicts?' · '+conflicts+' conflicting copies need source review':'');
 const fs=$('#filters');fs.replaceChildren();
 [['all','All'],['paid','Paid'],['unpaid','Unpaid'],['unknown','Unknown'],['waived','Waived']].forEach(([key,label])=>{
  const b=button(label+' ('+counts[key]+')',()=>{filter=key;renderGuests()});
  b.setAttribute('aria-pressed',String(filter===key));fs.append(b);
 });
 let shown=0;
 const table=document.createElement('table');table.className='guest-list-table';
 const thead=document.createElement('thead'),head=document.createElement('tr');
 for(const label of ['Guest name','Amount','RSVP','Paid','Paid via','Shirt size']){
  const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);
 }
 thead.append(head);table.append(thead);
 const body=document.createElement('tbody');
 const choices={3:['','Yes','No','Maybe'],4:['','Yes','No','Waived'],5:['','Zelle','CashApp','Venmo','Cash','Apple Pay','PayPal','Other'],6:['','N/A','XS','S','M','L','XL','XXL','2XL','3X','3XL','4XL']};
 function guestSelect(row,column){
  const select=document.createElement('select');select.className='guest-cell-select';
  select.setAttribute('aria-label',guestLabels[column]+' for '+row[0]);
  const current=String(row[column]||'').trim(),values=[...choices[column]];
  if(current&&!values.some(v=>v.toLowerCase()===current.toLowerCase()))values.push(current);
  for(const value of values){const option=document.createElement('option');option.value=value;option.textContent=value||'—';select.append(option)}
  select.value=values.find(v=>v.toLowerCase()===current.toLowerCase())||'';
  select.addEventListener('change',()=>{row[column]=select.value;changed();renderGuests()});
  return select;
 }
 entries.forEach(({row,index:i})=>{
  const isTotal=!row[0].trim()&&row.some(Boolean),payment=pay(row);
  if(isTotal){
   const line=document.createElement('div');line.className='muted';line.textContent='Original sheet total: '+(row[2]||'Not provided');
   totals.append(line);return;
  }
  if(!row[0].trim()||notRsvp&&rsvpConfirmed(row)||!notRsvp&&filter!=='all'&&filter!==payment)return;
  const tr=document.createElement('tr');tr.className=rsvpConfirmed(row)&&payment==='paid'?'guest-ready':'guest-waiting';
  tr.dataset.guestIndex=String(i);
  const nameCell=document.createElement('td'),nameButton=button(row[0],()=>editGuest(i),'guest-name-button');
  nameButton.title='Edit '+row[0];nameCell.append(nameButton);tr.append(nameCell);
  const amountCell=document.createElement('td'),amountInput=document.createElement('input');
  amountInput.className='guest-cell-amount';amountInput.type='text';amountInput.inputMode='decimal';
  amountInput.maxLength=30;amountInput.setAttribute('aria-label','Amount for '+row[0]);
  const rawAmount=String(row[2]||'').trim();amountInput.value=/^\d+(?:\.\d{1,2})?$/.test(rawAmount)?'$'+rawAmount:rawAmount;
  amountInput.placeholder='$0';
  amountInput.addEventListener('change',()=>{row[2]=amountInput.value.trim().replace(/^\$/,'');changed();renderGuests()});
  amountCell.append(amountInput);tr.append(amountCell);
  for(const column of [3,4,5,6]){const cell=document.createElement('td');cell.append(guestSelect(row,column));tr.append(cell)}
  body.append(tr);shown++;
 });
 table.append(body);
 if(shown){
  const wrap=document.createElement('div');wrap.className='guest-table-wrap';wrap.setAttribute('role','region');
  wrap.setAttribute('aria-label','Guest list — edit guest names or adjust cells');wrap.tabIndex=0;
  wrap.append(table);root.append(wrap);
 }else{
  const p=document.createElement('p');p.className='muted';
  p.textContent=notRsvp?'Everyone on the Guest List has a confirmed RSVP.':'No guests in this view.';
  root.append(p);
 }
 $('#sheetTotal').hidden=notRsvp||!totals.children.length;
}
function plannerSearch(query,matches){
 if(!data||!Array.isArray(data.guests)||!Array.isArray(data.planning))return [];
 const found=[],entries=guestEntries().entries;
 for(const {row,index} of entries){
  if(!row[0]?.trim())continue;
  const payment=pay(row);
  const status=rsvpStatus(row);
  if(!matches(query,row[0],row[1],row[2],row[3],row[4],row[5],row[6],payment,status,'guest','payment','RSVP'))continue;
  found.push({
   title:String(row[0]).trim(),group:'Guests & payments',
   detail:'RSVP: '+status+' · Payment: '+payment+(row[6]?' · Shirt: '+row[6]:''),
   activate:()=>{
    view='guests';guestSubView='all';filter='all';renderTabs();renderView();
    window.FriendsgivingSearch?.navigate($('#guests [data-guest-index="'+index+'"]'));
   }
  });
 }
 for(let gi=0;gi<defs.length;gi++){
  const group=defs[gi];
  if(matches(query,group.name)){
   found.push({title:'Open '+group.name,group:'Planner section',detail:'Go to '+group.name+' planning list',
    activate:()=>{view=String(gi);renderTabs();renderView();window.FriendsgivingSearch?.navigate($('#lists .group'))}});
  }
  data.planning.forEach((row,ri)=>{
   if(!group.cols.some(i=>String(row[i]||'').trim()))return;
   const contents=group.cols.map(i=>String(row[i]||'').trim()).filter(Boolean);
   if(!matches(query,group.name,...contents))return;
   found.push({
    title:contents[0]?.slice(0,90)||group.name,
    detail:contents.join(' · ').slice(0,180)+(data.completion[gi+':'+ri]?' · Completed':' · In progress'),
    group:group.name,
    activate:()=>{
     view=String(gi);renderTabs();renderView();
     window.FriendsgivingSearch?.navigate($('#lists [data-planner-row="'+ri+'"]'));
    }
   });
  });
 }
 return found;
}
window.FriendsgivingSearch?.register(plannerSearch);
async function start(){try{const r=await fetch('/admin/api/planner',{cache:'no-store'});if(!r.ok)throw Error('Unable to load planner. Please refresh.');const out=await r.json();data=out.data;rev=out.revision;if(!data||!Array.isArray(data.planning)||!Array.isArray(data.guests))throw Error('Planner data unavailable.');data.completion=data.completion||{};renderTabs();renderView();$('#save').disabled=false;$('#notice').textContent='Autosave on · Guest, payment and planning edits save to Cloudflare. They do not write back to Google Sheets.'}catch(e){$('#notice').textContent=e.message}}
async function refreshSheetSyncStatus(){
 const el=$('#sheetSyncStatus');if(!el)return;
 el.textContent='Checking synchronization status…';
 try{
  const response=await fetch('/api/sheets-sync',{cache:'no-store'});
  if(!response.ok)throw Error('Status unavailable');
  const state=await response.json();
  if(state.lastSuccessAt){
   el.textContent='Automatic Sheets → Friendsgiving sync active. Last checked: '+new Date(state.lastSuccessAt).toLocaleString()+'. Last run: '+state.lastChanges+' changed fields or new guests'+(state.conflicts?' · '+state.conflicts+' conflict(s) need review.':'.');
  }else{
   el.textContent='Initial guest snapshot imported. Automatic synchronization is awaiting the one-time Google Apps Script authorization.';
  }
 }catch{el.textContent='Initial snapshot imported; automatic synchronization status is temporarily unavailable.'}
}
// Keep the not-RSVP list aligned with Google Sheet updates and other admins.
// Never overwrite unsaved local edits or an open guest-editing dialog.
setInterval(async()=>{
 if(document.hidden||dirty||saving||blocked||!data||document.querySelector('dialog[open]'))return;
 try{
  const response=await fetch('/admin/api/planner',{cache:'no-store'});
  if(!response.ok)return;
  const result=await response.json();
  if(!Number.isSafeInteger(result.revision)||result.revision===rev||!Array.isArray(result.data?.guests)||!Array.isArray(result.data?.planning))return;
  if(dirty||saving||blocked)return;
  data=result.data;rev=result.revision;data.completion=data.completion||{};
  renderTabs();renderView();window.FriendsgivingSearch?.refresh();
  status.textContent='✓ Guest List refreshed from cloud';
 }catch{}
},60000);
const checkSync=$('#checkSheetSync');if(checkSync)checkSync.addEventListener('click',refreshSheetSyncStatus);
refreshSheetSyncStatus();
$('#addGuest').addEventListener('click',()=>{if(data)editGuest(null)});
$('#save').addEventListener('click',()=>{if(blocked){status.textContent='⚠ Reload this page to review changes made elsewhere.';return}dirty=true;saveChanges()});
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty&&!blocked)saveChanges()});
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue=''}});start()})();