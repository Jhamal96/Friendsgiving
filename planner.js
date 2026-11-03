(()=>{'use strict';
const defs=[{name:'Games',cols:[0],labels:['Game or relay']},{name:'Drinks & supplies',cols:[1],labels:['Item']},{name:'Appetizers',cols:[2],labels:['Item']},{name:'Main course',cols:[3],labels:['Item']},{name:'Schedule',cols:[4,5],labels:['Activity','Time']},{name:'Groceries',cols:[6,7],labels:['Item','Price']},{name:'Notes',cols:[8],labels:['Note']}],guestLabels=['Guest name','Size Shirt (original column)','Amount','RSVP','Paid','Paid via','Shirt size'];
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
 const snapshot={planning:data.planning.map(r=>r.slice()),guests:data.guests.map(r=>r.slice()),completion:{...data.completion}};
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
 [['all','All guests'],['not-rsvp','Not RSVP’d ('+awaiting+')']].forEach(([key,label])=>{
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
function editGuest(index){const isNew=index===null, draft=isNew?Array(7).fill(''):data.guests[index].slice();const dialog=document.createElement('dialog');dialog.style.cssText='width:min(90vw,600px);max-height:85vh;overflow:auto;background:#10233c;color:white;border:1px solid #6683a4;border-radius:12px;padding:22px';const title=document.createElement('h2');title.textContent=isNew?'Add squad member':'Edit squad member';dialog.append(title);const grid=document.createElement('div');grid.className='grid';draft.forEach((v,i)=>{const label=document.createElement('label');label.textContent=guestLabels[i];const input=document.createElement('input');input.type='text';input.maxLength=500;input.value=v;input.addEventListener('input',()=>{draft[i]=input.value});label.append(input);grid.append(label)});dialog.append(grid);const error=document.createElement('p');error.setAttribute('role','status');dialog.append(error);const actions=document.createElement('div');actions.className='guest-actions';actions.append(button('Save details',()=>{if((isNew||data.guests[index][0].trim())&&!draft[0].trim()){error.textContent='Enter a guest name.';return}const newKey=guestKey(draft[0]),oldKey=isNew?'':guestKey(data.guests[index][0]);
 if(newKey&&(isNew||newKey!==oldKey)&&data.guests.some((row,i)=>i!==index&&guestKey(row[0])===newKey)){
  error.textContent='That guest is already in the Guest List. Edit the existing entry instead of creating a duplicate.';return
 }
 if(isNew)data.guests.push(draft);else data.guests[index]=draft;filter='all';changed();dialog.close();dialog.remove();renderTabs();renderGuests()},'primary'),button('Cancel',()=>{dialog.close();dialog.remove()}));dialog.append(actions);dialog.addEventListener('cancel',()=>dialog.remove());document.body.append(dialog);dialog.showModal();grid.querySelector('input').focus()}
function renderGuests(){
 updatePaidTotal();
 const notRsvp=guestSubView==='not-rsvp',root=$('#guests'),totals=$('#totalEntries');
 renderGuestSubTabs();
 root.replaceChildren();totals.replaceChildren();
 $('#guestSectionTitle').textContent='Guests & payments';
 $('#guestSectionDescription').textContent=notRsvp
  ?'Guests whose Google Guest List RSVP is marked No or has no confirmed response. Review their payment status, edit details, or confirm their RSVP. Website edits autosave to Cloudflare, not Google Sheets.'
  :'Mark payments, check RSVPs, and manage guest details. Blank payment statuses are shown as unknown.';
 $('#paidTotal').hidden=notRsvp;
 $('#filters').hidden=notRsvp;
 $('#addGuestToolbar').hidden=notRsvp;
 $('#notRsvpInfo').hidden=!notRsvp;
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
 entries.forEach(({row,index:i})=>{
  const isTotal=!row[0].trim()&&row.some(Boolean),payment=pay(row);
  if(notRsvp&&(!row[0].trim()||rsvpConfirmed(row)))return;
  if(!notRsvp&&!isTotal&&filter!=='all'&&filter!==payment)return;
  const card=document.createElement('article');card.className='guest';card.dataset.guestIndex=String(i);
  const heading=document.createElement('h3');heading.textContent=row[0]||'Sheet total / unnamed entry';
  const badge=document.createElement('span');
  badge.className='badge '+(notRsvp?'rsvp-pending':payment);
  badge.textContent=notRsvp?rsvpStatus(row):isTotal?'Sheet entry':({paid:'Paid',unpaid:'Unpaid',unknown:'Unknown',waived:'Waived'}[payment]);
  heading.append(' ',badge);card.append(heading);
  const grid=document.createElement('div');grid.className='grid';
  const fields=isTotal?[[2,'Original sheet total']]:notRsvp
   ?[[3,'RSVP'],[4,'Paid'],[2,'Amount'],[5,'Paid via']]
   :[[2,'Amount'],[3,'RSVP'],[5,'Paid via'],[6,'Shirt size']];
  fields.forEach(([j,label])=>{
   const item=document.createElement('div');item.style.cssText='padding:8px 0;color:#dce8f5';
   const caption=document.createElement('small');caption.textContent=label+': ';
   const value=document.createElement('strong');value.textContent=row[j]||'Not provided';
   item.append(caption,value);grid.append(item);
  });card.append(grid);
  const acts=document.createElement('div');acts.className='guest-actions';
  if(isTotal)acts.append(button('Edit total',()=>editGuest(i)));
  else if(notRsvp){
   acts.append(button('Confirm RSVP',()=>{
    row[3]='Yes';changed();renderTabs();renderGuests();
   },'primary'),button('Edit details',()=>editGuest(i)));
  }else{
   acts.append(
    button('Edit details',()=>editGuest(i)),
    button('Mark paid',()=>{row[4]='Yes';changed();renderGuests()},'primary'),
    button('Mark unpaid',()=>{row[4]='No';changed();renderGuests()}),
    button('Clear payment status',()=>{row[4]='';changed();renderGuests()})
   );
  }
  if(!notRsvp)acts.append(button('Remove entry',()=>{
   if(!confirm('Remove this entry?'))return;
   data.guests.splice(i,1);changed();renderTabs();renderGuests();
  },'danger'));
  card.append(acts);
  (isTotal?totals:root).append(card);
  if(!isTotal)shown++;
 });
 $('#sheetTotal').hidden=notRsvp||!totals.children.length;
 if(!shown){
  const p=document.createElement('p');p.className='muted';
  p.textContent=notRsvp?'Everyone on the Guest List has a confirmed RSVP.':'No guests in this view.';
  root.append(p);
 }
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