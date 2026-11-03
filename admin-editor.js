const fields=[
 ['Welcome message','.hero .lead'],['Mission date','.status>div:nth-child(1) strong'],['Date note','.status>div:nth-child(1) small'],['Rally point','.status>div:nth-child(2) strong'],['Location note','.status>div:nth-child(2) small'],['Arrival','.status>div:nth-child(3) strong'],['Arrival note','.status>div:nth-child(3) small'],
 ...Array.from({length:6},(_,i)=>[['Schedule '+(i+1)+' time','.event:nth-child('+(i+1)+') .time'],['Schedule '+(i+1)+' title','.event:nth-child('+(i+1)+') h3'],['Schedule '+(i+1)+' description','.event:nth-child('+(i+1)+') p']]).flat(),
 ...Array.from({length:4},(_,i)=>[['Game '+(i+1)+' title','#games .card:nth-child('+(i+1)+') h3'],['Game '+(i+1)+' description','#games .card:nth-child('+(i+1)+') p']]).flat(),
 ...Array.from({length:3},(_,i)=>[['Food '+(i+1)+' title','#feast .card:nth-child('+(i+1)+') h3'],['Food '+(i+1)+' description','#feast .card:nth-child('+(i+1)+') p']]).flat(),
 ['Closing message','.closing p']
]; const sections=[['Schedule','#mission'],['Squad rule','.rule'],['Games','#games'],['Teams','#teams'],['Feast','#feast'],['Closing message','.closing']];
const oldToNew=[0,1,2,4,5];
function normalizeOrder(order){const good=(x,n)=>Array.isArray(x)&&x.length===n&&new Set(x).size===n&&x.every(i=>Number.isInteger(i)&&i>=0&&i<n);if(good(order,6))return order.slice();if(good(order,5)){const converted=order.map(i=>oldToNew[i]),after=converted.indexOf(2);converted.splice(after+1,0,3);return converted}return [0,1,2,3,4,5]}
function normalizeHidden(hidden){if(!Array.isArray(hidden))return Array(6).fill(false);return hidden.length===5?[hidden[0],hidden[1],hidden[2],false,hidden[3],hidden[4]].map(Boolean):Array.from({length:6},(_,i)=>hidden[i]===true)}

// Search the editable mission text already loaded into Mission Control.
function missionSearch(query,matches){
 const found=[];
 for(let i=0;i<fields.length;i++){
  const input=document.querySelector('#fields [data-idx="'+i+'"]');
  if(!input)continue;
  const label=fields[i][0],value=String(input.value||'');
  if(!matches(query,label,value))continue;
  found.push({title:label,group:'Mission Control',
   detail:value.trim().slice(0,185)||'Empty field · select to edit',
   activate:()=>{
    window.FriendsgivingSearch?.navigate(input.closest('label'));
    input.focus({preventScroll:true});
   }
  });
 }
 return found;
}
window.FriendsgivingSearch?.register(missionSearch);

(async()=>{
 const msg=document.querySelector('#message'),form=document.querySelector('#editor');
 const dlg=document.querySelector('#pageSettings'),open=document.querySelector('#openSettings'),close=document.querySelector('#closeSettings');
 const saveNow=document.querySelector('#saveSettings'),feedback=document.querySelector('#settingsStatus');
 let sectionOrder=[],sectionHidden=[],rawBase='',initialized=false;
 let dirty=false,saving=false,blocked=false,version=0,timer=null,sent=null;
 function liveValues(){
  return {text:Array.from(document.querySelectorAll('#fields [data-idx]'),el=>el.value.trim()),hidden:sectionHidden.slice(),order:sectionOrder.slice()};
 }
 const serial=v=>JSON.stringify(v);
 function status(message){msg.textContent=message;feedback.textContent=message}
 function schedule(delay=800){
  if(!initialized||blocked)return;
  dirty=true;version++;status('Changes detected · Saving automatically…');
  clearTimeout(timer);timer=setTimeout(flush,delay);
 }
 async function flush(){
  clearTimeout(timer);timer=null;
  if(!initialized||blocked||saving||!dirty)return;
  const values=liveValues(),snapshot=serial(values),base=rawBase,atVersion=version;
  saving=true;sent=snapshot;status('Saving changes…');
  try{
   const r=await fetch('/admin/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,expected:base})});
   const out=await r.json().catch(()=>({}));
   if(r.status===409){blocked=true;throw Error('Changes were made in another tab. Your edits are still here; reload to review before saving again.')}
   if(!r.ok)throw Error(out.error||'Autosave failed. Retry using Save now.');
   rawBase=serial(out.settings);
   if(version===atVersion||serial(liveValues())===snapshot){
    dirty=false;status('✓ Saved automatically · Visible on the friends’ page');
   }else{
    dirty=true;status('Saving latest changes…');setTimeout(flush,100);
   }
  }catch(err){
   dirty=true;status('⚠ '+err.message);
  }finally{
   saving=false;sent=null;
   if(dirty&&!blocked&&version!==atVersion){clearTimeout(timer);timer=setTimeout(flush,600)}
  }
 }
 function renderSections(){
  const root=document.querySelector('#sections');root.replaceChildren();
  sectionOrder.forEach((i,pos)=>{
   const row=document.createElement('div');row.className='section-row';
   const label=document.createElement('label');label.className='switch';
   const check=document.createElement('input');check.type='checkbox';check.checked=!sectionHidden[i];check.dataset.idx=i;
   check.addEventListener('change',()=>{sectionHidden[i]=!check.checked;schedule(450)});
   label.append(check,document.createTextNode('Show '+sections[i][0]));row.append(label);
   const buttons=document.createElement('div');buttons.className='move-controls';
   [-1,1].forEach(delta=>{
    const button=document.createElement('button');button.type='button';button.textContent=delta<0?'↑':'↓';
    button.setAttribute('aria-label','Move '+sections[i][0]+' '+(delta<0?'up':'down'));
    button.disabled=pos+delta<0||pos+delta>=sectionOrder.length;
    button.addEventListener('click',()=>{
     const target=pos+delta;
     [sectionOrder[pos],sectionOrder[target]]=[sectionOrder[target],sectionOrder[pos]];
     renderSections();schedule(450);
     const moved=document.querySelector('[data-move="'+i+':'+delta+'"]');
     if(moved&&!moved.disabled)moved.focus();
    });button.dataset.move=i+':'+delta;buttons.append(button);
   });row.append(buttons);root.append(row);
  });
 }
 function doneSettings(){dlg.close();if(dirty)flush()}
 try{
  const [home,res]=await Promise.all([fetch('/'),fetch('/api/settings',{cache:'no-store'})]);
  if(!home.ok||!res.ok)throw Error('Unable to load current settings');
  const parsed=await home.text(),raw=await res.text(),data=JSON.parse(raw),doc=new DOMParser().parseFromString(parsed,'text/html');
  if(!Array.isArray(data.text)||data.text.length!==40)throw Error('Page settings not initialized');
  rawBase=raw;sectionOrder=normalizeOrder(data.order);sectionHidden=normalizeHidden(data.hidden);renderSections();
  fields.forEach(([name,selector],i)=>{
   const label=document.createElement('label');label.textContent=name;
   const el=document.createElement(name.includes('description')||name.includes('message')?'textarea':'input');
   if(el.tagName==='INPUT')el.type='text';
   el.maxLength=500;el.value=typeof data.text?.[i]==='string'?data.text[i]:(doc.querySelector(selector)?.textContent||'').trim();
   el.dataset.idx=i;el.addEventListener('input',()=>schedule(900));label.append(el);document.querySelector('#fields').append(label);
  });
  initialized=true;open.disabled=false;status('Autosave is on · Changes are saved as you edit');
  window.FriendsgivingSearch?.refresh();
  open.addEventListener('click',()=>dlg.showModal());
  close.addEventListener('click',doneSettings);
  dlg.addEventListener('cancel',e=>{e.preventDefault();doneSettings()});
  saveNow.addEventListener('click',()=>{if(blocked){status('⚠ Settings changed elsewhere. Reload to avoid overwriting them.');return}dirty=true;flush()});
  form.addEventListener('submit',e=>{e.preventDefault();if(blocked){status('⚠ Reload to review another tab’s changes.');return}dirty=true;flush()});
  window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty&&!blocked)flush()});
  window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue=''}});
 }catch(e){status('⚠ '+e.message);form.querySelector('button[type="submit"]')?.setAttribute('disabled','')}
})();
