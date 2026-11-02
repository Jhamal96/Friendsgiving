(()=>{'use strict';
const root=document.documentElement;
const portrait=window.matchMedia('(orientation:portrait)');
const coarse=window.matchMedia('(pointer:coarse)');
let scheduled=false;
function update(){
 scheduled=false;
 // Viewport dimensions, rather than user-agent strings, also support tablets,
 // foldables, desktop resizing, and device rotation.
 const width=window.innerWidth||root.clientWidth;
 const height=window.innerHeight||root.clientHeight;
 root.dataset.device=width<=700?'phone':width<=1024?'tablet':'desktop';
 root.dataset.orientation=portrait.matches?'portrait':'landscape';
 root.dataset.input=coarse.matches?'touch':'pointer';
 root.style.setProperty('--fg-screen-h',height+'px');
}
function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(update)}}
update();
window.addEventListener('resize',schedule,{passive:true});
window.addEventListener('orientationchange',schedule,{passive:true});
if(window.visualViewport)window.visualViewport.addEventListener('resize',schedule,{passive:true});
const video=document.getElementById('fgOpeningVideo');
if(video){
 const syncVideo=()=>{
  if(video.videoWidth&&video.videoHeight){
   root.dataset.videoOrientation=video.videoWidth>=video.videoHeight?'landscape':'portrait';
   root.style.setProperty('--fg-video-ratio',String(video.videoWidth/video.videoHeight));
  }
 };
 video.addEventListener('loadedmetadata',syncVideo);
 syncVideo();
}
})();