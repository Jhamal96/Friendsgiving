(()=>{'use strict';
const wrap=document.getElementById('fgLoader'),video=document.getElementById('fgOpeningVideo'),skip=document.getElementById('fgSkip');
if(!wrap||!video||!skip)return;
const onceKey='friendsgiving-admin-opening-played-v1';
let started=false,finished=false,watchdog=null,fallbackTimer=null;
function safeRead(){try{return sessionStorage.getItem(onceKey)==='yes'}catch{return false}}
function safeWrite(){try{sessionStorage.setItem(onceKey,'yes')}catch{}}
function reveal(){
 if(finished)return;
 finished=true;
 window.clearTimeout(watchdog);
 window.clearTimeout(fallbackTimer);
 try{video.pause()}catch{}
 safeWrite();
 document.body.classList.add('fg-admin-reveal');
 wrap.classList.add('is-done');
 window.setTimeout(()=>{
  wrap.remove();
  document.body.classList.remove('fg-admin-reveal');
 },1200);
}
function visualFallback(){
 // A preload failure may occur while the acknowledgment dialogs are still open.
 // Never display the opener or fallback until the dialogs have finished.
 if(!started||finished)return;
 wrap.classList.add('fg-video-error');
 fallbackTimer=window.setTimeout(reveal,1900);
}
function begin(){
 if(started||finished)return;
 started=true;
 if(safeRead()){wrap.remove();return}
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){reveal();return}
 wrap.classList.add('is-playing');
 watchdog=window.setTimeout(reveal,18000);
 if(video.error){visualFallback();return}
 try{
  video.currentTime=0;
  const promise=video.play();
  if(promise&&typeof promise.catch==='function')promise.catch(visualFallback);
 }catch{visualFallback()}
}
skip.addEventListener('click',reveal);
video.addEventListener('ended',reveal);
video.addEventListener('error',visualFallback);
window.addEventListener('friendsgiving:admin-intro-acknowledged',begin,{once:true});
// Avoid trapping the admin behind video if another script fails to initialize.
window.setTimeout(()=>{if(!started&&!finished&&!document.getElementById('adminUpdates')?.open&&!document.getElementById('adminAbout')?.open)begin()},12000);
})();
