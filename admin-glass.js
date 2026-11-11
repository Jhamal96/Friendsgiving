/* Friendsgiving private admin appearance. Never load on the public event page. */
(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.remove('fg-admin-glass-on'); // Reset to off on every load.
  let tint = 8;
  try {
    const stored = localStorage.getItem('fg_admin_glass_tint_v1');
    if (stored !== null && Number.isFinite(+stored)) tint = Math.max(0,Math.min(100,+stored));
  } catch (_) {}
  function install() {
    const target = document.querySelector('#pageSettings,#plannerHelp,#responsesSettings,#teamsHelp');
    const section = document.createElement('section');
    section.className = 'fg-glass-settings';
    section.id = 'fgGlassSettings';
    section.setAttribute('aria-label','Liquid Glass appearance settings');
    section.innerHTML = '<h3>Liquid Glass</h3><p>Crystal-clear admin panels with readable text. Off each time you open a page.</p><label for="fgGlassOn">Enable Liquid Glass <input type="checkbox" id="fgGlassOn" role="switch"></label><label for="fgGlassTint">Tint and blur</label><input id="fgGlassTint" type="range" min="0" max="100" step="1" value="8"><div class="fg-glass-meter"><span>Clear</span><output id="fgGlassValue" for="fgGlassTint">8%</output><span>Tinted</span></div><p class="fg-glass-note">Use low tint to see through panels. Text contrast is maintained; reduced-transparency preferences are respected.</p>';
    let dialog = null;
    if (target) {
      target.appendChild(section);
    } else {
      dialog = document.createElement('dialog');
      dialog.id = 'fgGlassDialog';
      dialog.setAttribute('aria-labelledby','fgGlassDialogTitle');
      const heading = document.createElement('h2');
      heading.id = 'fgGlassDialogTitle';
      heading.textContent = 'Appearance settings';
      dialog.appendChild(heading);
      dialog.appendChild(section);
      const close = document.createElement('button');
      close.type='button';close.className='fg-glass-close';close.textContent='Close';
      close.addEventListener('click',()=>dialog.close());
      dialog.appendChild(close);
      document.body.appendChild(dialog);
      const button = document.createElement('button');
      button.type='button';button.className='fg-glass-trigger';
      button.setAttribute('aria-label','Appearance settings');button.title='Appearance settings';
      button.textContent='⚙';
      button.addEventListener('click',()=>{if (!dialog.open) dialog.showModal();});
      const headerActions = document.querySelector('.admin-top .top-actions, .admin-top');
      if (headerActions) headerActions.appendChild(button);
      else document.body.prepend(button);
    }
    const toggle = section.querySelector('#fgGlassOn');
    const range = section.querySelector('#fgGlassTint');
    const output = section.querySelector('#fgGlassValue');
    range.value=String(tint);
    function apply() {
      root.classList.toggle('fg-admin-glass-on',toggle.checked);
      root.style.setProperty('--fg-glass-alpha',(0.015 + tint*.0018).toFixed(3));
      root.style.setProperty('--fg-glass-blur',(tint*.025).toFixed(1)+'px');
      output.value=String(tint)+'%';
    }
    toggle.checked = false; // Never restore "on" across page loads.
    toggle.addEventListener('change',apply);
    range.addEventListener('input',()=>{
      tint = Number(range.value);
      try {localStorage.setItem('fg_admin_glass_tint_v1',String(tint));} catch (_) {}
      apply();
    });
    apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();