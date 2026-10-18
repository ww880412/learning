(function(){var T='site-theme',v;try{v=localStorage.getItem(T)}catch(e){}if(!/^[ABC]$/.test(v||''))v='C';document.documentElement.setAttribute('data-theme',v);
window.__setTheme=function(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem(T,t)}catch(e){}[].forEach.call(document.querySelectorAll('.thsw button'),function(b){b.setAttribute('aria-pressed',b.dataset.t===t)})}})();
(function(){var k='theme',s=localStorage.getItem(k);if(s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark');
window.__tt=function(){var d=document.documentElement.classList.toggle('dark');localStorage.setItem(k,d?'dark':'light')}})();
document.addEventListener('DOMContentLoaded',function(){var t=document.querySelector('.top .in'),dm=t&&t.querySelector('.dm');if(!t||t.querySelector('.menu'))return;var nav=t.querySelector('nav'),f=nav&&[].find.call(nav.querySelectorAll('a'),function(a){return a.textContent.trim()==='收藏'});
if(f&&!f.classList.contains('on')){var q=document.createElement('a');q.className='favq';q.href=f.getAttribute('href');q.title='收藏';q.setAttribute('aria-label','收藏');q.textContent='收藏';t.insertBefore(q,dm)}
var sw=document.createElement('div');sw.className='thsw';sw.setAttribute('role','group');sw.setAttribute('aria-label','切换风格');var cur=document.documentElement.getAttribute('data-theme'),NM={A:'杂志',B:'工作台',C:'卡片'};'ABC'.split('').forEach(function(x){var e=document.createElement('button');e.type='button';e.dataset.t=x;e.textContent=x;e.title='风格 '+x+' · '+NM[x];e.setAttribute('aria-pressed',x===cur);e.onclick=function(){__setTheme(x)};sw.appendChild(e)});t.insertBefore(sw,dm||null);
var b=document.createElement('button');b.type='button';b.className='menu';b.setAttribute('aria-label','菜单');b.textContent='☰';b.onclick=function(){var o=document.documentElement.classList.toggle('navopen');b.textContent=o?'✕':'☰'};t.appendChild(b)});
/* ui-upgrade-2：数字滚动、滚动入场、悬停光斑、精选卡流光边框；prefers-reduced-motion 时全部跳过 */
(function(){var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;if(!RM&&'IntersectionObserver' in window)document.documentElement.classList.add('fx');
function count(el){var m=/^(\D*)(\d+)(\D*)$/.exec(el.textContent.trim());if(!m||el.dataset.fxc)return;el.dataset.fxc=1;var to=+m[2];if(to<2)return;var t0=performance.now(),D=Math.min(900,350+to*25);(function f(t){var k=Math.min(1,(t-t0)/D),e=1-Math.pow(1-k,3);el.textContent=m[1]+Math.round(to*e)+m[3];if(k<1)requestAnimationFrame(f)})(t0)}
window.addEventListener('load',function(){
 document.querySelectorAll('.fx-feat,.pri,main>.grid.wide>.card:first-child').forEach(function(e){e.classList.add('fx-glow')});
 if(RM)return;
 setTimeout(function(){document.querySelectorAll('.kpi b,.stat b,.statline b,.kicker .n,.cnt').forEach(count)},60);
 var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('fx-in');io.unobserve(x.target)}})},{rootMargin:'0px 0px -6% 0px'});
 var vh=innerHeight;document.querySelectorAll('main>.kicker,main>.sub,main>.grid,main>.chips,main>.list,main>.empty,.home>.kicker,.home>.sub,.home>.grid,.home>.chips,.home>.list,.home>.empty,main>.sheet,.pgrid>*').forEach(function(e,i){if(e.getBoundingClientRect().top<vh)return;e.classList.add('fx-rv');io.observe(e)});
 addEventListener('scroll',function(){document.querySelectorAll('.fx-rv:not(.fx-in)').forEach(function(e){if(e.getBoundingClientRect().top<innerHeight){e.classList.add('fx-in');io.unobserve(e)}})},{passive:true});
 document.addEventListener('pointermove',function(ev){var c=ev.target.closest&&ev.target.closest('a.card,.crs,.pc');if(!c)return;var r=c.getBoundingClientRect();c.style.setProperty('--mx',ev.clientX-r.left+'px');c.style.setProperty('--my',ev.clientY-r.top+'px')},{passive:true});
})})();
