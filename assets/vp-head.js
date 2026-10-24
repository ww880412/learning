/*ICONS lucide v1.60.0 ISC*/window.__IC={"menu":"<path d=\"M4 5h16\"/><path d=\"M4 12h16\"/><path d=\"M4 19h16\"/>","x":"<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>","star":"<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\"/>","party-popper":"<path d=\"M5.8 11.3 2 22l10.7-3.79\"/><path d=\"M4 3h.01\"/><path d=\"M22 8h.01\"/><path d=\"M15 2h.01\"/><path d=\"M22 20h.01\"/><path d=\"m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10\"/><path d=\"m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17\"/><path d=\"m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7\"/><path d=\"M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z\"/>"};window.__ic=function(n,s,c){return '<svg class="i i-'+n+(c?' '+c:'')+'" width="'+(s||16)+'" height="'+(s||16)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(window.__IC[n]||'')+'</svg>'};/*END ICONS*/
(function(){var T='site-theme',v;try{v=localStorage.getItem(T)}catch(e){}if(!/^[ABC]$/.test(v||''))v='C';document.documentElement.setAttribute('data-theme',v);
window.__setTheme=function(t){var go=function(){__applyTheme(t)};if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.startViewTransition(go);else go()};window.__applyTheme=function(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem(T,t)}catch(e){}[].forEach.call(document.querySelectorAll('.thsw button'),function(b){b.setAttribute('aria-pressed',b.dataset.t===t)})}})();
(function(){var k='theme',s=localStorage.getItem(k);if(s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark');
window.__tt=function(){var f=function(){var d=document.documentElement.classList.toggle('dark');localStorage.setItem(k,d?'dark':'light')};if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.startViewTransition(f);else f()}})();
document.addEventListener('DOMContentLoaded',function(){var t=document.querySelector('.top .in'),dm=t&&t.querySelector('.dm');if(!t||t.querySelector('.menu'))return;var nav=t.querySelector('nav'),f=nav&&[].find.call(nav.querySelectorAll('a'),function(a){return a.textContent.trim()==='收藏'});
if(f&&!f.classList.contains('on')){var q=document.createElement('a');q.className='favq';q.href=f.getAttribute('href');q.title='收藏';q.setAttribute('aria-label','收藏');q.textContent='收藏';t.insertBefore(q,dm)}
var sw=document.createElement('div');sw.className='thsw';sw.setAttribute('role','group');sw.setAttribute('aria-label','切换风格');var cur=document.documentElement.getAttribute('data-theme'),NM={A:'杂志',B:'工作台',C:'卡片'};'ABC'.split('').forEach(function(x){var e=document.createElement('button');e.type='button';e.dataset.t=x;e.textContent=x;e.title='风格 '+x+' · '+NM[x];e.setAttribute('aria-pressed',x===cur);e.onclick=function(){__setTheme(x)};sw.appendChild(e)});t.insertBefore(sw,dm||null);
var b=document.createElement('button');b.type='button';b.className='menu';b.setAttribute('aria-label','菜单');b.innerHTML=__ic('menu',18);b.onclick=function(){var o=document.documentElement.classList.toggle('navopen');b.innerHTML=__ic(o?'x':'menu',18)};t.appendChild(b)});
/* ui-upgrade-2：数字滚动、滚动入场、悬停光斑、精选卡流光边框；prefers-reduced-motion 时全部跳过 */
(function(){var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;if(!RM&&'IntersectionObserver' in window)document.documentElement.classList.add('fx');
function count(el){var m=/^(\D*)(\d+)(\D*)$/.exec(el.textContent.trim());if(!m||el.dataset.fxc)return;el.dataset.fxc=1;var to=+m[2];if(to<2)return;var t0=performance.now(),D=Math.min(900,350+to*25);(function f(t){var k=Math.min(1,(t-t0)/D),e=1-Math.pow(1-k,3);el.textContent=m[1]+Math.round(to*e)+m[3];if(k<1)requestAnimationFrame(f)})(t0)}
window.addEventListener('load',function(){
 document.querySelectorAll('.fx-feat,.pri,main>.grid.wide>.card:first-child').forEach(function(e){e.classList.add('fx-glow')});
 if(RM)return;
 document.querySelectorAll('.ps-wall>*,.ps-st>*,.db-kpi>*,.db-grid>*,.ma-row>*,.ma-strip>*,main>.grid>*').forEach(function(e,i){var k=[].indexOf.call(e.parentNode.children,e);if(e.getBoundingClientRect().top<innerHeight){e.style.setProperty('--i',Math.min(k,10));e.classList.add('fx-st')}});
 setTimeout(function(){document.querySelectorAll('.kpi b,.stat b,.statline b,.kicker .n,.cnt').forEach(count)},60);
 var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('fx-in');io.unobserve(x.target)}})},{rootMargin:'0px 0px -6% 0px'});
 var vh=innerHeight;document.querySelectorAll('main>.kicker,main>.sub,main>.grid,main>.chips,main>.list,main>.empty,.home>.kicker,.home>.sub,.home>.grid,.home>.chips,.home>.list,.home>.empty,main>.sheet,.pgrid>*').forEach(function(e,i){if(e.getBoundingClientRect().top<vh)return;e.classList.add('fx-rv');io.observe(e)});
 addEventListener('scroll',function(){document.querySelectorAll('.fx-rv:not(.fx-in)').forEach(function(e){if(e.getBoundingClientRect().top<innerHeight){e.classList.add('fx-in');io.unobserve(e)}})},{passive:true});
 document.addEventListener('pointermove',function(ev){var c=ev.target.closest&&ev.target.closest('a.card,.crs,.pc');if(!c)return;var r=c.getBoundingClientRect();c.style.setProperty('--mx',ev.clientX-r.left+'px');c.style.setProperty('--my',ev.clientY-r.top+'px')},{passive:true});
})})();
/* 跨设备：#sync=<base64url 紧凑 JSON> 把 done: / rev-done: 合并进本机。不删已有记录，不改路径。 */
(function(){var DAY=/^\d{4}-\d{2}-\d{2}$/;
function isDate(s){if(typeof s!=='string'||!DAY.test(s))return false;var p=s.split('-'),y=+p[0],m=+p[1],d=+p[2],t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d}
function b64e(str){var bytes=new TextEncoder().encode(str),bin='',i;for(i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
function b64d(s){s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var bin=atob(s),bytes=new Uint8Array(bin.length),i;for(i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new TextDecoder().decode(bytes)}
function sortObj(o,num){var ks=Object.keys(o).sort(num?function(a,b){return (+a)-(+b)}:undefined),out={},i;for(i=0;i<ks.length;i++)out[ks[i]]=o[ks[i]];return out}
function okPath(p){return typeof p==='string'&&p.charAt(0)==='/'&&p.length<=400&&p.indexOf('..')<0&&!/[\u0000-\u001f\\]/.test(p)}
function okId(id){return typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(id)}
function okDay(day){return /^[1-9]\d{0,2}$/.test(String(day))}
function collect(){var d={},r={},i,k,v,o,day,m;for(i=0;i<localStorage.length;i++){k=localStorage.key(i);if(!k)continue;
 if(k.indexOf('done:')===0){v=localStorage.getItem(k);if(okPath(k.slice(5))&&isDate(v))d[k.slice(5)]=v}
 else if(k.indexOf('rev-done:')===0){if(!okId(k.slice(9)))continue;try{o=JSON.parse(localStorage.getItem(k)||'')}catch(e){o=null}if(!o||typeof o!=='object'||Array.isArray(o))continue;m={};for(day in o)if(okDay(day)&&isDate(o[day]))m[day]=o[day];if(Object.keys(m).length)r[k.slice(9)]=sortObj(m,1)}}
 var out={};if(Object.keys(d).length)out.d=sortObj(d);if(Object.keys(r).length)out.r=sortObj(r);return out}
function merge(obj){var n=0,d=obj.d||obj.done||{},r=obj.r||obj['rev-done']||{},path,id,day,raw,cur,prev,incoming,wrote,any;
 if(!d||typeof d!=='object'||Array.isArray(d))d={};if(!r||typeof r!=='object'||Array.isArray(r))r={};
 for(path in d){if(!okPath(path)||!isDate(d[path]))continue;try{raw=localStorage.getItem('done:'+path)}catch(e){continue}
  if(raw==null){try{localStorage.setItem('done:'+path,d[path])}catch(e){continue}}
  else if(isDate(raw)&&d[path]<raw){try{localStorage.setItem('done:'+path,d[path])}catch(e){continue}}
  n++}
 for(id in r){incoming=r[id];if(!okId(id)||!incoming||typeof incoming!=='object'||Array.isArray(incoming))continue;
  try{raw=localStorage.getItem('rev-done:'+id)}catch(e){continue}cur={};
  if(raw){try{cur=JSON.parse(raw);if(!cur||typeof cur!=='object'||Array.isArray(cur))continue}catch(e){continue}}
  wrote=!raw;any=0;for(day in incoming){if(!okDay(day)||!isDate(incoming[day]))continue;any=1;prev=cur[day];
   if(typeof prev==='string'&&isDate(prev)){if(incoming[day]<prev){cur[day]=incoming[day];wrote=1}}
   else if(prev==null){cur[day]=incoming[day];wrote=1}}
  if(!any)continue;if(wrote){try{localStorage.setItem('rev-done:'+id,JSON.stringify(sortObj(cur,1)))}catch(e){continue}}n++}
 return n}
function note(text,bad){var go=function(){var el=document.getElementById('sync-note');
 if(!el){el=document.createElement('p');el.id='sync-note';el.className='sync-note';el.setAttribute('role','status');var host=document.querySelector('.td-h')||document.querySelector('main');if(!host)return;if(host.classList.contains('td-h'))host.insertAdjacentElement('afterend',el);else host.insertBefore(el,host.firstChild)}
 el.hidden=false;el.classList.toggle('bad',!!bad);el.textContent=text};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go()}
function take(){var h=location.hash;if(!h||h.indexOf('sync=')<0)return;var q=h.charAt(0)==='#'?h.slice(1):h,enc='';
 try{enc=new URLSearchParams(q).get('sync')||''}catch(e){enc=''}if(!enc&&q.indexOf('sync=')===0)enc=q.slice(5).split('&')[0];
 try{enc=decodeURIComponent(enc)}catch(e){}var msg='同步链接无法识别',bad=1;
 try{if(!enc||enc.length>100000)throw 0;var obj=JSON.parse(b64d(enc));if(!obj||typeof obj!=='object'||Array.isArray(obj))throw 0;msg='已同步 '+merge(obj)+' 条记录';bad=0}catch(e){}
 try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}note(msg,bad)}
window.__sync={encode:function(o){return b64e(JSON.stringify(o))},collect:collect,merge:merge};take()})();
