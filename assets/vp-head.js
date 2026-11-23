/*ICONS lucide v1.60.0 ISC*/window.__IC={"menu":"<path d=\"M4 5h16\"/><path d=\"M4 12h16\"/><path d=\"M4 19h16\"/>","x":"<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>","star":"<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\"/>","party-popper":"<path d=\"M5.8 11.3 2 22l10.7-3.79\"/><path d=\"M4 3h.01\"/><path d=\"M22 8h.01\"/><path d=\"M15 2h.01\"/><path d=\"M22 20h.01\"/><path d=\"m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10\"/><path d=\"m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17\"/><path d=\"m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7\"/><path d=\"M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z\"/>"};window.__ic=function(n,s,c){return '<svg class="i i-'+n+(c?' '+c:'')+'" width="'+(s||16)+'" height="'+(s||16)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(window.__IC[n]||'')+'</svg>'};/*END ICONS*/
/* 王玮的学习库 · V4 共享页首脚本：深浅色切换（键 theme）、全站目录抽屉、通用筛选、图片灯箱、折叠锚点、兼容 bot 旧顶栏 */
(function(){
  var k='theme',root=document.documentElement,s=null;
  try{s=localStorage.getItem(k)}catch(e){}
  if(s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches)root.classList.add('dark');
  function syncThemeUI(){
    var d=root.classList.contains('dark');
    document.querySelectorAll('[data-theme-toggle],.top .dm').forEach(function(btn){
      btn.setAttribute('aria-pressed',String(d));
      btn.setAttribute('aria-label',d?'切换到浅色模式':'切换到深色模式');
      var sun=btn.querySelector('.i-sun'),moon=btn.querySelector('.i-moon');
      if(sun)sun.style.display=d?'inline-block':'none';
      if(moon)moon.style.display=d?'none':'inline-block';
    });
  }
  window.__tt=function(){
    var f=function(){
      var d=root.classList.toggle('dark');
      try{localStorage.setItem(k,d?'dark':'light')}catch(e){}
      syncThemeUI();
    };
    if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.startViewTransition(f);
    else f();
  };
  document.addEventListener('DOMContentLoaded',syncThemeUI);
})();
document.addEventListener('DOMContentLoaded',function(){
  /* 1. 兼容 bot 生成页（x-brief / x-posters）的旧顶栏 .top:not(.site-header)：不注入 A/B/C 切换，提供手机菜单与全站目录入口 */
  var legacyTop=document.querySelector('header.top:not(.site-header) .in');
  if(legacyTop&&!legacyTop.querySelector('.menu')){
    var dm=legacyTop.querySelector('.dm');
    var nav=legacyTop.querySelector('nav');
    var favLink=nav&&[].find.call(nav.querySelectorAll('a'),function(a){return a.textContent.trim()==='收藏'});
    if(favLink&&!favLink.classList.contains('on')){
      var q=document.createElement('a');q.className='favq';q.href=favLink.getAttribute('href');q.title='收藏';q.setAttribute('aria-label','收藏');q.textContent='收藏';
      legacyTop.insertBefore(q,dm||null);
    }
    var atlasBtn=document.createElement('button');atlasBtn.type='button';atlasBtn.className='hdr-btn legacy-atlas';atlasBtn.setAttribute('data-open-atlas','');atlasBtn.setAttribute('aria-label','打开全站目录');
    atlasBtn.innerHTML='<span>全站目录</span><kbd>/</kbd>';
    legacyTop.insertBefore(atlasBtn,dm||null);
    var mb=document.createElement('button');mb.type='button';mb.className='menu';mb.setAttribute('aria-label','菜单');mb.innerHTML=__ic('menu',18);
    mb.onclick=function(){var o=document.documentElement.classList.toggle('navopen');mb.innerHTML=__ic(o?'x':'menu',18)};
    legacyTop.appendChild(mb);
  }

  /* 2. 全站目录抽屉（/ 或 ⌘K / Ctrl+K） */
  function detectBase(){
    var dr=document.body&&document.body.getAttribute('data-root');
    if(dr!==null&&dr!==undefined)return dr;
    var brand=document.querySelector('header a.brand');
    if(brand){var h=brand.getAttribute('href')||'';return h.replace(/index\.html$/,'');}
    return '';
  }
  function defaultAtlas(){
    return [
      {title:'每日信号与参考',items:[
        {name:'首页 · 今日',href:'index.html',meta:'今日与总目'},
        {name:'每日汇总',href:'digest/index.html',meta:'早间合刊'},
        {name:'X 简报',href:'x-brief/index.html',meta:'每日更新'},
        {name:'X 海报',href:'x-posters/index.html',meta:'每日更新'},
        {name:'产品灵感',href:'ph-inspo/index.html',meta:'PH 日榜'},
        {name:'雷达',href:'radar/index.html',meta:'开源参考'}
      ]},
      {title:'长期精学',items:[
        {name:'公开课',href:'courses/index.html',meta:'大学公开课'},
        {name:'X 好文',href:'x-posts/index.html',meta:'长文精读'},
        {name:'技术研究',href:'research/index.html',meta:'专题调研'},
        {name:'微信公众号',href:'wechat/index.html',meta:'深度长文'},
        {name:'视频',href:'video/index.html',meta:'讲座工作坊'}
      ]},
      {title:'索引与个人',items:[
        {name:'概念卡',href:'glossary.html',meta:'跨栏目术语'},
        {name:'DSH 插件',href:'dsh-plugins/index.html',meta:'市场盘点'},
        {name:'收藏与同步设置',href:'favorites/index.html',meta:'个人索引'}
      ]}
    ];
  }
  var atlasDialog=null;
  function ensureAtlas(){
    if(atlasDialog)return atlasDialog;
    var base=detectBase();
    var groups=(Array.isArray(window.__ATLAS)&&window.__ATLAS.length)?window.__ATLAS:defaultAtlas();
    atlasDialog=document.createElement('dialog');
    atlasDialog.className='atlas-dialog';
    atlasDialog.setAttribute('aria-label','全站栏目目录索引');
    atlasDialog.innerHTML=
      '<div class="atlas-head">'+
        '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>'+
        '<input type="search" placeholder="筛选全部栏目与入口…" aria-label="筛选全站栏目" autocomplete="off">'+
        '<button type="button" class="btn sm" data-atlas-close>关闭</button>'+
      '</div>'+
      '<div class="atlas-body"></div>';
    var body=atlasDialog.querySelector('.atlas-body');
    var input=atlasDialog.querySelector('input');
    function render(query){
      var q=(query||'').trim().toLowerCase();
      body.innerHTML='';
      var total=0;
      groups.forEach(function(g){
        var matched=(g.items||[]).filter(function(it){
          return !q||(String(it.name||'')+' '+String(it.meta||'')+' '+String(it.kw||'')).toLowerCase().indexOf(q)>=0;
        });
        if(!matched.length)return;
        total+=matched.length;
        var col=document.createElement('div');col.className='atlas-col';
        var h3=document.createElement('h3');h3.textContent=g.title;col.appendChild(h3);
        matched.forEach(function(it){
          var a=document.createElement('a');a.className='atlas-link';
          a.href=base+it.href;
          var sp=document.createElement('span');sp.textContent=it.name;
          var em=document.createElement('em');em.textContent=it.meta||'';
          a.appendChild(sp);a.appendChild(em);col.appendChild(a);
        });
        body.appendChild(col);
      });
      if(!total){
        var empty=document.createElement('p');
        empty.style.cssText='grid-column:1/-1;color:var(--ink-3);margin:12px 0;font-size:14.5px';
        empty.textContent='没有匹配的栏目，请换个关键词试试。';
        body.appendChild(empty);
      }
    }
    render('');
    input.addEventListener('input',function(){render(input.value)});
    atlasDialog.querySelector('[data-atlas-close]').addEventListener('click',function(){atlasDialog.close()});
    atlasDialog.addEventListener('click',function(e){if(e.target===atlasDialog)atlasDialog.close()});
    document.body.appendChild(atlasDialog);
    return atlasDialog;
  }
  function openAtlas(){
    var d=ensureAtlas();
    if(!d.open){
      d.showModal();
      var input=d.querySelector('input');
      if(input){input.value='';input.dispatchEvent(new Event('input'));input.focus();}
    }
  }
  window.__openAtlas=openAtlas;
  document.querySelectorAll('[data-open-atlas]').forEach(function(btn){btn.addEventListener('click',openAtlas)});
  document.addEventListener('keydown',function(e){
    var tag=(e.target&&e.target.tagName||'').toLowerCase();
    var editing=tag==='input'||tag==='textarea'||tag==='select'||(e.target&&e.target.isContentEditable);
    if((e.key==='k'||e.key==='K')&&(e.metaKey||e.ctrlKey)){e.preventDefault();openAtlas();}
    else if(e.key==='/'&&!editing&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();openAtlas();}
  });

  /* 3. 通用分类过滤 + 关键词搜索（首页馆藏总目 / X 好文等） */
  document.querySelectorAll('[data-filter-scope]').forEach(function(scope){
    var tabs=[].slice.call(scope.querySelectorAll('[data-filter-tab]'));
    var input=scope.querySelector('[data-filter-input]');
    var items=[].slice.call(scope.querySelectorAll('[data-filter-item]'));
    var groups=[].slice.call(scope.querySelectorAll('[data-filter-group]'));
    var countEl=scope.querySelector('[data-filter-count]');
    var emptyEl=scope.querySelector('[data-filter-empty]');
    var active='all';
    function apply(){
      var q=input?input.value.trim().toLowerCase():'';
      var visible=0;
      items.forEach(function(el){
        var cats=(el.getAttribute('data-cats')||'').split(/\s+/);
        var hay=(el.getAttribute('data-hay')||el.textContent||'').toLowerCase();
        var show=(active==='all'||cats.indexOf(active)>=0)&&(!q||hay.indexOf(q)>=0);
        el.hidden=!show;
        if(show)visible++;
      });
      groups.forEach(function(g){g.hidden=!g.querySelector('[data-filter-item]:not([hidden])')});
      if(countEl)countEl.textContent='显示 '+visible+' / '+items.length;
      if(emptyEl)emptyEl.hidden=visible>0;
    }
    tabs.forEach(function(tab){
      tab.addEventListener('click',function(){
        active=tab.getAttribute('data-filter-tab')||'all';
        tabs.forEach(function(t){t.setAttribute('aria-pressed',String(t===tab))});
        apply();
      });
    });
    if(input)input.addEventListener('input',apply);
    apply();
  });

  /* 4. 原生图片灯箱：data-lightbox 属性，以及海报页既有的 a.thumb（点击看大图） */
  function openLightbox(src, cap, focusEl){
    if(!src)return;
    cap=cap||'查看原图';
    var dlg=document.createElement('dialog');dlg.className='lightbox-dialog';dlg.setAttribute('aria-label',cap);
    dlg.innerHTML='<div class="lb-bar"><span></span><button type="button" class="lb-close">关闭</button></div><div class="lb-body"><img alt=""></div>';
    dlg.querySelector('.lb-bar span').textContent=cap;
    var img=dlg.querySelector('img');img.src=src;img.alt=cap;
    dlg.querySelector('.lb-close').addEventListener('click',function(){dlg.close()});
    dlg.addEventListener('click',function(e){if(e.target===dlg||e.target.classList.contains('lb-body'))dlg.close()});
    dlg.addEventListener('close',function(){dlg.remove();if(focusEl&&focusEl.focus)focusEl.focus()});
    document.body.appendChild(dlg);dlg.showModal();dlg.querySelector('.lb-close').focus();
  }
  document.querySelectorAll('[data-lightbox]').forEach(function(btn){
    btn.addEventListener('click',function(e){
      if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button)return;
      e.preventDefault();
      openLightbox(btn.getAttribute('data-lightbox'), btn.getAttribute('data-caption')||btn.getAttribute('aria-label')||'查看原图', btn);
    });
  });
  document.querySelectorAll('a.thumb').forEach(function(a){
    a.addEventListener('click',function(e){
      if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button)return;
      var href=a.getAttribute('href'); if(!href)return;
      e.preventDefault();
      var img=a.querySelector('img');
      openLightbox(href, (img&&img.getAttribute('alt'))||a.getAttribute('aria-label')||'查看原图', a);
    });
  });
});
/* 5. 链接指向收起来的内容（<details> 里）时，先展开再滚过去：简报栏目、雷达其余条目、产品灵感更早的榜单、收藏同步设置 */
(function(){
  function go(){
    var h=location.hash.slice(1);if(!h)return;
    var t;try{t=document.getElementById(decodeURIComponent(h))}catch(e){}
    if(!t)return;
    var d=t.closest('details'),inD=!!d;
    while(d){d.open=true;d=d.parentElement&&d.parentElement.closest('details')}
    if(inD){setTimeout(function(){t.scrollIntoView()},30);setTimeout(function(){t.scrollIntoView()},350)}
  }
  document.addEventListener('DOMContentLoaded',go);
  addEventListener('hashchange',go);
  document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="#"]');if(a&&a.getAttribute('href')===location.hash)setTimeout(go,0)});
})();
