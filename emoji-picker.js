(()=>{
 'use strict';
 // Event content, planning notes and team motto support emoji; guest identity,
 // payment, RSVP, team names and captain fields deliberately do not.
 const GROUPS={
  'Popular':[['🎉','Party'],['🥳','Celebrate'],['💙','Blue heart'],['💛','Yellow heart'],['🏆','Trophy'],['🔥','Fire'],['✨','Sparkles'],['🙌','Hands up'],['🍗','Food'],['🎮','Gaming'],['💪','Strong'],['👑','Crown'],['⚔️','Swords'],['🛡️','Shield'],['⭐','Star'],['😂','Laugh']],
  'Faces':[['😀','Happy'],['😁','Grinning'],['😂','Laugh'],['🤣','Rolling laugh'],['🥹','Touched'],['😊','Smile'],['😍','Love'],['🥰','Loved'],['😎','Cool'],['🤩','Excited'],['🥳','Party face'],['🤔','Thinking'],['😅','Relieved'],['😮','Surprised'],['😭','Crying'],['😤','Determined'],['🫡','Salute'],['😇','Angel']],
  'Hearts':[['❤️','Red heart'],['💙','Blue heart'],['💛','Yellow heart'],['💚','Green heart'],['💜','Purple heart'],['🧡','Orange heart'],['🩷','Pink heart'],['🤍','White heart'],['🖤','Black heart'],['💖','Sparkling heart'],['💕','Hearts'],['💘','Cupid'],['💯','Hundred'],['🙏','Praying hands'],['🤝','Handshake'],['🫶','Heart hands']],
  'Celebration':[['🎉','Party popper'],['🎊','Confetti'],['🥳','Party face'],['🎈','Balloon'],['🎁','Gift'],['✨','Sparkles'],['🎇','Sparkler'],['🎆','Fireworks'],['🪩','Disco ball'],['🏅','Medal'],['🏆','Trophy'],['🥇','Gold medal'],['🎶','Music'],['📣','Megaphone'],['📸','Photo'],['📅','Calendar']],
  'Food':[['🍗','Drumstick'],['🍖','Meat'],['🥘','Meal'],['🍲','Soup'],['🍕','Pizza'],['🍔','Burger'],['🍟','Fries'],['🌽','Corn'],['🥔','Potato'],['🥗','Salad'],['🧁','Cupcake'],['🍰','Cake'],['🥧','Pie'],['🍪','Cookie'],['🥤','Drink'],['🧃','Juice']],
  'Games':[['🎮','Controller'],['🎯','Target'],['🎲','Dice'],['🏀','Basketball'],['🏈','Football'],['⚽','Soccer'],['🏐','Volleyball'],['🏃','Run'],['💪','Strong'],['🥇','First place'],['🥈','Second place'],['🥉','Third place'],['🏆','Trophy'],['🛡️','Shield'],['⚔️','Swords'],['🚀','Rocket']],
  'Symbols':[['✅','Check'],['❌','Cross'],['✔️','Tick'],['⭐','Star'],['🌟','Glowing star'],['⚡','Lightning'],['🔥','Fire'],['💥','Boom'],['💡','Idea'],['📍','Pin'],['📢','Announcement'],['🔔','Bell'],['⏰','Alarm'],['⚠️','Warning'],['➡️','Right arrow'],['👀','Eyes']]
 };
 let lastField=null,caretStart=null,caretEnd=null,activeGroup='Popular';
 function allowed(el){
  if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement))return false;
  if(el.disabled||el.readOnly||!['text','textarea'].includes(el.type))return false;
  if(el.closest('#fields'))return true;
  if(el.closest('#lists .line')){
   const title=el.closest('label')?.firstChild?.textContent||'';
   return !/^(Price|Time)$/i.test(title.trim());
  }
  if(el.closest('.edit-label')){
   const name=el.closest('label')?.firstChild?.textContent||'';
   return /team motto/i.test(name);
  }
  return false;
 }
 function remember(el){
  if(!allowed(el))return;
  lastField=el;
  caretStart=typeof el.selectionStart==='number'?el.selectionStart:el.value.length;
  caretEnd=typeof el.selectionEnd==='number'?el.selectionEnd:caretStart;
  // A small nearby launch button is also available inside edit dialogs.
  const label=el.closest('label');
  if(label&&!label.querySelector('.fg-emoji-near')){
   const near=document.createElement('button');
   near.type='button';near.className='fg-emoji-near';
   near.textContent='😊 Add emoji';
   near.setAttribute('aria-label','Insert an emoji into this field');
   near.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openPicker(el)});
   label.append(near);
  }
 }
 document.addEventListener('focusin',e=>{if(allowed(e.target))remember(e.target)});
 document.addEventListener('select',e=>{if(e.target===lastField)remember(e.target)},true);
 document.addEventListener('keyup',e=>{if(e.target===lastField)remember(e.target)},true);
 document.addEventListener('pointerup',e=>{if(e.target===lastField)remember(e.target)},true);
 const picker=document.createElement('section');
 picker.id='fgEmojiPicker';picker.setAttribute('popover','auto');
 picker.setAttribute('role','group');picker.setAttribute('aria-label','Friendsgiving emoji picker');
 picker.innerHTML='<div class="fg-emoji-header"><strong>😊 Add an emoji</strong><button type="button" class="fg-emoji-close" aria-label="Close emoji picker">✕</button></div><p class="fg-emoji-help">Choose an emoji to insert at the cursor. Text changes autosave as usual.</p><input type="search" class="fg-emoji-search" aria-label="Search emojis" placeholder="Search emojis..." autocomplete="off"><div class="fg-emoji-categories" role="group" aria-label="Emoji categories"></div><div class="fg-emoji-grid" role="group" aria-label="Available emojis"></div><p class="fg-emoji-feedback" role="status" aria-live="polite"></p>';
 document.body.append(picker);
 const search=picker.querySelector('.fg-emoji-search'),grid=picker.querySelector('.fg-emoji-grid'),cats=picker.querySelector('.fg-emoji-categories'),hint=picker.querySelector('.fg-emoji-feedback');
 let currentTarget=null;
 function hidePicker(){
  if(typeof picker.hidePopover==='function'&&picker.matches(':popover-open'))picker.hidePopover();
  picker.classList.remove('fg-emoji-fallback');
 }
 function applyEmoji(emoji){
  const input=currentTarget&&currentTarget.isConnected&&allowed(currentTarget)?currentTarget:lastField;
  if(!input||!allowed(input)){hint.textContent='Tap an editable text field first.';return}
  const start=input===lastField&&Number.isInteger(caretStart)?caretStart:input.value.length;
  const end=input===lastField&&Number.isInteger(caretEnd)?caretEnd:start;
  const max=input.maxLength>=0?input.maxLength:Infinity;
  if(input.value.length-(end-start)+emoji.length>max){
   hint.textContent='This field has reached its character limit.';return;
  }
  if(typeof input.setRangeText==='function')input.setRangeText(emoji,start,end,'end');
  else input.value=input.value.slice(0,start)+emoji+input.value.slice(end);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  hidePicker();input.focus({preventScroll:true});
  remember(input);
 }
 function showGrid(){
  grid.replaceChildren();
  const keyword=search.value.toLocaleLowerCase().trim();
  const all=keyword?Object.values(GROUPS).flat():GROUPS[activeGroup];
  const used=new Set();
  for(const [emoji,label] of all){
   if(used.has(emoji)||keyword&&!label.toLocaleLowerCase().includes(keyword))continue;
   used.add(emoji);
   const btn=document.createElement('button');btn.type='button';
   btn.className='fg-emoji-item';btn.textContent=emoji;
   btn.title=label;btn.setAttribute('aria-label','Insert '+label+' emoji');
   btn.addEventListener('click',()=>applyEmoji(emoji));
   grid.append(btn);
  }
  if(!grid.children.length){
   const empty=document.createElement('span');empty.className='fg-emoji-empty';
   empty.textContent='No matching emojis';grid.append(empty);
  }
 }
 for(const label of Object.keys(GROUPS)){
  const btn=document.createElement('button');btn.type='button';
  btn.className='fg-emoji-category';btn.textContent=label;
  btn.addEventListener('click',()=>{
   activeGroup=label;search.value='';updateGroups();showGrid();
  });
  cats.append(btn);
 }
 function updateGroups(){
  for(const btn of cats.children)btn.setAttribute('aria-pressed',String(btn.textContent===activeGroup));
 }
 function openPicker(target){
  if(allowed(target))remember(target);
  currentTarget=allowed(target)?target:(allowed(lastField)&&lastField.isConnected?lastField:null);
  hint.textContent=currentTarget?'':'Select an editable text field, then choose an emoji.';
  search.value='';activeGroup='Popular';updateGroups();showGrid();
  if(typeof picker.showPopover==='function'){
   if(!picker.matches(':popover-open'))picker.showPopover();
  }else{
   const dialog=currentTarget?.closest('dialog[open]');
   (dialog||document.body).append(picker);
   picker.classList.add('fg-emoji-fallback');
  }
  search.focus({preventScroll:true});
 }
 search.addEventListener('input',showGrid);
 picker.querySelector('.fg-emoji-close').addEventListener('click',hidePicker);
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&picker.classList.contains('fg-emoji-fallback'))hidePicker();
 });
 document.addEventListener('click',e=>{
  const openButton=e.target.closest?.('[data-fg-emoji-open]');
  if(openButton){e.preventDefault();openPicker(lastField);return}
  if(picker.classList.contains('fg-emoji-fallback')&&!picker.contains(e.target)&&!e.target.closest?.('.fg-emoji-near'))hidePicker();
 });
})();
