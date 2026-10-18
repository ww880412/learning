#!/usr/bin/env node
// 用法：node build.mjs
// 从 data/*.json 生成：index.html、各栏目 index.html、主题 index.html、glossary.html、concepts/*.html、review.md
// 视觉沿用 xuexi-template 的设计变量（styles.css 的 :root），不改模板文件。
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const TPL = '/workspace/skills-src/xuexi-template/styles.css';
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const columns = J('columns.json'), { groups, items } = J('items.json'), concepts = J('concepts.json'), inbox = J('inbox.json');
const INTERVALS = [1, 3, 7, 14, 30];
// status「未开始」= 待学条目（href 指向原文/官方资料），不算学习页、不进复习队列、不进正在学/最近学过；无 group 时列在栏目页
const isPage = i => i.status !== '未开始';
const pages = items.filter(isPage);
// ---- 状态体系（规则见 README.md）----
// 未开始：没有学习页；进行中：学习页已上线，小测或复述未过；已学完：quiz.correct ≥ 5（6 题）且 retell=true；
// 已掌握：已学完，且第 14 天复习已完成（review.json 里 day 14 done=true），期间没有重置（item.reset 为空/0）。
const STATES = ['未开始', '进行中', '已学完', '已掌握'];
const STATE_CLS = { '未开始': '', '进行中': 'blue', '已学完': 'green', '已掌握': 'purple' };
let reviewRef = null;
function stateOf(it) {
  if (!isPage(it)) return '未开始';
  const passed = (it.quiz?.correct ?? 0) >= 5 && it.retell === true;
  if (!passed) return '进行中';
  const q = reviewRef?.queue.find(x => x.item === it.id);
  if (q && q.reviews.some(r => r.day === 14 && r.done) && !it.reset) return '已掌握';
  return '已学完';
}

// ---- 复习队列：保留已有记录（含 done），为新条目补排期 ----
const reviewPath = path.join(ROOT, 'data', 'review.json');
let review = fs.existsSync(reviewPath) ? JSON.parse(fs.readFileSync(reviewPath, 'utf8')) : { intervals: INTERVALS, queue: [] };
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
for (const it of items) {
  if (!isPage(it) || !it.start || review.queue.some(q => q.item === it.id)) continue;
  review.queue.push({ item: it.id, start: it.start, reviews: INTERVALS.map(n => ({ day: n, date: addDays(it.start, n), done: false })) });
}
fs.writeFileSync(reviewPath, JSON.stringify(review, null, 2) + '\n');
reviewRef = review;

// ---- 工具 ----
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rel = (fromFile, to) => { const r = path.relative(path.dirname(fromFile), to); return r || '.'; };
const itemById = Object.fromEntries(items.map(i => [i.id, i]));
const colById = Object.fromEntries(columns.map(c => [c.id, c]));
const conById = Object.fromEntries(concepts.map(c => [c.id, c]));
const THEME = fs.readFileSync(path.join(ROOT,'assets/site.css'),'utf8'), HEADJS = fs.readFileSync(path.join(ROOT,'assets/vp-head.js'),'utf8');
const CSS = '';
function page(file, title, active, body, script = '') {
  const r = p => rel(file, p);
  const nav = [['index.html', '首页', 'home'], ['favorites/index.html', '收藏', 'favorites'], ...columns.map((c, k) => [`${c.dir}/index.html`, c.title, c.id, items.filter(i => i.column === c.id).length, k ? '' : 's1']), ['glossary.html', '概念卡', 'glossary', concepts.length], ['x-brief/index.html', 'X 简报', 'x-brief', null, 's2'], ['x-posters/index.html', 'X 海报', 'x-posters']]
    .map(([h, t, id, n, sc]) => `<a href="${r(h)}" class="${[id === active ? 'on' : '', sc || ''].join(' ').trim()}">${esc(t)}${n != null ? `<em>${n}</em>` : ''}</a>`).join('');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 王玮的学习库</title><style>${CSS}${THEME}</style><script>${HEADJS}</script><script src="${r('assets/favorites.js')}" defer></script></head><body>
<header class="top"><div class="in"><a class="brand" href="${r('index.html')}"><i>学</i>王玮的学习库</a><nav>${nav}</nav><button class="dm" onclick="__tt()" aria-label="切换深色模式">◐</button></div></header>
<main>${body}<div class="foot"><span>王玮的学习库 · 每篇都是可翻页、可动手、带小测的学习页</span><span>由 build.mjs 从 data/ 生成</span></div></main>${script ? `<script>${script}</script>` : ''}<script>var __R='${r('index.html')}',__I=${JSON.stringify(Object.fromEntries(items.map(i=>[i.id,[i.href,stateOf(i)]]))).replace(/</g,'\\u003c')};(function(){const DONE=['已学完','已掌握'];const st=id=>{const v=__I[id];if(!v)return null;let s=v[1];if(s!=='已掌握'&&!/^https?:/.test(v[0])){try{if(localStorage.getItem('done:'+new URL(v[0],new URL(__R,location.href)).pathname))s='已学完'}catch(e){}}return s};document.querySelectorAll('a[href]').forEach(a=>{let k;try{k='done:'+new URL(a.getAttribute('href'),location.href).pathname}catch(e){return}const d=localStorage.getItem(k);if(!d)return;const box=a.closest('.row,.card');if(!box)return;const t=box.querySelector('.tag.st');if(t&&!/已掌握/.test(t.textContent)){t.textContent='已学完';t.className='tag st green'}});document.querySelectorAll('[data-doing]').forEach(g=>{const dn=[];g.querySelectorAll('a.card').forEach(a=>{try{if(localStorage.getItem('done:'+new URL(a.getAttribute('href'),location.href).pathname))dn.push(a)}catch(e){}});if(!dn.length)return;const w=document.createElement('div');w.innerHTML='<div class="kicker">已学完 <span class="n">'+dn.length+'</span></div><div class="sub">到了复习日会出现在上面的「今天该复习」</div><div class="grid wide"></div>';const gd=w.querySelector('.grid');dn.forEach(a=>{a.querySelectorAll('.meta span').forEach(x=>{if(/开始学/.test(x.textContent))x.textContent='复习 →'});gd.appendChild(a)});g.after(...w.childNodes);if(!g.querySelector('a.card'))g.outerHTML='<div class="empty"><b>现在没有进行中的内容</b></div>'});document.querySelectorAll('[data-ids]').forEach(el=>{const ss=el.dataset.ids.split(',').filter(Boolean).map(st).filter(Boolean);const n=ss.length,c=x=>ss.filter(s=>s===x).length;const k=el.dataset.k,b=el.querySelector('b');if(k==='done')b.textContent=ss.filter(s=>DONE.includes(s)).length;else if(k==='doing')b.textContent=c('进行中');else if(k.startsWith('st:'))b.textContent=c(k.slice(3));else if(k==='prog'){const is=el.querySelectorAll('.bar i');const w=x=>(n?x/n*100:0)+'%';is[0].style.width=w(c('已掌握'));is[1].style.width=w(c('已学完'));is[2].style.width=w(c('进行中'));const sp=el.querySelector(':scope>span');const bb=el.querySelector(':scope>b');if(bb)bb.textContent=(n?Math.round((c('已学完')+c('已掌握'))/n*100):0)+'%';sp.textContent='已学完 '+(c('已学完')+c('已掌握'))+'/'+n+(c('已掌握')?' · 已掌握 '+c('已掌握'):'')+(c('进行中')?' · 进行中 '+c('进行中'):'')}})})();</script></body></html>`;
}
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), s); console.log('wrote', f); };
const statusTag = s => `<span class="tag st ${STATE_CLS[s] ?? ''}">${esc(s)}</span>`;
const tagOf = it => statusTag(stateOf(it));
const countBy = arr => Object.fromEntries(STATES.map(k => [k, arr.filter(i => stateOf(i) === k).length]));
const progBar = arr => { const n = arr.length, c = countBy(arr), done = c['已学完'] + c['已掌握']; return `<div class="prog" data-k="prog" data-ids="${arr.map(i=>i.id).join(',')}"><div class="bar"><i class="g" style="width:${n ? c['已掌握'] / n * 100 : 0}%"></i><i class="l" style="width:${n ? c['已学完'] / n * 100 : 0}%"></i><i class="b" style="width:${n ? c['进行中'] / n * 100 : 0}%"></i></div><span>已学完 ${done}/${n}${c['已掌握'] ? ` · 已掌握 ${c['已掌握']}` : ''}${c['进行中'] ? ` · 进行中 ${c['进行中']}` : ''}</span></div>`; };
const stateStats = arr => { const c = countBy(arr); return STATES.map(k => `<div data-k="st:${k}" data-ids="${arr.map(i=>i.id).join(',')}" class="stat ${({'未开始':'','进行中':'blue','已学完':'green','已掌握':'purple'})[k]}"><b>${c[k]}</b><span>${k}</span></div>`).join(''); };
const itemCard = (file, it) => `<a class="card item" href="${rel(file, it.href)}">${it.preview ? `<div class="thumb"><img src="${rel(file, it.preview)}" alt="" loading="lazy"></div>` : ''}
<div class="meta" style="margin-top:0;padding-top:0"><span class="tag">${esc(it.label)}</span>${tagOf(it)}</div><h3>${esc(it.title)}</h3><p>${esc(it.note)}</p>
<div class="meta">开始于 ${esc(it.start)}${it.cards ? ` · ${it.cards} 张卡片` : ''}<span style="margin-left:auto;color:var(--blue);font-weight:700">开始学 →</span></div></a>`;
const emptyBox = (t, s) => `<div class="empty"><b>${t}</b>${s}</div>`;
const itemConcepts = id => concepts.filter(c => c.refs.some(r => r.item === id));

// ---- 首页 ----
{
  const f = 'index.html';
  const colCards = columns.map((c, k) => { const n = pages.filter(i => i.column === c.id).length; const pend = items.filter(i => i.column === c.id && !isPage(i)).length;
    const meta = n ? `<span class="tag blue">${n} 篇</span>` : (pend ? `<span class="tag">${pend} 篇未开始</span>` : '<span class="tag">还没有内容</span>');
    return `<a class="card c${k % 4 + 1}" href="${c.dir}/index.html"><span class="go">→</span><div class="ic">${c.icon}</div><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p><div class="meta">${meta}</div></a>`; }).join('')
    + `<a class="card c1" href="x-brief/index.html"><span class="go">→</span><div class="ic">📰</div><h3>X 简报</h3><p>每天一期的 X 中文简报，按日期翻往期。</p><div class="meta"><span class="tag blue">每日更新</span></div></a>`
    + `<a class="card c2" href="x-posters/index.html"><span class="go">→</span><div class="ic">🖼</div><h3>X 海报</h3><p>每天从 X 挑技术帖做成康奈尔笔记海报，附原帖信息。</p><div class="meta"><span class="tag blue">每日更新</span></div></a>`;
  const doing = items.filter(i => stateOf(i) === '进行中');
  const doneIts = items.filter(i => ['已学完','已掌握'].includes(stateOf(i)));
  const ord = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.start || '').localeCompare(b.start || '');
  // 一门课（主题）或一个栏目的散篇 = 一张课程卡：标题、粗进度条+百分比、下一课按钮、课时列表默认折叠
  const courseCards = (arr, emptyT) => { const units = [];
    for (const c of columns) { const its = arr.filter(i => i.column === c.id); if (!its.length) continue;
      for (const g of [...new Set(its.map(i => i.group).filter(Boolean))]) { const G = groups.find(x => x.id === g);
        units.push({ col: c, title: G?.title || g, href: G?.dir ? G.dir + '/index.html' : c.dir + '/index.html', all: items.filter(i => i.group === g).sort(ord) }); }
      if (its.some(i => !i.group)) units.push({ col: c, title: c.title, href: c.dir + '/index.html', all: items.filter(i => i.column === c.id && !i.group && isPage(i)).sort(ord), loose: true });
    }
    if (!units.length) return emptyBox(emptyT, '');
    return `<div class="grid wide">${units.map(u => { const n = u.all.length, cnt = countBy(u.all), done = cnt['已学完'] + cnt['已掌握'], pct = n ? Math.round(done / n * 100) : 0;
      const nx = u.all.find(i => stateOf(i) === '进行中') || u.all.find(i => !['已学完','已掌握'].includes(stateOf(i))) || u.all[0];
      const ext = h => /^https?:/.test(h) ? ` target="_blank" rel="noopener"` : '';
      const w = k => n ? cnt[k] / n * 100 : 0;
      return `<div class="card course"><div class="hd"><div style="flex:1;min-width:0"><div class="col">${u.col.icon} ${esc(u.col.title)}${u.loose ? ' · 单篇' : ' · 课程'}</div><h3><a href="${u.href}">${esc(u.title)}</a></h3></div></div>
<div class="bigbar prog" data-k="prog" data-ids="${u.all.map(i => i.id).join(',')}"><div class="bar"><i class="g" style="width:${w('已掌握')}%"></i><i class="l" style="width:${w('已学完')}%"></i><i class="b" style="width:${w('进行中')}%"></i></div><b>${pct}%</b><span hidden></span></div>
<div class="sm">已学完 ${done}/${n}${cnt['进行中'] ? ` · 进行中 ${cnt['进行中']}` : ''}${cnt['未开始'] ? ` · 未开始 ${cnt['未开始']}` : ''}</div>
${nx ? `<div class="next"><span class="sm">${['已学完','已掌握'].includes(stateOf(nx)) ? '可复习' : '下一课'}</span><a class="nt" href="${esc(nx.href)}"${ext(nx.href)}>${esc(nx.label)} · ${esc(nx.title)}</a><a class="btn" href="${esc(nx.href)}"${ext(nx.href)}>${['已学完','已掌握'].includes(stateOf(nx)) ? '去复习' : '继续学'} →</a></div>` : ''}
<details><summary>全部 ${n} ${u.loose ? '篇' : '讲'}</summary><ol>${u.all.map(i => `<li><a href="${esc(i.href)}"${ext(i.href)}>${esc(i.label)} · ${esc(i.title)}</a>${tagOf(i)}</li>`).join('')}</ol></details></div>`; }).join('')}</div>`; };
  const H1 = fp => { try { const m = fs.readFileSync(path.join(ROOT, fp), 'utf8').match(/<h1>([\s\S]*?)<\/h1>/); return m ? m[1].replace(/<[^>]+>/g, '') : ''; } catch { return ''; } };
  const briefs = (fs.existsSync(path.join(ROOT, 'x-brief')) ? fs.readdirSync(path.join(ROOT, 'x-brief')) : []).filter(x => /^\d{4}-\d\d-\d\d\.html$/.test(x)).sort().reverse().slice(0, 5).map(x => ({ d: x.slice(0, 10), t: H1('x-brief/' + x) }));
  const posters = (fs.existsSync(path.join(ROOT, 'x-posters')) ? fs.readdirSync(path.join(ROOT, 'x-posters')) : []).filter(x => /^\d{4}-\d\d-\d\d$/.test(x)).sort().reverse().slice(0, 5).map(x => { const h = fs.existsSync(path.join(ROOT, 'x-posters', x, 'index.html')) ? fs.readFileSync(path.join(ROOT, 'x-posters', x, 'index.html'), 'utf8') : ''; const ts = [...h.matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map(m => m[1]); return { d: x, n: ts.length, t: ts.slice(0, 3).join('；') + (ts.length > 3 ? '…' : '') }; });
  const inboxHtml = inbox.length ? `<div class="list">${inbox.map(x => `<div class="row"><span class="tag">${esc(colById[x.column]?.title || '未分类')}</span><span class="t"><a href="${esc(x.url)}">${esc(x.title || x.url)}</a></span><span class="d">${esc(x.added || '')}</span></div>`).join('')}</div>`
    : emptyBox('收件箱是空的', '看到想学的链接，丢到群里给学习搭子，它会先放在这里（data/inbox.json）。');
  const revData = JSON.stringify({ queue: review.queue, items: Object.fromEntries(items.map(i => [i.id, { title: i.title, label: i.label, href: i.href, col: colById[i.column]?.title || '', ic: colById[i.column]?.icon || '' }])) }).replace(/</g, '\\u003c');
  // ---- 三主题共用的首页骨架（A 杂志 / B 工作台 / C 学习卡片，靠 html[data-theme] 的 CSS 切换布局） ----
  const latestBrief = (() => { const fs0 = (fs.existsSync(path.join(ROOT, 'x-brief')) ? fs.readdirSync(path.join(ROOT, 'x-brief')) : []).filter(x => /^\d{4}-\d\d-\d\d\.html$/.test(x)).sort().reverse()[0]; if (!fs0) return null;
    const h = fs.readFileSync(path.join(ROOT, 'x-brief', fs0), 'utf8'); const secs = [...h.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)].map(m => ({ id: m[1], t: m[2].replace(/<[^>]+>/g, '').replace(/^\s*\d+\.\s*/, '').trim() })).filter(x => x.t);
    return { d: fs0.slice(0, 10), t: H1('x-brief/' + fs0), secs }; })();
  const latestPoster = (() => { const d = posters[0]?.d; if (!d) return null; const h = fs.readFileSync(path.join(ROOT, 'x-posters', d, 'index.html'), 'utf8');
    const imgs = [...h.matchAll(/<img src="([^"]+)" alt="([^"]*)"/g)].slice(0, 3).map(m => ({ src: `x-posters/${d}/${m[1]}`, alt: m[2] })); return { d, n: posters[0].n, imgs }; })();
  const ext = h => /^https?:/.test(h) ? ` target="_blank" rel="noopener"` : '';
  const courseRows = groups.map(G => { const all = items.filter(i => i.group === G.id).sort(ord); if (!all.length) return '';
    const n = all.length, cnt = countBy(all), done = cnt['已学完'] + cnt['已掌握'], pct = n ? Math.round(done / n * 100) : 0;
    const parts = G.title.split(' · '); const name = parts.reduce((a, b) => b.length > a.length ? b : a, ''); const src = parts.filter(p => p !== name).join(' · ');
    const nx = all.find(i => stateOf(i) === '进行中') || all.find(i => !['已学完', '已掌握'].includes(stateOf(i))) || all[0];
    const w = k => n ? cnt[k] / n * 100 : 0;
    const seg = all.map(i => { const s = stateOf(i); return `<i class="${['已学完', '已掌握'].includes(s) ? 'd' : s === '进行中' ? 'p' : ''}" title="${esc(i.label)} · ${esc(s)}"></i>`; }).join('');
    return `<div class="crs" style="--p:${pct};--q:${n ? Math.round((done + cnt['进行中']) / n * 100) : 0}"><div class="ring"><span>${pct}%</span></div><div class="cb"><div class="s">${esc(src)}</div><h3><a href="${esc(G.dir)}/index.html">${esc(name)}</a></h3><span class="pct">${pct}%</span>
<div class="bigbar prog" data-k="prog" data-ids="${all.map(i => i.id).join(',')}"><div class="bar"><i class="g" style="width:${w('已掌握')}%"></i><i class="l" style="width:${w('已学完')}%"></i><i class="b" style="width:${w('进行中')}%"></i></div><b hidden>${pct}%</b><span>已学完 ${done}/${n}${cnt['进行中'] ? ` · 进行中 ${cnt['进行中']}` : ''}</span></div>
<div class="seg">${seg}</div>
${nx ? `<a class="nx" href="${esc(nx.href)}"${ext(nx.href)}><b>${['已学完', '已掌握'].includes(stateOf(nx)) ? '去复习' : '下一讲'} ${esc(nx.label)}</b><span>${esc(nx.title)}</span></a>` : ''}</div></div>`; }).join('');
  const reading = doing.filter(i => !i.group);
  const colsCard = columns.map((c, k) => `<a class="hc c${k % 5 + 1}" href="${c.dir}/index.html"><i>${c.icon}</i><span>${esc(c.title)}</span><em>${items.filter(i => i.column === c.id).length}</em></a>`).join('');
  // ---- 首页：三套布局（A 杂志 / B 仪表盘 / C 个人站）同时渲染，按 html[data-theme] 只显示一套；数据全部来自 data/ 与 x-brief / x-posters ----
  const T = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const BR = (() => { if (!latestBrief) return null; const h = fs.readFileSync(path.join(ROOT, 'x-brief', latestBrief.d + '.html'), 'utf8');
    const secs = h.split(/<h2 id="/).slice(1).map(x => { const id = x.slice(0, x.indexOf('"')); const t = T(x.slice(x.indexOf('>') + 1, x.indexOf('</h2>'))).replace(/^\d+\.\s*/, '');
      const p = (x.match(/<p>([\s\S]*?)<\/p>/) || [])[1]; const tip = (x.match(/<p class="tip">([\s\S]*?)<\/p>/) || [])[1]; const h3 = [...x.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(m => T(m[1]));
      return { id, t, p: T(p), tip: T(tip).replace(/^💡\s*(一句话：)?/, ''), h3 }; }).filter(s => s.t && (s.p || s.h3.length));
    const s0 = secs[0] || { id: '', t: '', p: '', tip: '', h3: [] }; return { d: latestBrief.d, t: latestBrief.t, href: `x-brief/${latestBrief.d}.html`, lead: s0.h3[0] || s0.t, sum: s0.p, tip: s0.tip, s0, secs }; })();
  const PIMG = posters.flatMap(p => { try { const h = fs.readFileSync(path.join(ROOT, 'x-posters', p.d, 'index.html'), 'utf8');
    return [...h.matchAll(/<section class="[^"]*\bpc" id="([^"]+)"[\s\S]*?<img src="([^"]+)" alt="([^"]*)"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(m => ({ d: p.d, href: `x-posters/${p.d}/index.html#${m[1]}`, src: `x-posters/${p.d}/${m[2]}`, t: T(m[4]) || m[3] })); } catch { return []; } }).slice(0, 6);
  if (!PIMG.length && latestPoster) latestPoster.imgs.forEach(m => PIMG.push({ d: latestPoster.d, href: `x-posters/${latestPoster.d}/index.html`, src: m.src, t: m.alt }));
  const CR = groups.map(G => { const all = items.filter(i => i.group === G.id).sort(ord); if (!all.length) return null; const n = all.length, cnt = countBy(all), done = cnt['已学完'] + cnt['已掌握'];
    const parts = G.title.split(' · '); const name = parts.reduce((a, b) => b.length > a.length ? b : a, ''); const src = parts.filter(p => p !== name).join(' · ');
    const nx = all.find(i => stateOf(i) === '进行中') || all.find(i => !['已学完', '已掌握'].includes(stateOf(i))) || all[0];
    return { name, src, href: `${G.dir}/index.html`, n, done, doing: cnt['进行中'], pct: n ? Math.round(done / n * 100) : 0, ids: all.map(i => i.id).join(','), all, nx, rev: nx && ['已学完', '已掌握'].includes(stateOf(nx)) }; }).filter(Boolean);
  const COLS = [...columns.map(c => ({ ic: c.icon, t: c.title, href: `${c.dir}/index.html`, n: items.filter(i => i.column === c.id).length })), { ic: '🧩', t: '概念卡', href: 'glossary.html', n: concepts.length }, { ic: '📰', t: 'X 简报', href: 'x-brief/index.html', n: '每日' }, { ic: '🖼', t: 'X 海报', href: 'x-posters/index.html', n: '每日' }];
  const allIds = items.filter(isPage).map(i => i.id).join(',');
  const prog = (ids, cls = '') => `<div class="bigbar prog ${cls}" data-k="prog" data-ids="${ids}"><div class="bar"><i class="g"></i><i class="l"></i><i class="b"></i></div><b>0%</b><span></span></div>`;
  const seg = c => `<div class="seg">${c.all.map(i => { const s = stateOf(i); return `<i class="${['已学完', '已掌握'].includes(s) ? 'd' : s === '进行中' ? 'p' : ''}" title="${esc(i.label)} · ${esc(s)}"></i>`; }).join('')}</div>`;
  const nxA = (c, cls = '') => c.nx ? `<a class="${cls}" href="${esc(c.nx.href)}"${ext(c.nx.href)}>${c.rev ? '去复习' : '下一讲'} ${esc(c.nx.label)} · ${esc(c.nx.title)}</a>` : '';
  const crMeta = c => `已学完 ${c.done}/${c.n}${c.doing ? ` · 进行中 ${c.doing}` : ''}`;
  const readRows = reading.map(i => `<div class="row"><span class="t"><a href="${esc(i.href)}"${ext(i.href)}>${esc(i.title)}</a></span><span class="tag">${esc(colById[i.column]?.title)}</span></div>`).join('') || '<div class="row"><span class="t">没有在读的单篇</span></div>';
  const noBrief = '<p class="mute">还没有简报</p>', noPost = '<p class="mute">还没有海报</p>';
  const pimg = (p, cls = '') => `<a class="${cls}" href="${esc(p.href)}"><img src="${esc(p.src)}" alt="${esc(p.t)}" loading="lazy"><span>${p.d.slice(5).replace('-', '/')} · ${esc(p.t)}</span></a>`;
  const kpiB = `<div class="db-kpi kpi"><a href="#b-review" class="red" data-f="overbox"><span>已逾期</span><b class="cnt" data-f="over">…</b><small data-f="overmax">&nbsp;</small></a><a href="#b-review"><span>今天到期</span><b class="cnt" data-f="today">…</b><small>先清逾期</small></a><a href="#b-doing"><span>正在学</span><b>${doing.length}</b><small>${CR.length} 门公开课</small></a><a href="#k-columns"><span>学习页</span><b>${pages.length}</b><small>${columns.length} 个栏目</small></a><a href="glossary.html"><span>概念卡</span><b>${concepts.length}</b><small>跨栏目</small></a><div class="db-pct"><span>完成度</span>${prog(allIds)}</div></div>`;
  const layB = `<div class="lay lay-B"><div class="db-top"><h1>早上好，王玮</h1><span class="kk" data-f="date">今天</span><a class="btn" href="#b-review">开始复习 →</a></div><p class="db-sum" data-f="sum"></p>${kpiB}
<div class="db-grid"><section class="panel db-rv" id="b-review"><div class="ph"><h2>今天该复习</h2><span class="n" data-f="duen">…</span></div><div data-rv="full"></div></section>
<section class="panel db-cr" id="b-doing"><div class="ph"><h2>正在学的课</h2><a class="n" href="courses/index.html">${groups.length} 门公开课 →</a></div>${CR.map(c => `<div class="db-c"><div class="i"><small>${esc(c.src)}</small><a class="nm" href="${c.href}">${esc(c.name)}</a>${nxA(c, 'nx')}</div><div class="p">${seg(c)}<small>${crMeta(c)}</small></div>${c.nx ? `<a class="btn sm" href="${esc(c.nx.href)}"${ext(c.nx.href)}>继续 →</a>` : ''}</div>`).join('') || '<p class="mute">还没有课程</p>'}</section>
<section class="panel db-br"><div class="ph"><h2>今日简报${BR ? ' · ' + esc(BR.d.slice(5).replace('-', '/')) : ''}</h2><a class="n" href="x-brief/index.html">全部 →</a></div>${BR ? `<a class="pt" href="${BR.href}">${esc(BR.lead)}</a><p class="mute">${esc(BR.sum)}</p><ul>${BR.secs.map(s => ({ s, x: s.h3[0] || (s.p ? s.p.slice(0, 34) + (s.p.length > 34 ? '…' : '') : '') })).filter(o => o.x).slice(0, 5).map(({ s, x }) => `<li><a href="${BR.href}#${s.id}"><b>${esc(s.t)}</b> · ${esc(x)}</a></li>`).join('')}</ul>` : noBrief}</section>
<section class="panel db-fv"><div class="ph"><h2>最近收藏</h2><a class="n" href="favorites/index.html">全部 →</a></div><div class="list" data-fav></div><div class="ph" style="margin-top:10px"><h2>正在读</h2><span class="n">${reading.length}</span></div><div class="list">${readRows}</div></section>
<section class="panel db-po"><div class="ph"><h2>X 海报</h2><a class="n" href="x-posters/index.html">全部 →</a></div>${PIMG.length ? `<div class="db-th">${PIMG.map(p => pimg(p)).join('')}</div>` : noPost}</section></div></div>`;
  const layA = `<div class="lay lay-A"><header class="ma-mast"><h1>学习日报</h1><span data-f="date">今天</span><span>王玮的学习库</span></header>
<nav class="ma-sec">${COLS.map(c => `<a href="${c.href}">${esc(c.t)}</a>`).join('')}<a class="r" href="favorites/index.html">☆ 我的收藏</a></nav>
<section class="ma-front"><div class="ma-due" id="a-review"><span class="kk">今日待办</span><div class="ma-big cnt" data-f="duen0">…</div><div class="ma-dl">篇该复习 · <b data-f="over">…</b> 篇逾期、<span data-f="today">…</span> 篇今天到期</div><ol data-rv="ol"></ol></div>
<article class="ma-lead">${BR ? `<span class="kk">头条 · ${esc(BR.t || 'X 简报')}</span><h2><a href="${BR.href}">${esc(BR.lead)}</a></h2><p class="dek">${esc(BR.sum)}</p>${BR.tip ? `<div class="ma-tip">💡 ${esc(BR.tip)}</div>` : ''}` : `<span class="kk">头条</span>${noBrief}`}<div class="ma-fig">${PIMG.slice(0, 2).map(p => pimg(p)).join('')}</div></article>
<div class="ma-side"><span class="kk">简报其他要闻</span>${BR ? BR.secs.slice(1, 6).map(s => `<article><span class="kk2">${esc(s.t)}</span><h3><a href="${BR.href}#${s.id}">${esc(s.h3[0] || s.t)}</a></h3>${s.p ? `<p>${esc(s.p.slice(0, 70))}${s.p.length > 70 ? '…' : ''}</p>` : ''}</article>`).join('') : noBrief}</div></section>
<section class="ma-row" id="a-doing">${CR.map(c => `<article><span class="kk">公开课 · ${esc(c.src)}</span><h3><a href="${c.href}">${esc(c.name)}</a></h3>${nxA(c, 'nx')}${prog(c.ids)}</article>`).join('')}<article><span class="kk">正在读 · ${reading.length}</span><div class="list">${readRows}</div></article></section>
<section class="ma-sf"><div><span class="kk">图片版 · X 技术海报</span><a class="n" href="x-posters/index.html">全部 →</a></div>${PIMG.length ? `<div class="ma-strip">${PIMG.map(p => pimg(p)).join('')}</div>` : noPost}</section>
<section class="ma-fv"><span class="kk">我的收藏</span><a class="n" href="favorites/index.html">全部 →</a><div class="list" data-fav></div></section></div>`;
  const layC = `<div class="lay lay-C"><section class="ps-hero"><div class="ps-intro"><div class="ps-av">玮</div><span class="kk" data-f="date">今天</span><h1>早上好，王玮。<br><span>慢慢学，学一样会一样。</span></h1><p data-f="sum"></p><div class="ps-cta"><a class="btn" href="#c-review">开始复习 →</a>${CR[0]?.nx ? `<a class="btn ghost" href="${esc(CR[0].nx.href)}">继续上次的课</a>` : ''}${BR ? `<a class="btn ghost" href="${BR.href}">今天的 X 简报</a>` : ''}</div></div>
<div class="ps-st kpi"><a href="#c-review" class="hot" data-f="overbox"><span>已逾期</span><b class="cnt" data-f="over">…</b></a><a href="#c-review"><span>今天到期</span><b class="cnt" data-f="today">…</b></a><a href="#c-wall"><span>正在学</span><b>${doing.length}</b></a><a href="#k-columns"><span>篇学习页 · 概念卡 ${concepts.length}</span><b>${pages.length}</b></a></div></section>
<div class="ps-bar" id="c-wall"><h2>作品墙</h2><em>在学的、在读的、每天的</em></div><div class="ps-wall">
${BR ? `<a class="ps-t ps-brief fx-feat" href="${BR.href}"><small>X 简报 · ${esc(BR.d.slice(5).replace('-', '/'))}</small><h3>${esc(BR.lead)}</h3><p>${esc(BR.sum)}</p>${BR.tip ? `<p class="tip">💡 ${esc(BR.tip)}</p>` : ''}<div class="ps-tags">${BR.secs.slice(1, 5).map(s => `<span>${esc(s.h3[0] || s.t)}</span>`).join('')}</div></a>` : ''}
${PIMG[0] ? pimg(PIMG[0], 'ps-t ps-img') : ''}
<div class="ps-t ps-due" id="c-review"><small>今天该复习 · <span data-f="duen">…</span></small><ul data-rv="ul"></ul></div>
${CR.map(c => `<div class="ps-t ps-cr"><small>${esc(c.src)} · 公开课</small><h3><a href="${c.href}">${esc(c.name)}</a></h3>${nxA(c, 'nx')}${prog(c.ids)}</div>`).join('')}
${PIMG.slice(1, 4).map(p => pimg(p, 'ps-t ps-img')).join('')}
<div class="ps-t ps-fv"><small>我的收藏 · <a href="favorites/index.html">全部 →</a></small><div class="list" data-fav></div></div>
${reading.slice(0, 4).map(i => `<a class="ps-t ps-rd" href="${esc(i.href)}"${ext(i.href)}><small>正在读 · ${esc(colById[i.column]?.title)}</small><h3>${esc(i.title)}</h3></a>`).join('')}</div></div>`;
  const body = `<div class="lays">${layB}${layA}${layC}</div>
<div class="kicker" id="k-columns">栏目</div><div class="sub">按来源找内容</div><div class="grid">${colCards}</div>
<div class="kicker">已学完 <span class="n">${doneIts.length}</span></div><div class="sub">到了复习日会出现在最上面</div>${courseCards(doneIts, '还没有学完的内容')}
<div class="kicker">待学收件箱 <span class="n">${inbox.length}</span></div>${inboxHtml}
<div class="kicker" id="k-concepts">概念卡</div><div class="sub">一个术语一张卡，跨栏目串起来</div><div class="chips">${concepts.map(c => `<a class="chip" href="concepts/${c.id}.html">${esc(c.term)}</a>`).join('')}<a class="chip more" href="glossary.html">全部概念卡 →</a></div>`;
  const script = `const R=${revData};const p=n=>String(n).padStart(2,'0');const d=new Date();const today=new URLSearchParams(location.search).get('today')||(d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())); /* 自查用：?today=2026-10-14 */
const DK=h=>'done:'+new URL(h,location.href).pathname;const add=(t,n)=>{const x=new Date(t+'T12:00:00');x.setDate(x.getDate()+n);return x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate())};
for(const q of R.queue){const it=R.items[q.item];const dd=it&&localStorage.getItem(DK(it.href));if(dd){q.start=dd;for(const r of q.reviews)r.date=add(dd,r.day)}}
const diff=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const G={over:[],today:[],later:[]};
for(const q of R.queue){const pend=q.reviews.filter(r=>!r.done);if(!pend.length||!R.items[q.item])continue;const due=pend.filter(r=>r.date<=today);
 if(due.length){const late=diff(due[0].date,today);(late>0?G.over:G.today).push({item:q.item,day:due[due.length-1].day,late,n:due.length,date:due[0].date})}
 else G.later.push({item:q.item,day:pend[0].day,date:pend[0].date,inN:diff(today,pend[0].date)})}
G.over.sort((a,b)=>b.late-a.late);G.later.sort((a,b)=>a.date.localeCompare(b.date));
const dueN=G.over.length+G.today.length;const F=(k,v)=>document.querySelectorAll('[data-f="'+k+'"]').forEach(e=>e.textContent=v);
F('over',G.over.length);F('today',G.today.length);F('duen0',dueN);F('duen',dueN?dueN+' 篇到期':'无到期');F('overmax',G.over.length?'最久 '+G.over[0].late+' 天':'没有逾期');
if(!G.over.length)document.querySelectorAll('[data-f="overbox"]').forEach(e=>e.classList.remove('red','hot'));
{const W='日一二三四五六',[y,m,dd]=today.split('-').map(Number),wd=new Date(y,m-1,dd).getDay();F('date',m+' 月 '+dd+' 日 · 星期'+W[wd]);
const top=G.over[0]||G.today[0];F('sum',dueN?('今天有 '+dueN+' 篇该复习'+(G.over.length?'，其中 '+G.over.length+' 篇已经逾期':'')+'。先从「'+R.items[top.item].title+'」开始。'):(G.later.length?'下一次复习在 '+G.later[0].date.slice(5)+'：'+R.items[G.later[0].item].title+'。':'复习队列是空的，去学点新东西吧。'))}
const LAB={over:'逾期',today:'今天到期',later:'之后'};
const row=(k,r)=>{const it=R.items[r.item];const b=k==='over'?'<b>第 '+r.day+' 天</b> · <span class="late">逾期 '+r.late+' 天</span>'+(r.n>1?' · 积压 '+r.n+' 次':''):k==='today'?'<b>第 '+r.day+' 天</b> · 今天':'第 '+r.day+' 天 · '+r.inN+' 天后（'+r.date.slice(5)+'）';return '<div class="row rvr '+k+'"><i class="ic">'+E(it.ic)+'</i><span class="t"><a href="'+E(it.href)+'">'+E(it.title)+'</a><small>'+E(it.col)+' · '+E(it.label)+' · 第 '+r.day+' 天</small></span><span class="tag">'+E(it.label)+'</span><span class="badge">'+b+'</span></div>'};
const total=G.over.length+G.today.length+G.later.length;let open=false;
function draw(){let h='',c=0;const lim=open?1e9:5;if(!dueN)h+='<div class="row"><span class="t" style="font-weight:500">今天（'+today+'）没有到期的复习 🎉</span></div>';
 for(const k of ['over','today','later']){const L=G[k];if(!L.length||c>=lim)continue;h+='<div class="rv-g '+k+'">'+LAB[k]+' <span class="c">'+L.length+'</span></div>';for(const r of L){if(c>=lim)break;h+=row(k,r);c++}}
 if(total>5)h+='<button class="rv-more" type="button">'+(open?'收起':'展开全部（共 '+total+' 篇）')+'</button>';
 document.querySelectorAll('[data-rv="full"]').forEach(el=>{el.innerHTML='<div class="list">'+h+'</div>';const b=el.querySelector('.rv-more');if(b)b.onclick=()=>{open=!open;draw()}})}
draw();
const short=[...G.over.map(r=>['over',r]),...G.today.map(r=>['today',r])];const sl=(o)=>short.length?short.slice(0,6).map(([k,r])=>{const it=R.items[r.item];return '<li><a href="'+E(it.href)+'">'+E(it.title)+'</a><em class="'+k+'">'+(k==='over'?'逾期 '+r.late+' 天':'今天')+'</em></li>'}).join('')+(short.length>6?'<li class="more"><a href="#b-review" onclick="__setTheme(\\'B\\')">还有 '+(short.length-6)+' 篇 →</a></li>':''):'<li>今天没有到期的复习 🎉'+(G.later.length?'（下一次 '+G.later[0].date.slice(5)+'）':'')+'</li>';
document.querySelectorAll('[data-rv="ol"],[data-rv="ul"]').forEach(el=>el.innerHTML=sl());
window.__favRender=function(L){var TN={'x-brief':'X 简报','poster':'X 海报','concept':'概念卡','course':'公开课','page':'页面'};var h=L.length?L.slice(0,5).map(x=>'<div class="row"><span class="tag">'+E(TN[x.type]||'页面')+'</span><span class="t"><a href="'+E(x.url)+'">'+E(x.title)+'</a></span><span class="d">'+E((x.added_at||'').slice(0,10))+'</span></div>').join(''):'<div class="row"><span class="t" style="font-weight:400;color:var(--meta)">还没有收藏，在任意页面点 ☆ 就能收藏</span></div>';document.querySelectorAll('[data-fav]').forEach(el=>el.innerHTML=h)};window.__favRender([]);`;
  write(f, page(f, '首页', 'home', body, script));
}
// ---- 栏目页 + 主题页 ----
for (const c of columns) {
  const f = `${c.dir}/index.html`; const its = pages.filter(i => i.column === c.id); const gs = groups.filter(g => g.column === c.id);
  const pending = items.filter(i => i.column === c.id && !i.group && !isPage(i)).sort((a, b) => a.order - b.order);
  let body = `<div class="crumb"><a href="${rel(f, 'index.html')}">首页</a> / ${esc(c.title)}</div><section class="hero sheet"><div class="say"><span class="kk">栏目</span><h1>${c.icon} ${esc(c.title)}</h1><p>${esc(c.desc)}</p></div><div class="stage"><div class="stat blue"><b>${its.length}</b><span>篇学习页</span></div><div class="stat green" data-k="done" data-ids="${its.map(i=>i.id).join(',')}"><b>${its.filter(i => ['已学完','已掌握'].includes(stateOf(i))).length}</b><span>已学完</span></div><div class="stat blue" data-k="doing" data-ids="${its.map(i=>i.id).join(',')}"><b>${its.filter(i => stateOf(i) === '进行中').length}</b><span>进行中</span></div><div class="stat"><b>${pending.length || gs.length}</b><span>${pending.length ? '篇未开始' : '个主题'}</span></div></div></section>`;
  if (!its.length && !gs.length && !pending.length) body += `<div style="margin-top:28px">${emptyBox('还没有内容', `以后学到${esc(c.title)}的内容，会出现在这里。`)}</div>`;
  for (const g of gs) { const gi = its.filter(i => i.group === g.id); const gp = items.filter(i => i.group === g.id && !isPage(i));
    body += `<div class="kicker">主题</div><div class="sub">${esc(g.title)}</div><div class="grid wide"><a class="card c1" href="${rel(f, g.dir + '/index.html')}"><span class="go">→</span><div class="ic">${c.icon}</div><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p><div class="meta"><span class="tag blue">${gi.length} 篇学习页</span>${gp.length ? `<span class="tag">${gp.length} 讲未开始</span>` : ''}</div>${progBar(items.filter(i => i.group === g.id))}</a></div>`; }
  const loose = its.filter(i => !i.group);
  if (loose.length) body += `<div class="kicker">文章 <span class="n">${loose.length}</span></div><div class="sub">一篇一页，点开就学</div><div class="grid wide">${loose.map(i => itemCard(f, i)).join('')}</div>`;
  // 长文分主线：item.threads = [{label,title,href,cards,range,conclusion}]（全文导读在 item.href）
  for (const i of loose.filter(x => x.threads?.length)) body += `<div class="kicker">${esc(i.label)} · 分主线学 <span class="n">${i.threads.length} 条</span></div><div class="sub">${esc(i.title)}</div><div class="list"><div class="row"><span class="tag blue">导读</span><span class="t"><a href="${rel(f, i.href)}">全文导读：主线怎么连起来</a></span></div>${i.threads.map(t => `<div class="row"><span class="tag">${esc(t.label)}</span><span class="t"><a href="${rel(f, t.href)}">${esc(t.title)}</a><div style="font-weight:400;font-size:14px;color:var(--ink2)">${esc(t.conclusion)}</div></span><span class="d">${esc(t.range)} · ${t.cards} 张</span></div>`).join('')}</div>`;
  if (pending.length) body += `<div class="kicker">待学 <span class="n">${pending.length}</span></div><div class="sub">还没做成学习页，先看原文</div><div class="list">${pending.map(i => `<div class="row">${statusTag('未开始')}<span class="tag">${esc(i.label)}</span><span class="t"><a href="${esc(i.href)}"${/^https?:/.test(i.href) ? ' target="_blank" rel="noopener"' : ''}>${esc(i.title)}</a>${i.note ? `<div style="font-weight:400;font-size:14px;color:var(--ink2)">${esc(i.note)}</div>` : ''}</span>${i.date ? `<span class="d">${esc(i.date)}</span>` : ''}</div>`).join('')}</div>`;
  write(f, page(f, c.title, c.id, body));
}
for (const g of groups) {
  const f = `${g.dir}/index.html`; const c = colById[g.column]; const gall = items.filter(i => i.group === g.id).sort((a, b) => a.order - b.order); const gi = gall.filter(isPage), gp = gall.filter(i => !isPage(i));
  const ext = h => /^https?:/.test(h) ? h : rel(f, h);
  const rowsHtml = rs => `<div class="list">${rs.map(r => `<div class="row">${r.tag ? `<span class="tag ${r.tagc || ''}">${esc(r.tag)}</span>` : ''}${r.st ? statusTag(r.st) : ''}<span class="t"><a href="${esc(ext(r.href))}">${esc(r.title)}</a>${r.note ? `<div style="font-weight:400;font-size:14px;color:var(--ink2)">${esc(r.note)}</div>` : ''}</span>${r.d ? `<span class="d">${esc(r.d)}</span>` : ''}</div>`).join('')}</div>`;
  const body = `<div class="crumb"><a href="${rel(f, 'index.html')}">首页</a> / <a href="${rel(f, c.dir + '/index.html')}">${esc(c.title)}</a> / ${esc(g.title)}</div>
<section class="hero sheet"><div class="say"><span class="kk">${esc(c.title)} · 主题</span><h1>${esc(g.title)}</h1><p>${esc(g.desc)}</p><p style="font-size:14px">课程网站：<a href="${esc(g.source)}">${esc(g.source.replace(/^https?:\/\//, ''))}</a></p>${progBar(gall)}</div><div class="stage"><div class="stat blue"><b>${gi.length}</b><span>讲已做成学习页</span></div><div class="stat green" data-k="done" data-ids="${gi.map(i=>i.id).join(',')}"><b>${gi.filter(i => ['已学完','已掌握'].includes(stateOf(i))).length}</b><span>已学完</span></div><div class="stat blue" data-k="doing" data-ids="${gi.map(i=>i.id).join(',')}"><b>${gi.filter(i => stateOf(i) === '进行中').length}</b><span>进行中</span></div>${gp.length ? `<div class="stat"><b>${gp.length}</b><span>讲未开始</span></div>` : `<div class="stat"><b>${new Set(gi.flatMap(i => itemConcepts(i.id).map(x => x.id))).size}</b><span>张相关概念卡</span></div>`}</div></section>
${(g.intro || []).length ? `<div class="kicker">课程简介</div><div class="sub">只写官方资料里有的</div><div class="list">${g.intro.map(x => `<div class="row"><span class="t" style="font-weight:400">${esc(x.text)}</span>${x.cite ? `<a class="tag blue" href="${esc(x.cite)}">出处</a>` : ''}</div>`).join('')}</div>` : ''}
${gi.length ? `<div class="kicker">按讲次 <span class="n">${gi.length}</span></div><div class="sub">一讲一页，按顺序学</div><div class="grid wide">${gi.map(i => itemCard(f, i)).join('')}</div>` : ''}
${gp.length ? `<div class="kicker">全部讲次 <span class="n">${gp.length} 讲未开始</span></div><div class="sub">还没做成学习页，先看官方原始资料</div>${g.planNote ? `<p style="margin:-6px 0 12px;color:var(--ink2);font-size:14px">${esc(g.planNote)}</p>` : ''}${rowsHtml(gp.map(i => ({ st: '未开始', tag: i.label, title: i.title, href: i.href, note: i.note, d: i.date || '' })))}` : ''}
${(g.sections || []).map(sec => `<div class="kicker">${esc(sec.kicker)}</div>${sec.sub ? `<div class="sub">${esc(sec.sub)}</div>` : ''}${sec.note ? `<p style="margin:-6px 0 12px;color:var(--ink2);font-size:14px">${esc(sec.note)}</p>` : ''}${rowsHtml(sec.rows)}`).join('')}
${gi.map(i => { const cs = itemConcepts(i.id); return cs.length ? `<div class="kicker">${esc(i.label)} 本课概念</div><div class="chips">${cs.map(x => `<a class="chip" href="${rel(f, 'concepts/' + x.id + '.html')}">${esc(x.term)}</a>`).join('')}</div>` : ''; }).join('')}`;
  write(f, page(f, g.title, c.id, body));
}
// ---- 概念卡 + 术语表 ----
for (const c of concepts) {
  const f = `concepts/${c.id}.html`;
  const refs = c.refs.map(r => { const it = itemById[r.item]; const th = r.thread ? it.threads?.[r.thread - 1] : null; return `<div class="row"><span class="tag">${esc(colById[it.column]?.title)}</span><span class="t"><a href="${rel(f, th ? th.href : it.href)}#${r.card}">${esc(it.label)}${th ? ' · ' + esc(th.label) : ''} · ${esc(r.note)}</a></span><span class="d">第 ${r.card} 张 →</span></div>`; }).join('');
  const lessons = [...new Set(c.refs.map(r => r.item))].length;
  const body = `<div class="crumb"><a href="../index.html">首页</a> / <a href="../glossary.html">概念卡</a> / ${esc(c.term)}</div>
<section class="defcard sheet"><div class="stage"><span class="tag blue" style="align-self:flex-start">概念卡</span><div class="term">${esc(c.term)}</div><div class="en" style="font:600 15px var(--mono);color:var(--ink2)">${esc(c.en)}</div></div>
<div class="say"><p class="key">${esc(c.def)}</p><div class="meta" style="font-size:13px;color:var(--ink2)">出现在 ${lessons} 篇学习页 · ${c.refs.length} 张卡片</div></div></section>
<div class="kicker">出现在 <span class="n">${lessons} 篇 · ${c.refs.length} 处</span></div><div class="sub">点一条，直接跳到那张卡片</div><div class="list">${refs}</div>
${c.related?.length ? `<div class="kicker">相关概念</div><div class="chips">${c.related.filter(x => conById[x]).map(x => `<a class="chip" href="${x}.html">${esc(conById[x].term)}</a>`).join('')}</div>` : ''}`;
  write(f, page(f, c.term, 'glossary', body));
}
{
  const f = 'glossary.html';
  const body = `<section class="hero sheet"><div class="say"><span class="kk">术语表</span><h1>一个术语一张卡，跨栏目串起来</h1><p>每张卡写一句定义，再列出它在哪几篇学习页的哪张卡片出现。</p></div><div class="stage"><div class="stat blue"><b>${concepts.length}</b><span>张概念卡</span></div><div class="stat green"><b>${concepts.reduce((n, c) => n + c.refs.length, 0)}</b><span>处出处</span></div><div class="stat amber"><b>${concepts.filter(c => new Set(c.refs.map(r => itemById[r.item]?.column)).size > 1).length}</b><span>张跨栏目</span></div><div class="stat"><b>${pages.length}</b><span>篇学习页</span></div></div></section>
<div class="kicker">全部 <span class="n">${concepts.length}</span></div><div class="sub">点卡片看定义和出处</div><div class="grid">${concepts.map(c => { const its = [...new Set(c.refs.map(r => r.item))].map(id => itemById[id]);
    return `<a class="card" href="concepts/${c.id}.html"><span class="go">→</span><h3>${esc(c.term)}</h3><div class="en">${esc(c.en)}</div><p>${esc(c.def.length > 60 ? c.def.slice(0, 60) + '…' : c.def)}</p><div class="meta">${its.map(i => `<span class="tag">${esc(i.label)}</span>`).join('')}</div></a>`; }).join('')}</div>`;
  write(f, page(f, '概念卡', 'glossary', body));
}
// ---- 我的收藏（数据在 favorites.json，由 assets/favorites.js 读写） ----
// ---- 我的收藏（数据在 favorites.json，由 assets/favorites.js 读写） ----
{
  const f = 'favorites/index.html';
  const body = `<section class="hero sheet solo"><div class="say"><span class="kk">我的收藏</span><h1>收藏的页面、简报和海报</h1><p>在任意页面点 ☆ 收藏，手机和电脑看到的是同一份列表（存在仓库的 <code>favorites.json</code>，公开，只存标题、链接和标签）。</p></div></section>
<div id="tkhint"></div>
<div class="fbar"><input id="fq" type="search" placeholder="搜索标题、标签、备注"><select id="ft"><option value="">全部类型</option></select></div>
<div class="chips" id="ftags"></div><div id="fcount" style="font-size:13px;color:var(--meta);margin:12px 0 8px"></div><div class="list" id="flist"><div class="empty"><b>加载中…</b></div></div>
<details class="panel" id="settings"><summary>⚙ 同步设置 <span class="s" id="tkstate"></span></summary><div class="pb">
<div class="tkrow"><input id="tk" type="password" autocomplete="off" placeholder="粘贴 github_pat_ 开头的令牌"><button id="tksave" class="pri">保存</button><button id="tkclear">清除</button></div>
<ol><li>电脑上打开 GitHub，右上角头像 → <b>Settings</b> → 左侧最下面 <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>。</li><li>Token name 填「学习站收藏」，Expiration 选一个期限（比如 1 年）。</li><li>Repository access 选 <b>Only select repositories</b>，只勾 <code>ww880412/learning</code>。</li><li>Permissions → Repository permissions 里找到 <b>Contents</b>，改成 <b>Read and write</b>，其他保持不动。</li><li>点 <b>Generate token</b>，复制那串 <code>github_pat_…</code>，粘贴到上面的框里点「保存」。每个浏览器（手机、电脑）各做一次粘贴即可，令牌只存在这个浏览器里，不会上传。</li></ol></div></details>`;
  const script = `window.__favRender=function(L){var q=document.getElementById('fq'),t=document.getElementById('ft'),tg=document.getElementById('ftags'),out=document.getElementById('flist');if(!out)return;var TN={'x-brief':'X 简报','poster':'X 海报','concept':'概念卡','course':'公开课','page':'页面'};var types=[...new Set(L.map(x=>x.type||'page'))];var cur=t.value;t.innerHTML='<option value="">全部类型</option>'+types.map(x=>'<option value="'+x+'">'+(TN[x]||x)+'</option>').join('');t.value=types.includes(cur)?cur:'';var tags=[...new Set(L.flatMap(x=>x.tags||[]))];var on=window.__ftag||'';tg.innerHTML=tags.map(x=>'<a class="chip'+(x===on?' more':'')+'" href="#" data-t="'+x.replace(/"/g,'&quot;')+'">#'+x.replace(/</g,'&lt;')+'</a>').join('');tg.querySelectorAll('a').forEach(a=>a.onclick=e=>{e.preventDefault();window.__ftag=window.__ftag===a.dataset.t?'':a.dataset.t;__favRender(FAV.list())});var k=q.value.trim().toLowerCase();var R=L.filter(x=>(!t.value||(x.type||'page')===t.value)&&(!on||(x.tags||[]).includes(on))&&(!k||[x.title,x.note,(x.tags||[]).join(' '),x.url].join(' ').toLowerCase().includes(k)));document.getElementById('fcount').textContent='共 '+L.length+' 条'+(R.length!==L.length?'，筛出 '+R.length+' 条':'');var E=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);out.innerHTML=R.length?R.map((x,i)=>'<div class="row"><span class="tag">'+E(TN[x.type]||x.type||'页面')+'</span><span class="t"><a href="'+E(x.url)+'"'+(/^https?:/.test(x.url)?' target="_blank" rel="noopener"':'')+'>'+E(x.title||x.url)+'</a>'+((x.tags||[]).length?'<div style="font-weight:400;font-size:13px;color:var(--meta)">'+x.tags.map(y=>'#'+E(y)).join(' ')+'</div>':'')+(x.page?'<div style="font-weight:400;font-size:13px"><a href="'+E(x.page)+'">在简报里看 →</a></div>':'')+(x.x?'<div style="font-weight:400;font-size:13px"><a href="'+E(x.x)+'" target="_blank" rel="noopener">X 原帖 →</a></div>':'')+'</span><span class="d">'+E((x.added_at||'').slice(0,10))+'</span><button class="fav-b on" data-i="'+i+'" title="取消收藏">★</button></div>').join(''):'<div class="empty"><b>'+(L.length?'没有符合条件的收藏':'还没有收藏')+'</b>'+(L.length?'':'在任意页面点 ☆ 就能收藏')+'</div>';out.querySelectorAll('button[data-i]').forEach(b=>b.onclick=async()=>{if(!FAV.token()){FAV.toast('先打开下面的「同步设置」填令牌');return}if(!confirm('取消收藏「'+R[b.dataset.i].title+'」？'))return;b.style.opacity=.3;try{await FAV.toggleItem(R[b.dataset.i]);FAV.toast('已取消收藏')}catch(e){FAV.toast('没保存成功：'+e.message)}})};
document.getElementById('fq').oninput=document.getElementById('ft').onchange=()=>window.FAV&&__favRender(FAV.list());
function tks(){var t=window.FAV&&FAV.token();document.getElementById('tkstate').textContent=t?'✅ 已设置（…'+t.slice(-4)+'）':'未设置';document.getElementById('tkhint').innerHTML=t?'':'<p class="fhint">这个浏览器还没设置同步：现在只能看收藏，点 ☆ 不会保存。<a href="#settings" onclick="document.getElementById(\\'settings\\').open=true">去设置 →</a></p>';}
function openS(){if(location.hash==='#settings')document.getElementById('settings').open=true}window.addEventListener('hashchange',openS);openS();
document.getElementById('tksave').onclick=()=>{var v=document.getElementById('tk').value.trim();if(!/^(github_pat_|ghp_)/.test(v)){alert('看起来不是 GitHub 令牌，应以 github_pat_ 开头');return}FAV.setToken(v);document.getElementById('tk').value='';tks();FAV.toast('已保存令牌')};
document.getElementById('tkclear').onclick=()=>{FAV.setToken('');tks();FAV.toast('已清除令牌')};
document.addEventListener('DOMContentLoaded',tks);`;
  write(f, page(f, '我的收藏', 'favorites', body, script));
}
// ---- review.md（人读版） ----
{
  let md = `# 间隔复习队列\n\n> 由 build.mjs 从 data/review.json 生成，不要手改本文件。复习完成后把 data/review.json 里对应条目的 \`done\` 改成 \`true\`，再运行 \`node build.mjs\`。\n> 规则：开始学习后第 ${review.intervals.join('、')} 天各复习一次。首页按浏览器当天日期高亮到期项。\n\n| 内容 | 开始 | ${review.intervals.map(n => `第 ${n} 天`).join(' | ')} |\n|---|---|${review.intervals.map(() => '---').join('|')}|\n`;
  for (const q of review.queue) { const it = itemById[q.item]; md += `| ${it ? `${it.label} ${it.title}` : q.item} | ${q.start} | ${q.reviews.map(r => `${r.date}${r.done ? ' ✅' : ''}`).join(' | ')} |\n`; }
  write('review.md', md);
}
