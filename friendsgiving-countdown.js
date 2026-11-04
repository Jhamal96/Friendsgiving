(()=>{'use strict';
// Friendsgiving begins Saturday, November 14, 2026 at 11:30 AM in Miami.
// Miami observes EST (UTC-5) in November. Keep the target absolute so every
// visitor, regardless of their device time zone, sees the same seconds left.
const kickoff=Date.parse('2026-11-14T11:30:00-05:00');
const zone='America/New_York';
const root=document.getElementById('friendsgivingCountdown');
const message=document.getElementById('friendsgivingHeroMessage');
const label=document.getElementById('friendsgivingCountdownLabel');
if(!root||!message||!label)return;
const fields={
 days:document.getElementById('fgDays'),
 hours:document.getElementById('fgHours'),
 minutes:document.getElementById('fgMinutes'),
 seconds:document.getElementById('fgSeconds')
};
const base='Get ready for good food, great company, games, and a little friendly competition. We can\'t wait to see you!';
const ordinalDate=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
function dateKey(timestamp){
 const parts=ordinalDate.formatToParts(new Date(timestamp));
 const year=Number(parts.find(x=>x.type==='year')?.value);
 const month=Number(parts.find(x=>x.type==='month')?.value);
 const day=Number(parts.find(x=>x.type==='day')?.value);
 return Math.floor(Date.UTC(year,month-1,day)/86400000);
}
const kickoffDay=dateKey(kickoff);
function render(){
 const now=Date.now();
 const remaining=Math.max(0,kickoff-now);
 const daysUntil=kickoffDay-dateKey(now);
 let intro;
 if(daysUntil>1)intro='In '+daysUntil+' days, we celebrate Year 3 of Friendsgiving!';
 else if(daysUntil===1)intro='Tomorrow, we celebrate Year 3 of Friendsgiving!';
 else if(daysUntil===0&&remaining>0)intro='Today, we celebrate Year 3 of Friendsgiving!';
 else if(remaining===0&&daysUntil===0)intro='It\'s Friendsgiving! Year 3 starts now!';
 else intro='Thank you for celebrating Year 3 of Friendsgiving!';
 message.textContent=intro+' '+(daysUntil<0?'One squad. One table.':base);
 if(remaining===0){
  root.classList.add('is-complete');
  label.textContent=daysUntil> -1?'MISSION DAY · LET\'S CELEBRATE!':'MISSION COMPLETE · THANK YOU, SQUAD!';
  return;
 }
 root.classList.remove('is-complete');
 label.textContent=daysUntil===0?'TODAY IS THE DAY!':daysUntil===1?'TOMORROW · SQUAD UP!':'COUNTDOWN TO FRIENDSGIVING';
 const hours=Math.floor(remaining/3600000)%24;
 const minutes=Math.floor(remaining/60000)%60;
 const seconds=Math.floor(remaining/1000)%60;
 fields.days.textContent=String(Math.floor(remaining/86400000)).padStart(2,'0');
 fields.hours.textContent=String(hours).padStart(2,'0');
 fields.minutes.textContent=String(minutes).padStart(2,'0');
 fields.seconds.textContent=String(seconds).padStart(2,'0');
}
render();
// Recalculate with Date.now() on each tick: switching tabs or putting a phone
// to sleep cannot make the countdown drift.
setInterval(render,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
})();
