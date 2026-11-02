(()=>{'use strict';
// iOS Safari does not support a programmable Add-to-Home-Screen prompt.
// Provide short steps inside the existing Settings dialog instead.
const ua=navigator.userAgent||'';
const ios=/iPad|iPhone|iPod/.test(ua) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
if(!ios)return;
const installed=window.navigator.standalone===true || window.matchMedia('(display-mode: standalone)').matches;
if(installed)return;
const dialog=document.querySelector('#guestSettings,#pageSettings,#plannerHelp,#teamsHelp,#responsesSettings');
if(!dialog)return;
const admin=location.pathname.startsWith('/admin');
const label=admin?'Install Mission Control':'Install Friendsgiving';
const container=document.createElement('div');
container.className='fg-ios-install';
container.style.cssText='margin:15px 0;padding:12px 14px;background:#153554;border:1px solid #5c87b0;border-left:4px solid #ffd630;border-radius:9px;color:#f4f8ff;line-height:1.5';
const button=document.createElement('button');
button.type='button';
button.className='fg-ios-install-toggle';
button.textContent='＋ '+label+' on iPhone / iPad';
button.style.cssText='display:block;width:100%;text-align:left;min-height:44px;padding:10px 12px;background:#203d5e;color:#ffe18b;border:1px solid #7495b7;border-radius:7px;font:700 14px system-ui;cursor:pointer';
button.setAttribute('aria-expanded','false');
const instructions=document.createElement('p');
instructions.hidden=true;
instructions.style.cssText='margin:10px 0 0;color:#f1f6fd;font-size:14px;overflow-wrap:anywhere';
const isSafari=/Safari/.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
instructions.textContent=isSafari
 ?'In Safari, tap Share (the square with an upward arrow), choose Add to Home Screen, then tap Add. '+(admin?'Use this admin page to install the separate FG Admin app.':'This installs the public Friendsgiving app separately from FG Admin.')
 :'Open this page in Safari, tap Share, then choose Add to Home Screen and Add. You cannot complete iOS installation from this browser.';
button.addEventListener('click',()=>{
 instructions.hidden=!instructions.hidden;
 button.setAttribute('aria-expanded',String(!instructions.hidden));
});
container.append(button,instructions);
const title=dialog.querySelector('h2');
if(title)title.insertAdjacentElement('afterend',container);
else dialog.prepend(container);
})();
