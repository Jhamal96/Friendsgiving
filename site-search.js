(()=>{'use strict';
 const host=document.querySelector('main');
 if(!host)return;
 const isPublic=location.pathname==='/'||location.pathname==='/index.html';
 const bar=document.createElement('section');
 bar.id='fgPageSearch';
 bar.className='fg-page-search';
 bar.setAttribute('role','search');
 bar.setAttribute('aria-label',isPublic?'Find event information':'Search current organizer page');
 const label=document.createElement('label');
 label.htmlFor='fgSearchInput';label.className='fg-search-label';
 label.textContent=isPublic?'Find event information':'Search this page';
 const wrap=document.createElement('div');wrap.className='fg-search-row';
 const icon=document.createElement('span');icon.className='fg-search-symbol';
 icon.setAttribute('aria-hidden','true');icon.textContent='⌕';
 const input=document.createElement('input');input.id='fgSearchInput';input.type='search';
 input.maxLength=100;input.autocomplete='off';input.spellcheck=false;
 input.setAttribute('aria-controls','fgSearchResults');
 input.placeholder=isPublic?'Search schedule, food, games, location…':
  location.pathname.includes('/planner')?'Search guests, RSVP, payments, games, notes…':
  location.pathname.includes('/teams')?'Search teams, players, roles, captains…':
  location.pathname.includes('/responses')?'Search matched names, plus-ones, status…':
  'Search event details, schedule, food and games…';
 const clear=document.createElement('button');clear.type='button';
 clear.className='fg-search-clear';clear.textContent='Clear';
 clear.setAttribute('aria-label','Clear search');clear.hidden=true;
 wrap.append(icon,input,clear);
 const status=document.createElement('p');status.id='fgSearchStatus';
 status.className='fg-search-status';status.setAttribute('aria-live','polite');
 status.textContent=isPublic?'Search only public event details. Team names are checked privately below.':
  'Search across this page without changing saved data.';
 const results=document.createElement('div');results.className='fg-search-results';
 results.id='fgSearchResults';results.hidden=true;
 const list=document.createElement('div');list.className='fg-search-result-list';
 results.append(list);bar.append(label,wrap,status,results);
 const anchor=isPublic?host.querySelector('.status'):host.querySelector('h1');
 if(anchor)anchor.insertAdjacentElement('afterend',bar);
 else host.prepend(bar);
 const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase().replace(/\s+/g,' ').trim();
 const matches=(query,...values)=>normalize(values.join(' ')).includes(normalize(query));
 const navigate=target=>{
  if(!target)return;
  try{target.scrollIntoView({behavior:'smooth',block:'center'})}catch{target.scrollIntoView()}
  target.classList.add('fg-search-hit');
  const old=target._fgSearchTimeout;if(old)clearTimeout(old);
  target._fgSearchTimeout=setTimeout(()=>target.classList.remove('fg-search-hit'),1900);
 };
 let provider=null;
 const publicResults=query=>{
  const rows=[
   ...Array.from(host.querySelectorAll('.status>div')).map((node,index)=>({
    title:node.querySelector('.label')?.textContent||'Event detail',
    detail:node.textContent,group:'Event details',node
   })),
   ...Array.from(host.querySelectorAll('#mission .event')).map(node=>({
    title:node.querySelector('h3')?.textContent||'Schedule',
    detail:node.textContent,group:'Schedule',node
   })),
   ...Array.from(host.querySelectorAll('#games .card')).map(node=>({
    title:node.querySelector('h3')?.textContent||'Game',
    detail:node.textContent,group:'Games',node
   })),
   ...Array.from(host.querySelectorAll('#feast .card')).map(node=>({
    title:node.querySelector('h3')?.textContent||'Food',
    detail:node.textContent,group:'Food',node
   }))
  ];
  const flyer=host.querySelector('.flyer-section'),end=host.querySelector('.closing'),teams=host.querySelector('#teams');
  if(flyer)rows.push({title:'Friendsgiving flyer',detail:'Date, time and location',group:'Event details',node:flyer});
  if(end)rows.push({title:'Closing message',detail:end.textContent,group:'Event details',node:end});
  if(teams&&!teams.hidden)rows.push({title:'Look up your team',detail:'Search your own name securely in Squad Assignments',group:'Team lookup',node:teams});
  return rows.filter(row=>matches(query,row.title,row.detail)).map(({title,detail,group,node})=>({
   title,detail:String(detail||'').trim().replace(/\s+/g,' ').slice(0,180),group,
   activate:()=>{navigate(node);if(node?.id==='teams')node.querySelector('#teamSearch')?.focus({preventScroll:true})}
  }));
 };
 function refresh(){
  const raw=input.value.trim(),query=normalize(raw);
  clear.hidden=!raw;list.replaceChildren();
  if(!query){results.hidden=true;status.textContent=isPublic?'Search only public event details. Team names are checked privately below.':'Search across this page without changing saved data.';return}
  let found=[];
  try{found=(provider?provider(query,matches):isPublic?publicResults(query):[])||[]}
  catch{found=[]}
  if(!Array.isArray(found))found=[];
  const max=65,shown=found.slice(0,max);
  results.hidden=false;
  status.textContent=found.length?found.length+' result'+(found.length===1?'':'s')+(found.length>max?' · showing first '+max:'')+' for “'+raw+'”':'No results for “'+raw+'”. Try a different name or keyword.';
  if(!shown.length){
   const none=document.createElement('p');none.className='fg-search-empty';
   none.textContent='No matches found on this page.';list.append(none);
  }
  for(const item of shown){
   const btn=document.createElement('button');btn.type='button';btn.className='fg-search-result';
   const heading=document.createElement('span');heading.className='fg-search-result-title';heading.textContent=String(item.title||'Result');
   const group=document.createElement('span');group.className='fg-search-result-group';group.textContent=String(item.group||'Result');
   const desc=document.createElement('small');desc.className='fg-search-result-detail';desc.textContent=String(item.detail||'').slice(0,190);
   btn.append(heading,group,desc);
   btn.addEventListener('click',()=>{
    try{item.activate?.()}catch{}
    results.hidden=true;
    status.textContent='Opened '+String(item.title||'result')+'. Change the search to find something else.';
   });
   list.append(btn);
  }
 }
 input.addEventListener('input',refresh);
 input.addEventListener('keydown',event=>{
  if(event.key==='Enter'){
   const first=list.querySelector('button');
   if(first){event.preventDefault();first.click()}
  }
  if(event.key==='Escape'&&input.value){input.value='';refresh()}
 });
 clear.addEventListener('click',()=>{input.value='';refresh();input.focus()});
 window.FriendsgivingSearch={
  register(fn){if(typeof fn==='function'){provider=fn;refresh()}},
  refresh,getQuery:()=>input.value.trim(),matches,navigate,
  focus:()=>{input.focus();bar.scrollIntoView({behavior:'smooth',block:'center'})}
 };
})();