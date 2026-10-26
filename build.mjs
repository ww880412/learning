#!/usr/bin/env node
// 用法：node build.mjs
// 从 data/*.json 生成：index.html、各栏目 index.html、主题 index.html、glossary.html、concepts/*.html、review.md
// 视觉沿用 xuexi-template 的设计变量（styles.css 的 :root），不改模板文件。
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
// 数据文件没有日期字段时，用该文件最近一次提交日（YYYY-MM-DD）。查不到则返回 null。
const gitDay = rel => {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', rel], { cwd: ROOT, encoding: 'utf8' }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch { return null; }
};
// 读 data/ 下的 JSON。文件在但解析失败就带文件名报错退出（此时还没写过任何文件）。
const readJson = rel => { const fp = path.join(ROOT, rel); const txt = fs.readFileSync(fp, 'utf8'); try { return JSON.parse(txt); } catch (e) { console.error(`数据文件解析失败：${rel}：${e.message}`); process.exit(1); } };
const J = f => readJson(path.join('data', f));
const columns = J('columns.json'), { groups, items } = J('items.json'), concepts = J('concepts.json'), inbox = J('inbox.json');
// 产品灵感（PH灵感箱）：data/ph-inspo.json，每天追加一个 day；没有文件时板块为空
const PHI = fs.existsSync(path.join(ROOT, 'data', 'ph-inspo.json')) ? J('ph-inspo.json') : { statuses: ['新发现', '在跟进', '已试用', '归档'], tags: [], days: [] };
// DSH 插件市场盘点：data/dsh-plugins.json；没有文件时不出现导航和首页入口
const DSH = fs.existsSync(path.join(ROOT, 'data', 'dsh-plugins.json')) ? J('dsh-plugins.json') : null;
// Agent 工作台雷达：data/radar.json（scripts/sync-radar.mjs 同步）；没有文件时不出现导航和首页卡片
const RADAR = fs.existsSync(path.join(ROOT, 'data', 'radar.json')) ? J('radar.json') : null;
const dshVerified = DSH ? DSH.verify.reduce((n, g) => n + g.rows.length, 0) : 0;
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

// ---- 复习队列：保留已有 learned / reviews[].done，为新条目补排期 ----
// 已在队列里的条目原样写回，不改 learned、不改 done、不重排已有日期。
const reviewPath = path.join(ROOT, 'data', 'review.json');
let review = fs.existsSync(reviewPath) ? readJson('data/review.json') : { intervals: INTERVALS, queue: [] };
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
// ---- 入口校验：写任何文件之前，检查 ID 唯一、引用存在、日期是真实的 YYYY-MM-DD。出错就逐条报出文件、条目、字段，非零退出 ----
{
  const errs = [];
  const bad = (file, where, msg) => errs.push(`${file} ${where}：${msg}`);
  const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
  const dayField = (file, where, k, v, optional = true) => { if (v == null || v === '') { if (!optional) bad(file, where, `缺少日期 ${k}`); return; } if (!isDay(v)) bad(file, where, `${k} 不是合法日期：${JSON.stringify(v)}`); };
  const uniq = (file, arr, label, key = 'id') => { const seen = new Set(); (Array.isArray(arr) ? arr : []).forEach((x, i) => { const id = x?.[key]; if (id == null || id === '') bad(file, `${label}[${i}]`, `缺少 ${key}`); else if (seen.has(id)) bad(file, `${label}[${i}] (${key}=${id})`, `${key} 重复`); else seen.add(id); }); return seen; };
  // 链接字段只允许 http/https 或站内相对路径，挡住 javascript:、data: 这类会在页面里执行的地址
  const linkOk = v => v == null || v === '' || (typeof v === 'string' && !/[\u0000-\u001f]/.test(v) && (/^https?:\/\//i.test(v) || !/^\s*[a-z][a-z0-9+.-]*:/i.test(v.replace(/[\s\u0000-\u001f]/g, ''))));
  const linkField = (file, where, k, v) => { if (!linkOk(v)) bad(file, where, `${k} 不是 http/https 或站内相对链接：${JSON.stringify(String(v).slice(0, 80))}`); };
  if (!Array.isArray(columns)) bad('data/columns.json', '', '应为数组');
  if (!Array.isArray(items)) bad('data/items.json', 'items', '应为数组');
  if (!Array.isArray(groups)) bad('data/items.json', 'groups', '应为数组');
  if (!Array.isArray(concepts)) bad('data/concepts.json', '', '应为数组');
  if (!Array.isArray(inbox)) bad('data/inbox.json', '', '应为数组');
  if (!review || !Array.isArray(review.queue)) bad('data/review.json', 'queue', '应为数组');
  if (errs.length) { console.error('数据校验失败（没有写任何文件）：\n- ' + errs.join('\n- ')); process.exit(1); }
  const colIds = uniq('data/columns.json', columns, 'columns');
  const grpIds = uniq('data/items.json', groups, 'groups');
  const itIds = uniq('data/items.json', items, 'items');
  const conIds = uniq('data/concepts.json', concepts, 'concepts');
  groups.forEach((g, i) => { const w = `groups[${i}] (id=${g.id})`; if (!colIds.has(g.column)) bad('data/items.json', w, `column 引用了不存在的栏目 ${JSON.stringify(g.column)}`); linkField('data/items.json', w, 'source', g.source); });
  items.forEach((it, i) => { const w = `items[${i}] (id=${it.id})`;
    if (!colIds.has(it.column)) bad('data/items.json', w, `column 引用了不存在的栏目 ${JSON.stringify(it.column)}`);
    if (it.group != null && it.group !== '' && !grpIds.has(it.group)) bad('data/items.json', w, `group 引用了不存在的主题 ${JSON.stringify(it.group)}`);
    dayField('data/items.json', w, 'start', it.start);
    linkField('data/items.json', w, 'href', it.href);
    (it.threads || []).forEach((t, k) => linkField('data/items.json', `${w} threads[${k}]`, 'href', t.href)); });
  concepts.forEach((c, i) => { const w = `concepts[${i}] (id=${c.id})`;
    if (!Array.isArray(c.refs)) { bad('data/concepts.json', w, 'refs 应为数组'); return; }
    c.refs.forEach((r, k) => { const it = items.find(x => x.id === r?.item);
      if (!it) { bad('data/concepts.json', `${w} refs[${k}]`, `item 引用了不存在的条目 ${JSON.stringify(r?.item)}`); return; }
      if (r.thread != null && !it.threads?.[r.thread - 1]) bad('data/concepts.json', `${w} refs[${k}]`, `thread ${r.thread} 在条目 ${it.id} 里不存在`); }); });
  inbox.forEach((x, i) => { const w = `[${i}]`; if (x.column != null && !colIds.has(x.column)) bad('data/inbox.json', w, `column 引用了不存在的栏目 ${JSON.stringify(x.column)}`); linkField('data/inbox.json', w, 'url', x.url); dayField('data/inbox.json', w, 'added', x.added); });
  uniq('data/review.json', review.queue, 'queue', 'item');
  review.queue.forEach((q, i) => { const w = `queue[${i}] (item=${q.item})`;
    if (!itIds.has(q.item)) bad('data/review.json', w, `item 引用了不存在的条目 ${JSON.stringify(q.item)}`);
    dayField('data/review.json', w, 'start', q.start, false); dayField('data/review.json', w, 'learned', q.learned);
    if (!Array.isArray(q.reviews)) { bad('data/review.json', w, 'reviews 应为数组'); return; }
    q.reviews.forEach((r, k) => { dayField('data/review.json', `${w} reviews[${k}] (day=${r.day})`, 'date', r.date, false); dayField('data/review.json', `${w} reviews[${k}] (day=${r.day})`, 'doneOn', r.doneOn); }); });
  if (PHI) { const ids = new Set(); (PHI.days || []).forEach((d, i) => { const w = `days[${i}] (date=${d.date})`; dayField('data/ph-inspo.json', w, 'date', d.date, false);
    (d.items || []).forEach((it, k) => { const ww = `${w} items[${k}] (id=${it.id})`; if (!it.id) bad('data/ph-inspo.json', ww, '缺少 id'); else if (ids.has(it.id)) bad('data/ph-inspo.json', ww, 'id 重复'); else ids.add(it.id);
      for (const f of ['ph', 'site', 'repo']) linkField('data/ph-inspo.json', ww, f, it[f]); (it.followups || []).forEach((x, j) => linkField('data/ph-inspo.json', `${ww} followups[${j}]`, 'url', x.url)); }); }); }
  if (RADAR) { const thKeys = new Set((RADAR.themes || []).map(t => t.key)); dayField('data/radar.json', '', 'updated', RADAR.updated, false);
    uniq('data/radar.json', RADAR.entries, 'entries');
    (RADAR.entries || []).forEach((e, i) => { const w = `entries[${i}] (id=${e.id})`; if (!thKeys.has(e.theme)) bad('data/radar.json', w, `theme 引用了不存在的方向 ${JSON.stringify(e.theme)}`); dayField('data/radar.json', w, 'added', e.added); linkField('data/radar.json', w, 'url', e.url); (e.sources || []).forEach((x, j) => linkField('data/radar.json', `${w} sources[${j}]`, 'url', x.url)); }); }
  if (errs.length) { console.error('数据校验失败（没有写任何文件）：\n- ' + errs.join('\n- ')); process.exit(1); }
}
const keptReview = review.queue.map(q => ({ item: q.item, learned: Object.prototype.hasOwnProperty.call(q, 'learned') ? q.learned : undefined, done: (q.reviews || []).map(r => [r.day, r.done, Object.prototype.hasOwnProperty.call(r, 'doneOn') ? r.doneOn : undefined]) }));
for (const it of items) {
  if (!isPage(it) || !it.start || review.queue.some(q => q.item === it.id)) continue;
  review.queue.push({ item: it.id, start: it.start, reviews: INTERVALS.map(n => ({ day: n, date: addDays(it.start, n), done: false })) });
}
fs.writeFileSync(reviewPath, JSON.stringify(review, null, 2) + '\n');
{
  const back = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  for (const k of keptReview) {
    const q = back.queue.find(x => x.item === k.item);
    if (!q) throw new Error('review.json 丢失条目 ' + k.item);
    if (k.learned !== undefined && q.learned !== k.learned) throw new Error('review.json 丢掉了 learned：' + k.item);
    for (const [day, done, doneOn] of k.done) {
      const r = (q.reviews || []).find(x => x.day === day);
      if (!r || r.done !== done) throw new Error('review.json 丢掉了 done：' + k.item + ' 第 ' + day + ' 天');
      if (doneOn !== undefined && r.doneOn !== doneOn) throw new Error('review.json 丢掉了 doneOn：' + k.item + ' 第 ' + day + ' 天');
    }
  }
}
reviewRef = review;

// ---- 工具 ----
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rel = (fromFile, to) => { const r = path.relative(path.dirname(fromFile), to); return r || '.'; };
const itemById = Object.fromEntries(items.map(i => [i.id, i]));
const colById = Object.fromEntries(columns.map(c => [c.id, c]));
const conById = Object.fromEntries(concepts.map(c => [c.id, c]));
const THEME = fs.readFileSync(path.join(ROOT,'assets/site.css'),'utf8'), HEADJS = fs.readFileSync(path.join(ROOT,'assets/vp-head.js'),'utf8');
// 图标：只用 Lucide（assets/icons.json，scripts/vendor-icons.mjs 生成），构建时内联 SVG。规则见 DESIGN.md
const ICONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/icons.json'), 'utf8'));
const ic = (n, s = 16, c = '') => `<svg class="i i-${n}${c ? ' ' + c : ''}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ICONS.folder}</svg>`;
const COL_IC = { courses: 'graduation-cap', 'x-posts': 'file-text', research: 'flask-conical', wechat: 'message-circle', video: 'circle-play' };
const colIc = (c, s = 16) => ic(COL_IC[c?.id] || 'folder', s);
function page(file, title, active, body, script = '') {
  const r = p => rel(file, p);
  const navItems = [['index.html', '首页', 'home'], ['favorites/index.html', '收藏', 'favorites'], ...columns.map((c, k) => [`${c.dir}/index.html`, c.title, c.id, items.filter(i => i.column === c.id).length, k ? '' : 's1']), ['glossary.html', '概念卡', 'glossary', concepts.length], ['x-brief/index.html', 'X 简报', 'x-brief', null, 's2'], ['x-posters/index.html', 'X 海报', 'x-posters'], ['ph-inspo/index.html', '产品灵感', 'ph-inspo']];
  if (RADAR) navItems.push(['radar/index.html', '雷达', 'radar', RADAR.entries.length]);
  if (DSH) navItems.push(['dsh-plugins/index.html', 'DSH 插件', 'dsh', dshVerified]);
  const nav = navItems.map(([h, t, id, n, sc]) => `<a href="${r(h)}" class="${[id === active ? 'on' : '', sc || ''].join(' ').trim()}">${esc(t)}${n != null ? `<em>${n}</em>` : ''}</a>`).join('');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 王玮的学习库</title><style>${THEME}</style><script>${HEADJS}</script><script src="${r('assets/gh.js')}" defer></script><script src="${r('assets/favorites.js')}" defer></script><script src="${r('assets/progress.js')}" defer></script></head><body>
<header class="top"><div class="in"><a class="brand" href="${r('index.html')}"><i>${ic('book-open', 16)}</i>王玮的学习库</a><nav>${nav}</nav><button class="dm" onclick="__tt()" aria-label="切换深色模式">${ic('sun-moon', 18)}</button></div></header>
<main>${body}<div class="foot"><span>王玮的学习库 · 每篇都是可翻页、可动手、带小测的学习页</span><span>由 build.mjs 从 data/ 生成</span></div></main>${script ? `<script>${script}</script>` : ''}<script>var __R='${r('index.html')}',__I=${JSON.stringify(Object.fromEntries(items.map(i=>[i.id,[i.href,stateOf(i)]]))).replace(/</g,'\\u003c')};(function(){const DONE=['已学完','已掌握'];const doneExpand=u=>{const out=[],vs=new Set([u]);if(u.endsWith('/index.html')){const d=u.slice(0,-10);vs.add(d);vs.add(d.replace(/\\/$/,'')||'/')}else if(u.endsWith('/')){vs.add(u+'index.html');vs.add(u.replace(/\\/$/,'')||'/')}else if(!/\\.[a-z0-9]+$/i.test(u)){vs.add(u+'/');vs.add(u+'/index.html')}for(const x of vs){out.push(x);const m=x.match(/^(.*)\\/courses\\/(.+)$/);if(m)out.push(m[1]+'/'+m[2]);const m2=x.match(/^(.*)\\/(cs146s)\\/(.+)$/);if(m2&&!x.includes('/courses/'))out.push(m2[1]+'/courses/'+m2[2]+'/'+m2[3])}return[...new Set(out)]};const doneHit=h=>{const keys=[];const add=u=>{for(const k of doneExpand(u))if(!keys.includes(k))keys.push(k)};try{add(new URL(h,new URL(__R,location.href)).pathname)}catch(e){}try{add(new URL(h,location.href).pathname)}catch(e){}for(const k of keys){const d=localStorage.getItem('done:'+k);if(d)return d}return null};const st=id=>{const v=__I[id];if(!v)return null;let s=v[1];if(s!=='已掌握'&&!/^https?:/.test(v[0])){try{if(doneHit(v[0]))s='已学完'}catch(e){}}return s};document.querySelectorAll('a[href]').forEach(a=>{const d=doneHit(a.getAttribute('href'));if(!d)return;const box=a.closest('.row,.card');if(!box)return;const t=box.querySelector('.tag.st');if(t&&!/已掌握/.test(t.textContent)){t.textContent='已学完';t.className='tag st green'}});document.querySelectorAll('[data-doing]').forEach(g=>{const dn=[];g.querySelectorAll('a.card').forEach(a=>{try{if(doneHit(a.getAttribute('href')))dn.push(a)}catch(e){}});if(!dn.length)return;const w=document.createElement('div');w.innerHTML='<div class="kicker">已学完 <span class="n">'+dn.length+'</span></div><div class="sub">到了复习日会出现在上面的「今天该复习」</div><div class="grid wide"></div>';const gd=w.querySelector('.grid');dn.forEach(a=>{a.querySelectorAll('.meta span').forEach(x=>{if(/开始学/.test(x.textContent))x.textContent='复习 →'});gd.appendChild(a)});g.after(...w.childNodes);if(!g.querySelector('a.card'))g.outerHTML='<div class="empty"><b>现在没有进行中的内容</b></div>'});document.querySelectorAll('[data-ids]').forEach(el=>{const ss=el.dataset.ids.split(',').filter(Boolean).map(st).filter(Boolean);const n=ss.length,c=x=>ss.filter(s=>s===x).length;const k=el.dataset.k,b=el.querySelector('b');if(k==='done')b.textContent=ss.filter(s=>DONE.includes(s)).length;else if(k==='doing')b.textContent=c('进行中');else if(k.startsWith('st:'))b.textContent=c(k.slice(3));else if(k==='prog'){const is=el.querySelectorAll('.bar i');const w=x=>(n?x/n*100:0)+'%';is[0].style.width=w(c('已掌握'));is[1].style.width=w(c('已学完'));is[2].style.width=w(c('进行中'));const sp=el.querySelector(':scope>span');const bb=el.querySelector(':scope>b');if(bb)bb.textContent=(n?Math.round((c('已学完')+c('已掌握'))/n*100):0)+'%';sp.textContent='已学完 '+(c('已学完')+c('已掌握'))+'/'+n+(c('已掌握')?' · 已掌握 '+c('已掌握'):'')+(c('进行中')?' · 进行中 '+c('进行中'):'')}})})();</script></body></html>`;
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

// 简报文件名是美东日期，固定美东 21:00 发布，等于北京时间次日 09:00（夏令时）或 10:00（冬令时），都是北京的第二天。
// head 或刊头里若有带时区（或 ET/PT 字样）的发布时间，改用该时间换算到 Asia/Shanghai；只有日期、没有钟点的，不算。
const shanghaiDate = instant => {
  const dt = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(dt.getTime())) return null;
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const wallToInstant = (day, hm, timeZone) => {
  const [y, mo, d] = day.split('-').map(Number);
  const [hh, mm, ss = 0] = hm.split(':').map(Number);
  const want = Date.UTC(y, mo - 1, d, hh, mm, ss);
  let utc = want;
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(utc)).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
    let py = parts.year, pm = parts.month, pd = parts.day, ph = parts.hour, pmi = parts.minute, ps = parts.second;
    if (ph === 24) { ph = 0; pd += 1; }
    utc += want - Date.UTC(py, pm - 1, pd, ph, pmi, ps);
  }
  return new Date(utc);
};
const ZONES = { ET: 'America/New_York', EDT: 'America/New_York', EST: 'America/New_York', PT: 'America/Los_Angeles', PDT: 'America/Los_Angeles', PST: 'America/Los_Angeles', UTC: 'UTC', GMT: 'UTC' };
const parseBriefStamp = raw => {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) && /[T ]\d{2}:\d{2}/.test(s)) return shanghaiDate(s);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*(ET|EDT|EST|PT|PDT|PST|UTC|GMT)$/i);
  if (!m) return null;
  const zone = ZONES[m[3].toUpperCase()];
  if (zone === 'UTC') return shanghaiDate(`${m[1]}T${m[2].length === 5 ? m[2] + ':00' : m[2]}Z`);
  return shanghaiDate(wallToInstant(m[1], m[2], zone));
};
const briefPublishDay = html => {
  const head = (String(html).match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  const meta = head.match(/<meta[^>]*(?:article:published_time|datePublished|publish-date|published)[^>]*>/i);
  if (meta) { const c = meta[0].match(/content="([^"]+)"/i); const day = c && parseBriefStamp(c[1]); if (day) return day; }
  const time = head.match(/<time[^>]+datetime="([^"]+)"/i);
  if (time) { const day = parseBriefStamp(time[1]); if (day) return day; }
  const kk = String(html).match(/<span class="kk">([\s\S]*?)<\/span>\s*<h1>/);
  if (kk) {
    const hit = kk[1].replace(/<[^>]+>/g, ' ').match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*(ET|EDT|EST|PT|PDT|PST|UTC|GMT)/i);
    if (hit) return parseBriefStamp(`${hit[1]} ${hit[2]} ${hit[3]}`);
  }
  return null;
};
// 没有可靠发布时间时：美东文件名 + 1 天 = 北京日期。
const briefBeijingDate = (fileDate, html) => briefPublishDay(html) || addDays(fileDate, 1);

// ---- 每日汇总（北京时间 9:00 推送用）：从 x-brief / x-posters / data/ph-inspo.json 汇成 data/digest/YYYY-MM-DD.json 和 digest/YYYY-MM-DD.html ----
// 汇总日 D 是北京时间。简报用北京日期（见 briefBeijingDate），海报目录已是北京日期，产品灵感取榜单日 ≤ D−2 的最新一份。
// 简报或海报只要有一边到了 D，就生成 digest/D（另一边 null，不把这一天藏起来，也不拿别天硬凑）。最新一天缺的来源写「今天的还没出」，更早的日期写「这天还没有…」。海报晚到后再构建，仍写回同一天。
const DG = (() => {
  const T = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const rd = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };
  const ls = d => fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)) : [];
  const WD = '日一二三四五六';
  const brief = {}, poster = {};
  for (const x of ls('x-brief').filter(x => /^\d{4}-\d\d-\d\d\.html$/.test(x)).sort()) {
    const fileDate = x.slice(0, 10), h = rd('x-brief/' + x);
    const d = briefBeijingDate(fileDate, h);
    if (brief[d] && (brief[d].href.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] >= fileDate) continue;
    const qm = h.match(/今日主线<\/div>\s*<ol class="quick">([\s\S]*?)<\/ol>/);
    let lines = qm ? [...qm[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => T(m[1])).filter(Boolean) : [];
    if (!lines.length) lines = [...h.matchAll(/<h2 id="[^"]+"[^>]*>[\s\S]*?<\/h2>\s*<p>([\s\S]*?)<\/p>/g)].map(m => T(m[1])).filter(Boolean).slice(0, 3);
    brief[d] = { title: T((h.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1]) || `X 简报 · ${fileDate}`, href: `x-brief/${fileDate}.html`, lines: lines.slice(0, 3) };
  }
  for (const d of ls('x-posters').filter(x => /^\d{4}-\d\d-\d\d$/.test(x))) {
    const h = rd(`x-posters/${d}/index.html`); if (!h) continue;
    const items = [...h.matchAll(/<section class="[^"]*\bpc" id="([^"]+)"[\s\S]*?<img src="([^"]+)" alt="([^"]*)"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(m => ({ title: T(m[4]) || T(m[3]), href: `x-posters/${d}/index.html#${m[1]}`, img: `x-posters/${d}/${m[2]}` }));
    if (items.length) poster[d] = { title: T((h.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1]) || `${items.length} 张技术海报`, href: `x-posters/${d}/index.html`, n: items.length, items };
  }
  const phDays = (PHI.days || []).filter(day => day.date && (day.items || []).length).sort((a, b) => b.date.localeCompare(a.date));
  const phFor = d => {
    const day = phDays.find(x => x.date <= addDays(d, -2));
    if (!day) return null;
    return { listDate: day.date, href: `ph-inspo/index.html`, n: day.items.length, source: day.source || null,
      items: [...day.items].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).map(i => ({ rank: i.rank ?? null, name: i.name, what: i.what || '', href: `ph-inspo/index.html#${i.id}` })) };
  };
  const dates = [...new Set([...Object.keys(brief), ...Object.keys(poster)])].filter(Boolean).sort().reverse();
  const list = dates.map(d => { const [y, m, dd] = d.split('-').map(Number);
    return { date: d, label: `${m} 月 ${dd} 日 · 星期${WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]}`, href: `digest/${d}.html`, json: `data/digest/${d}.json`,
      brief: brief[d] || null, posters: poster[d] || null, ph: phFor(d) }; });
  return { list, byDate: Object.fromEntries(list.map(x => [x.date, x])) };
})();
{
  const SITE = 'https://ww880412.github.io/learning/';
  const keep = new Set(DG.list.map(x => x.date + '.json'));
  fs.mkdirSync(path.join(ROOT, 'data', 'digest'), { recursive: true });
  for (const x of fs.readdirSync(path.join(ROOT, 'data', 'digest'))) if (/^\d{4}-\d\d-\d\d\.json$/.test(x) && !keep.has(x)) fs.rmSync(path.join(ROOT, 'data', 'digest', x));
  const rule = '汇总日 D 是北京时间。简报文件名是美东日期，美东 21:00 发布等于北京时间次日 09:00，所以 D 一般对应 x-brief/(D−1).html（页面若有带时区的发布时间，则改用该时间换算到 Asia/Shanghai；链接仍是原文件）。海报是 x-posters/D/。产品灵感是最新一份榜单日 ≤ D−2 的那组（太平洋时间的 Product Hunt 日榜，北京时间 D 日 09:00 前能入库的最新一份），并标出实际榜单日。某一来源没有就是 null。';
  for (const x of DG.list) fs.writeFileSync(path.join(ROOT, 'data', 'digest', x.date + '.json'), JSON.stringify({ ...x, url: SITE + x.href, rule }, null, 1) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data', 'digest', 'index.json'), JSON.stringify({ _readme: '由 build.mjs 生成。北京时间 9:00 的汇总推送直接链接 url，或读 json。', rule, site: SITE, latest: DG.list[0]?.date || null,
    days: DG.list.map(x => ({ date: x.date, url: SITE + x.href, json: x.json, brief: !!x.brief, posters: x.posters?.n || 0, ph: x.ph?.n || 0 })) }, null, 1) + '\n');
  console.log('wrote data/digest/*.json', DG.list.length);
  const none = t => `<div class="dg-none">${t}</div>`;
  // 最新一天还在等迟到的来源，写「今天的还没出」。更早的日期已经定稿，写「这天还没有…」，不把旧页也叫成今天。
  const gap = (x, settled) => x.date === DG.list[0]?.date ? '今天的还没出' : settled;
  const dayBody = (f, x) => `<div class="dg-grid">
<section class="sheet dg-sec"><h2>${ic('newspaper', 18)} X 简报</h2>${x.brief ? `<a class="dg-tt" href="${rel(f, x.brief.href)}">${esc(x.brief.title)}</a>${x.brief.lines.length ? `<ol>${x.brief.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ol>` : ''}<a class="btn sm" href="${rel(f, x.brief.href)}">读这期简报 →</a>` : none(gap(x, '这天还没有简报'))}</section>
<section class="sheet dg-sec"><h2>${ic('rocket', 18)} 产品灵感${x.ph ? ` <span class="tag">榜单 ${esc(x.ph.listDate.slice(5).replace('-', '/'))} · ${x.ph.n} 个</span>` : ''}</h2>${x.ph ? `<ol class="dg-ph">${x.ph.items.map(i => `<li><a href="${rel(f, i.href)}"><b>${i.rank != null ? '#' + esc(i.rank) + ' ' : ''}${esc(i.name)}</b></a><span>${esc(i.what)}</span></li>`).join('')}</ol>` : none(gap(x, '这天还没有产品灵感'))}</section>
<section class="sheet dg-sec dg-wide"><h2>${ic('image', 18)} X 海报${x.posters ? ` <span class="tag">${x.posters.n} 张</span>` : ''}</h2>${x.posters ? `<div class="dg-po">${x.posters.items.map(p => `<a href="${rel(f, p.href)}"><img src="${rel(f, p.img)}" alt="${esc(p.title)}" loading="lazy"><span>${esc(p.title)}</span></a>`).join('')}</div>` : none(gap(x, '这天还没有海报'))}</section></div>`;
  for (const [k, x] of DG.list.entries()) {
    const f = x.href, prev = DG.list[k + 1], next = DG.list[k - 1];
    const nav = `<div class="dg-nav">${prev ? `<a class="btn ghost sm" href="${prev.date}.html">← ${esc(prev.date.slice(5).replace('-', '/'))}</a>` : ''}<a class="btn ghost sm" href="index.html">全部日期</a>${next ? `<a class="btn ghost sm" href="${next.date}.html">${esc(next.date.slice(5).replace('-', '/'))} →</a>` : ''}</div>`;
    const body = `<div class="crumb"><a href="../index.html">首页</a> / <a href="index.html">每日汇总</a> / ${esc(x.date)}</div>
<section class="hero sheet solo dg-hero"><div class="say"><span class="kk">每日汇总 · 北京时间 9:00</span><h1>${ic('calendar', 26)} ${esc(x.label)}</h1><p>当天的 X 简报、X 海报和产品灵感放在一页，早上的推送和这页内容一致。数据：<a href="${rel(f, x.json)}"><code>${esc(x.json)}</code></a>。</p></div></section>
${nav}${dayBody(f, x)}`;
    write(f, page(f, `每日汇总 ${x.date}`, 'digest', body));
  }
  const f = 'digest/index.html';
  const body = `<div class="crumb"><a href="../index.html">首页</a> / 每日汇总</div>
<section class="hero sheet solo dg-hero"><div class="say"><span class="kk">每日汇总 · 北京时间 9:00</span><h1>${ic('calendar', 26)} 每日汇总</h1><p>${esc(rule)} 每天一页，链接格式 <code>digest/YYYY-MM-DD.html</code>，机器可读版 <code>data/digest/YYYY-MM-DD.json</code>。</p></div></section>
<div class="kicker">全部日期 <span class="n">${DG.list.length}</span></div><div class="sub">新的在上面</div>
${DG.list.length ? `<div class="list">${DG.list.map(x => `<div class="row"><span class="t"><a href="${x.date}.html">${esc(x.label)}</a></span><span class="tag${x.brief ? ' blue' : ''}">${x.brief ? '简报' : '无简报'}</span><span class="tag${x.posters ? ' blue' : ''}">${x.posters ? '海报 ' + x.posters.n : '无海报'}</span><span class="tag${x.ph ? ' blue' : ''}">${x.ph ? '灵感 ' + x.ph.n : '无灵感'}</span><span class="d">${esc(x.date)}</span></div>`).join('')}</div>` : emptyBox('还没有汇总', '')}`;
  write(f, page(f, '每日汇总', 'digest', body));
}

// ---- 首页 ----
{
  const f = 'index.html';
  const colCards = columns.map((c, k) => { const n = pages.filter(i => i.column === c.id).length; const pend = items.filter(i => i.column === c.id && !isPage(i)).length;
    const meta = n ? `<span class="tag blue">${n} 篇</span>` : (pend ? `<span class="tag">${pend} 篇未开始</span>` : '<span class="tag">还没有内容</span>');
    return `<a class="card c${k % 4 + 1}" href="${c.dir}/index.html"><span class="go">→</span><div class="ic">${colIc(c, 20)}</div><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p><div class="meta">${meta}</div></a>`; }).join('')
    + `<a class="card c1" href="x-brief/index.html"><span class="go">→</span><div class="ic">${ic('newspaper', 20)}</div><h3>X 简报</h3><p>每天一期的 X 中文简报，按日期翻往期。</p><div class="meta"><span class="tag blue">每日更新</span></div></a>`
    + `<a class="card c2" href="x-posters/index.html"><span class="go">→</span><div class="ic">${ic('image', 20)}</div><h3>X 海报</h3><p>每天从 X 挑技术帖做成康奈尔笔记海报，附原帖信息。</p><div class="meta"><span class="tag blue">每日更新</span></div></a>`
    + (DSH ? `<a class="card c3" href="dsh-plugins/index.html"><span class="go">→</span><div class="ic">${ic('boxes', 20)}</div><h3>DSH 插件</h3><p>DeepSeek Harness 插件市场盘点：生态、清单格式、审核，以及对企业工作台最值得抄的机制。</p><div class="meta"><span class="tag blue">${dshVerified} 个核实</span></div></a>` : '');
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
  const revData = JSON.stringify({ queue: review.queue, items: Object.fromEntries(items.map(i => [i.id, { title: i.title, label: i.label, href: i.href, col: colById[i.column]?.title || '', ic: colIc(colById[i.column], 14) }])) }).replace(/</g, '\\u003c');
  // ---- 首页骨架：A/B/C 三个主题共用同一套结构（今日 + 新闻 / 学习），靠 html[data-theme] 的令牌切换视觉 ----
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
  const colsCard = columns.map((c, k) => `<a class="hc c${k % 5 + 1}" href="${c.dir}/index.html"><i>${colIc(c, 18)}</i><span>${esc(c.title)}</span><em>${items.filter(i => i.column === c.id).length}</em></a>`).join('');
  // ---- 首页：只输出一套结构（下面的 layC），A/B/C 主题只换视觉令牌；数据全部来自 data/ 与 x-brief / x-posters ----
  const T = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const BR = (() => { if (!latestBrief) return null; const h = fs.readFileSync(path.join(ROOT, 'x-brief', latestBrief.d + '.html'), 'utf8');
    const secs = h.split(/<h2 id="/).slice(1).map(x => { const id = x.slice(0, x.indexOf('"')); const t = T(x.slice(x.indexOf('>') + 1, x.indexOf('</h2>'))).replace(/^\d+\.\s*/, '');
      const p = (x.match(/<p>([\s\S]*?)<\/p>/) || [])[1]; const tip = (x.match(/<p class="tip">([\s\S]*?)<\/p>/) || [])[1]; const h3 = [...x.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(m => T(m[1]));
      return { id, t, p: T(p), tip: T(tip).replace(/^\s*(💡)?\s*(一句话：)?/u, ''), h3 }; }).filter(s => s.t && (s.p || s.h3.length));
    const s0 = secs[0] || { id: '', t: '', p: '', tip: '', h3: [] }; return { d: latestBrief.d, t: latestBrief.t, href: `x-brief/${latestBrief.d}.html`, lead: s0.h3[0] || s0.t, sum: s0.p, tip: s0.tip, s0, secs }; })();
  const PIMG = posters.flatMap(p => { try { const h = fs.readFileSync(path.join(ROOT, 'x-posters', p.d, 'index.html'), 'utf8');
    return [...h.matchAll(/<section class="[^"]*\bpc" id="([^"]+)"[\s\S]*?<img src="([^"]+)" alt="([^"]*)"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(m => ({ d: p.d, href: `x-posters/${p.d}/index.html#${m[1]}`, src: `x-posters/${p.d}/${m[2]}`, t: T(m[4]) || m[3] })); } catch { return []; } }).slice(0, 6);
  if (!PIMG.length && latestPoster) latestPoster.imgs.forEach(m => PIMG.push({ d: latestPoster.d, href: `x-posters/${latestPoster.d}/index.html`, src: m.src, t: m.alt }));
  // 正在学：只列至少有一讲已上线学习页（进行中/已学完/已掌握）的课；未开始的课只在「公开课」栏目里出现
  const localPage = i => isPage(i) && !/^https?:/.test(i.href || '');
  const CR = groups.map(G => { const all = items.filter(i => i.group === G.id).sort(ord); if (!all.some(isPage)) return null; const n = all.length, cnt = countBy(all), done = cnt['已学完'] + cnt['已掌握'];
    const parts = G.title.split(' · '); const name = parts.reduce((a, b) => b.length > a.length ? b : a, ''); const src = parts.filter(p => p !== name).join(' · ');
    const pg = all.filter(localPage); const nx = pg.find(i => stateOf(i) === '进行中') || pg.find(i => !['已学完', '已掌握'].includes(stateOf(i))) || pg[0] || null;
    return { name, src, href: `${G.dir}/index.html`, go: nx ? nx.href : `${G.dir}/index.html`, n, done, doing: cnt['进行中'], pct: n ? Math.round(done / n * 100) : 0, ids: all.map(i => i.id).join(','), all, nx, rev: nx && ['已学完', '已掌握'].includes(stateOf(nx)) }; }).filter(Boolean);
  const COLS = [...columns.map(c => ({ ic: colIc(c, 16), t: c.title, href: `${c.dir}/index.html`, n: items.filter(i => i.column === c.id).length })), { ic: ic('puzzle'), t: '概念卡', href: 'glossary.html', n: concepts.length }, { ic: ic('newspaper'), t: 'X 简报', href: 'x-brief/index.html', n: '每日' }, { ic: ic('image'), t: 'X 海报', href: 'x-posters/index.html', n: '每日' }, { ic: ic('rocket'), t: '产品灵感', href: 'ph-inspo/index.html', n: '每日' }];
  if (DSH) COLS.push({ ic: ic('boxes', 16), t: 'DSH 插件', href: 'dsh-plugins/index.html', n: dshVerified });
  const allIds = items.filter(isPage).map(i => i.id).join(',');
  const prog = (ids, cls = '') => `<div class="bigbar prog ${cls}" data-k="prog" data-ids="${ids}"><div class="bar"><i class="g"></i><i class="l"></i><i class="b"></i></div><b>0%</b><span></span></div>`;
  const seg = c => `<div class="seg">${c.all.map(i => { const s = stateOf(i); return `<i class="${['已学完', '已掌握'].includes(s) ? 'd' : s === '进行中' ? 'p' : ''}" title="${esc(i.label)} · ${esc(s)}"></i>`; }).join('')}</div>`;
  const nxA = (c, cls = '') => c.nx ? `<a class="${cls}" href="${esc(c.go)}">${c.rev ? '去复习' : '下一讲'} ${esc(c.nx.label)} · ${esc(c.nx.title)}</a>` : '';
  const crMeta = c => `已学完 ${c.done}/${c.n}${c.doing ? ` · 进行中 ${c.doing}` : ''}`;
  const readRows = reading.map(i => `<div class="row"><span class="t"><a href="${esc(i.href)}"${ext(i.href)}>${esc(i.title)}</a></span><span class="tag">${esc(colById[i.column]?.title)}</span></div>`).join('') || '<div class="row"><span class="t">没有在读的单篇</span></div>';
  const noBrief = '<p class="mute">还没有简报</p>', noPost = '<p class="mute">还没有海报</p>';
  const pimg = (p, cls = '') => `<a class="${cls}" href="${esc(p.href)}"><img src="${esc(p.src)}" alt="${esc(p.t)}" loading="lazy"><span>${p.d.slice(5).replace('-', '/')} · ${esc(p.t)}</span></a>`;
  // 首页三套主题共用这一套结构（今日 + 新闻 / 学习）。视觉靠 data-theme 的令牌和顶栏/侧栏区分。
  const md = d => d ? esc(String(d).slice(5).replace('-', '/')) : '';
  const briefDir = path.join(ROOT, 'x-brief');
  const TD_BRIEF = (fs.existsSync(briefDir) ? fs.readdirSync(briefDir) : []).filter(x => /^\d{4}-\d\d-\d\d\.html$/.test(x)).sort().reverse().map(x => {
    const h = fs.readFileSync(path.join(briefDir, x), 'utf8');
    const d = x.slice(0, 10);
    let title = '', sub = '今日主线';
    const qm = h.match(/今日主线<\/div>\s*<ol class="quick">([\s\S]*?)<\/ol>/);
    if (qm) { const li = qm[1].match(/<li>([\s\S]*?)<\/li>/); if (li) title = T(li[1]); }
    if (!title) {
      const h2 = h.match(/<h2 id="[^"]+"[^>]*>([\s\S]*?)<\/h2>\s*<p>([\s\S]*?)<\/p>/);
      if (h2) { title = T(h2[2]); sub = T(h2[1]) || '简报'; }
    }
    if (!title) { title = T((h.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || ''); sub = ''; }
    return title ? { d: briefBeijingDate(d, h), href: `x-brief/${d}.html`, title, sub } : null;
  }).filter(Boolean).sort((a, b) => b.d.localeCompare(a.d));
  const posterDir = path.join(ROOT, 'x-posters');
  const TD_POST = (fs.existsSync(posterDir) ? fs.readdirSync(posterDir) : []).filter(x => /^\d{4}-\d\d-\d\d$/.test(x) && fs.existsSync(path.join(posterDir, x, 'index.html'))).sort().reverse().map(d => {
    const h = fs.readFileSync(path.join(posterDir, d, 'index.html'), 'utf8');
    const h1 = T((h.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || '');
    const h3s = [...h.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(m => T(m[1])).filter(Boolean);
    if (!h1 && !h3s.length) return null;
    return { d, href: `x-posters/${d}/index.html`, title: h1 || `${h3s.length} 张技术海报`, sub: h3s[0] || '', n: h3s.length };
  }).filter(Boolean);
  const todayBuild = shanghaiDate(new Date()); // 选雷达那一天按北京时间，不按构建机本地日历
  const pickDay = arr => {
    if (!arr.length) return null;
    const hit = arr.find(x => x.d === todayBuild);
    if (hit) return { ...hit, fresh: true };
    const prev = arr.filter(x => x.d <= todayBuild).sort((a, b) => b.d.localeCompare(a.d))[0];
    return prev ? { ...prev, fresh: false } : null;
  };
  const icBrief = ic('newspaper', 16), icPost = ic('image', 16), icPh = ic('rocket', 16), icRev = ic('graduation-cap', 16), icDg = ic('calendar', 16), icRd = ic('radar', 16);
  const CK = ic('circle-check', 18);
  // 今日的新闻：一条「每日汇总」（简报 + 海报 + 产品灵感，与北京时间 9:00 推送同一份 data/digest/D.json）+ 一条雷达最近补录
  const TD_DG = DG.list.map(x => ({ d: x.date, href: x.href, brief: x.brief ? { href: x.brief.href, t: x.brief.lines[0] || x.brief.title } : null,
    poster: x.posters ? { href: x.posters.href, n: x.posters.n, items: x.posters.items.slice(0, 2).map(p => [p.href, p.title]) } : null,
    ph: x.ph ? { href: x.ph.href, n: x.ph.n, list: x.ph.listDate, items: x.ph.items.slice(0, 3).map(i => [i.href, (i.rank != null ? '#' + i.rank + ' ' : '') + i.name]) } : null }));
  const TD_RD = RADAR ? (() => { const L = RADAR.entries.filter(e => e.added === RADAR.updated).sort((a, b) => b.id - a.id); const e = L[0];
    return e ? [{ d: RADAR.updated, href: `radar/index.html#r${e.id}`, title: e.name, sub: e.what, n: L.length }] : []; })() : [];
  const tdPayload = { dg: TD_DG, radar: TD_RD, ic: { dg: icDg, radar: icRd, brief: icBrief, poster: icPost, ph: icPh, rev: icRev } };
  // 汇总那一行：Node 端先按北京时间渲染，浏览器端用同一个函数（toString 注入）按浏览者的北京时间重渲染
  function dgRow(x, fresh, on, CKH, E, IC) {
    var md = function (d) { return d.slice(5).replace('-', '/'); };
    var miss = fresh ? '今天的还没出' : '还没出';
    var ln = function (k, ic, inner) { return '<li><span class="k">' + ic + k + '</span><span class="v">' + inner + '</span></li>'; };
    var links = function (arr) { return arr.map(function (a) { return '<a href="' + E(a[0]) + '">' + E(a[1]) + '</a>'; }).join('<i>、</i>'); };
    var b = x.brief ? '<a href="' + E(x.brief.href) + '">' + E(x.brief.t) + '</a>' : '<em>' + miss + '</em>';
    var p = x.poster ? links(x.poster.items) + (x.poster.n > x.poster.items.length ? '<i> 等 ' + x.poster.n + ' 张</i>' : '') : '<em>' + miss + '</em>';
    var h = x.ph ? '<i>榜单 ' + md(x.ph.list) + ' · </i>' + links(x.ph.items) + (x.ph.n > x.ph.items.length ? '<i> 等 ' + x.ph.n + ' 个</i>' : '') : '<em>' + miss + '</em>';
    var title = md(x.d) + ' 每日汇总';
    return '<div class="row td-dgr' + (on ? ' on' : '') + '"><button type="button" class="td-ck" data-id="digest:' + E(x.d) + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + (on ? '取消已看：' : '标为看过：') + E(title) + '">' + (on ? CKH : '<span class="td-box"></span>') + '</button><span class="td-src">' + IC.dg + '<span>每日汇总</span></span><span class="t"><a href="' + E(x.href) + '" title="打开' + E(title) + '页">' + E(title) + '</a><ul class="td-dg">' + ln('X 简报', IC.brief, b) + ln('X 海报', IC.poster, p) + ln('产品灵感', IC.ph, h) + '</ul></span><span class="d">' + (fresh ? '今天' : md(x.d)) + '</span></div>';
  }
  const tdJson = JSON.stringify(tdPayload).replace(/</g, '\\u003c');
  const ckJson = JSON.stringify(CK).replace(/</g, '\\u003c');
  const metaDate = (fresh, d, extra) => { const base = fresh ? '今天' : `${d.slice(5).replace('-', '/')} · 最近一天`; return extra ? `${base} · ${extra}` : base; };
  // 每日汇总行：始终是最新一天。构建机可能还在美东前一天，「今天」按北京时间算，不按本机日历。
  const bjBuild = shanghaiDate(new Date());
  const gLatest = TD_DG.slice().sort((a, b) => b.d.localeCompare(a.d))[0] || null;
  const g0 = gLatest ? { ...gLatest, fresh: gLatest.d === bjBuild } : null;
  const r0 = pickDay(TD_RD);
  const ssrRow = r => `<div class="row"><button type="button" class="td-ck" data-id="${esc(r.id)}" aria-pressed="false" aria-label="标为看过：${esc(r.title)}"><span class="td-box"></span></button><span class="td-src">${r.ic}<span>${esc(r.src)}</span></span><span class="t"><a href="${esc(r.href)}" title="${esc(r.title)}">${esc(r.title)}</a>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><span class="d">${esc(r.meta)}</span></div>`;
  const ssrEmpty = (src, icn, text) => `<div class="row td-empty"><span class="td-src">${icn}<span>${esc(src)}</span></span><span class="t">${text}</span></div>`;
  const ssrList = [
    g0 ? dgRow(g0, g0.fresh, false, CK, esc, tdPayload.ic) : ssrEmpty('每日汇总', icDg, '还没有汇总'),
    ...(RADAR ? [r0 ? ssrRow({ id: 'radar:' + r0.d, src: '雷达', ic: icRd, href: r0.href, title: r0.title, sub: r0.sub, meta: metaDate(r0.fresh, r0.d, '新增 ' + r0.n + ' 条').replace('最近一天', '最近一次') }) : ssrEmpty('雷达', icRd, '雷达还没有条目')] : []),
    ssrEmpty('复习', icRev, '今天没有到期的复习 ' + ic('party-popper', 15)),
  ].join('');
  const latestStart = id => { const ds = items.filter(i => i.column === id && i.start).map(i => i.start).sort(); return ds.length ? ds[ds.length - 1] : null; };
  const colCount = id => items.filter(i => i.column === id).length;
  const dateBit = o => o.when ? `<span>${esc(o.when)}</span>` : (o.d ? `<span>更新 ${md(o.d)}</span>` : '<span>日期未获取</span>');
  const v2card = o => `<a class="card" href="${esc(o.href)}"><span class="go">→</span><div class="ic">${o.ic}</div><h3>${esc(o.t)}</h3><p>${esc(o.desc)}</p><div class="meta"><span class="tag blue">${esc(o.count)}</span>${dateBit(o)}</div></a>`;
  const phN = (PHI.days || []).reduce((n, d) => n + ((d.items || []).length), 0);
  const phTop = (PHI.days || []).filter(d => d.date && (d.items || []).length).sort((a, b) => b.date.localeCompare(a.date))[0];
  const postN = TD_POST.reduce((n, p) => n + (p.n || 0), 0);
  const newsList = [
    { href: 'x-brief/index.html', ic: ic('newspaper', 20), t: 'X 简报', desc: '每天一期的 X 中文简报，按日期翻往期。', count: `${TD_BRIEF.length} 期`, d: TD_BRIEF[0] ? TD_BRIEF[0].d : null },
    { href: 'x-posters/index.html', ic: ic('image', 20), t: 'X 海报', desc: '每天从 X 挑技术帖做成康奈尔笔记海报，附原帖信息。', count: `${postN} 张`, d: TD_POST[0] ? TD_POST[0].d : null },
    { href: 'ph-inspo/index.html', ic: ic('rocket', 20), t: '产品灵感', desc: '从 Product Hunt 榜单里挑的产品。日期是太平洋时间的榜单日。', count: `${phN} 个`, when: phTop ? `榜单 ${phTop.date.slice(5).replace('-', '/')}` : null },
  ];
  if (RADAR) newsList.push({ href: 'radar/index.html', ic: ic('radar', 20), t: '雷达', desc: '企业级 coding agent 工作台的开源参考，按工具链方向分组。', count: `${RADAR.entries.length} 条`, when: '每周一更新，平时随时补录' });
  const learnList = [];
  const pushCol = c => learnList.push({ href: `${c.dir}/index.html`, ic: colIc(c, 20), t: c.title, desc: c.desc, count: `${colCount(c.id)} 条`, d: latestStart(c.id) });
  const courseCol = columns.find(c => c.id === 'courses');
  if (courseCol) pushCol(courseCol);
  learnList.push({ href: 'glossary.html', ic: ic('puzzle', 20), t: '概念卡', desc: '一个术语一张卡，跨栏目串起来。', count: `${concepts.length} 张`, d: gitDay('data/concepts.json') });
  if (DSH) learnList.push({ href: 'dsh-plugins/index.html', ic: ic('boxes', 20), t: 'DSH 插件', desc: 'DeepSeek Harness 插件市场盘点：生态、清单格式、审核，以及对企业工作台最值得抄的机制。', count: `${dshVerified} 个核实`, d: DSH.asOf || null });
  for (const c of columns) if (c.id !== 'courses') pushCol(c);
  const layC = `<div class="home-v2">
<section class="td" id="today" aria-labelledby="td-h">
<div class="td-h"><h1 id="td-h">今日</h1><span class="td-prog" data-td="prog"></span><span class="kk" data-f="date">今天</span></div>
<p id="prog-hint" class="td-synchint" hidden></p>
<p class="sub">每日汇总是最新一天，和早上 9 点（北京时间）推送的是同一份。和北京时间的今天同一天时标「今天」，否则标日期。缺的来源写「还没出」。雷达看最近一次补录；到期要复习的课也列在这里。</p>
<div class="td-fin" data-td="fin" hidden role="status">${ic('party-popper', 16)}<span>今天读完了</span></div>
<div class="list" data-td="list">${ssrList}</div>
</section>
<div class="kicker" id="k-news">新闻 <span class="n">${newsList.length}</span></div>
<div class="sub">简报、海报、灵感每天刷新，看过即过</div>
<div class="td-cols">${newsList.map(v2card).join('')}</div>
<div class="kicker" id="k-learn">学习 <span class="n">${learnList.length}</span></div>
<div class="sub">按进度走，按需查</div>
<div class="td-cols">${learnList.map(v2card).join('')}</div>
</div>`;
  const body = layC;
  const script = `const R=${revData};const TD=${tdJson};const CK=${ckJson};const p=n=>String(n).padStart(2,'0');const today=bjToday(); /* 北京时间的今天；自查用：?today=2026-10-14 */
function bjToday(){var q=new URLSearchParams(location.search).get('today');if(q)return q;try{var s=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(/^\\d{4}-\\d{2}-\\d{2}$/.test(s))return s}catch(e){}var t=new Date(Date.now()+8*36e5);return t.getUTCFullYear()+'-'+p(t.getUTCMonth()+1)+'-'+p(t.getUTCDate())}
const add=(t,n)=>{const x=new Date(t+'T12:00:00');x.setDate(x.getDate()+n);return x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate())};
/* 今日待办只收「学完了」过的篇：done:<pathname>；兼容 /courses/X↔软链、index.html↔尾斜杠 */
const doneExpand=u=>{const out=[],vs=new Set([u]);if(u.endsWith('/index.html')){const d=u.slice(0,-10);vs.add(d);vs.add(d.replace(/\\/$/,'')||'/')}else if(u.endsWith('/')){vs.add(u+'index.html');vs.add(u.replace(/\\/$/,'')||'/')}else if(!/\\.[a-z0-9]+$/i.test(u)){vs.add(u+'/');vs.add(u+'/index.html')}for(const x of vs){out.push(x);const m=x.match(/^(.*)\\/courses\\/(.+)$/);if(m)out.push(m[1]+'/'+m[2]);const m2=x.match(/^(.*)\\/(cs146s)\\/(.+)$/);if(m2&&!x.includes('/courses/'))out.push(m2[1]+'/courses/'+m2[2]+'/'+m2[3])}return[...new Set(out)]};
const doneOf=h=>{const keys=[];const add=u=>{for(const k of doneExpand(u))if(!keys.includes(k))keys.push(k)};try{add(new URL(h,new URL(__R,location.href)).pathname)}catch(e){}try{add(new URL(h,location.href).pathname)}catch(e){}for(const k of keys){const d=localStorage.getItem('done:'+k);if(d)return d}return null};
const iso=s=>typeof s==='string'&&/^\\d{4}-\\d{2}-\\d{2}$/.test(s)?s:'';
const earlier=(a,b)=>!a?b:!b?a:(a<b?a:b);
const started=new Set();
/* 学过：review.json 的 learned，或本机 done:<path>。排期用更早的那天；只有一边就用那一边。路径仍交给 doneOf，不改写。 */
const BAKED=JSON.parse(JSON.stringify(R.queue));
function plan(queue){started.clear();R.queue=JSON.parse(JSON.stringify(queue));for(const q of R.queue){const it=R.items[q.item];if(!it)continue;const dd=earlier(iso(q.learned),iso(doneOf(it.href)));if(!dd)continue;started.add(q.item);q.start=dd;for(const r of q.reviews)r.date=add(dd,r.day)}}
plan(BAKED);
const diff=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
/* 复习是否完成：review.json 的 done，或本机 rev-done:<itemId>（第几天 → 完成日期）。A/B/C 共用下面的 bucket。 */
const G={over:[],today:[],later:[],seen:[]};
function revMap(id){try{const o=JSON.parse(localStorage.getItem('rev-done:'+id)||'{}');return o&&typeof o==='object'&&!Array.isArray(o)?o:{}}catch(e){return {}}}
function revPut(id,o){try{const k='rev-done:'+id;if(!o||!Object.keys(o).length)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(o))}catch(e){}}
function revDated(m,day){const v=m[day];return typeof v==='string'&&/^\\d{4}-\\d{2}-\\d{2}$/.test(v)?v:''}
function bucket(){G.over.length=0;G.today.length=0;G.later.length=0;G.seen.length=0;
 for(const q of R.queue){if(!started.has(q.item)||!R.items[q.item])continue;const m=revMap(q.item);const done=r=>!!r.done||!!revDated(m,r.day);
  const pend=q.reviews.filter(r=>!done(r));const due=pend.filter(r=>r.date<=today);
  if(due.length){const late=diff(due[0].date,today);(late>0?G.over:G.today).push({item:q.item,day:due[due.length-1].day,late,n:due.length,date:due[0].date})}
  else if(pend.length)G.later.push({item:q.item,day:pend[0].day,date:pend[0].date,inN:diff(today,pend[0].date)});
  const fin=q.reviews.filter(r=>revDated(m,r.day)===today); /* 当天勾完的仍留在「今日」，方便「已看」计数；第二天 revDated!==today 就消失 */
  if(fin.length&&!due.length){const late=diff(fin[0].date,today);G.seen.push({item:q.item,day:fin[fin.length-1].day,late,n:fin.length,date:fin[0].date,on:1})}}
 G.over.sort((a,b)=>b.late-a.late);G.later.sort((a,b)=>a.date.localeCompare(b.date))}
function toggleRev(id){const q=R.queue.find(x=>x.item===id);if(!q)return;const m=revMap(id);const marked=q.reviews.filter(r=>revDated(m,r.day)===today);
 if(marked.length){for(const r of marked)delete m[r.day];revPut(id,m);return} /* 同一天再点一次，撤销今天勾上的那些天 */
 for(const r of q.reviews){if(r.done||revDated(m,r.day))continue;if(r.date<=today)m[r.day]=today} /* 一次勾完当前全部到期，积压清掉 */
 revPut(id,m)}
const F=(k,v)=>document.querySelectorAll('[data-f="'+k+'"]').forEach(e=>e.textContent=v);
{const W='日一二三四五六',[y,m,dd]=today.split('-').map(Number),wd=new Date(y,m-1,dd).getDay();F('date',m+' 月 '+dd+' 日 · 星期'+W[wd])}
const LAB={over:'逾期',today:'今天到期',later:'之后'};
const row=(k,r)=>{const it=R.items[r.item];const b=k==='over'?'<b>第 '+r.day+' 天</b> · <span class="late">逾期 '+r.late+' 天</span>'+(r.n>1?' · 积压 '+r.n+' 次':''):k==='today'?'<b>第 '+r.day+' 天</b> · 今天':'第 '+r.day+' 天 · '+r.inN+' 天后（'+r.date.slice(5)+'）';return '<div class="row rvr '+k+'"><i class="ic">'+E(it.ic)+'</i><span class="t"><a href="'+E(it.href)+'">'+E(it.title)+'</a><small>'+E(it.col)+' · '+E(it.label)+' · 第 '+r.day+' 天</small></span><span class="tag">'+E(it.label)+'</span><span class="badge">'+b+'</span></div>'};
let open=false;
function draw(){const dueN=G.over.length+G.today.length,total=dueN+G.later.length;let h='',c=0;const lim=open?1e9:5;if(!dueN)h+='<div class="row"><span class="t" style="font-weight:500">今天（'+today+'）没有到期的复习 '+__ic('party-popper',15)+'</span></div>';
 for(const k of ['over','today','later']){const L=G[k];if(!L.length||c>=lim)continue;h+='<div class="rv-g '+k+'">'+LAB[k]+' <span class="c">'+L.length+'</span></div>';for(const r of L){if(c>=lim)break;h+=row(k,r);c++}}
 if(total>5)h+='<button class="rv-more" type="button">'+(open?'收起':'展开全部（共 '+total+' 篇）')+'</button>';
 document.querySelectorAll('[data-rv="full"]').forEach(el=>{el.innerHTML='<div class="list">'+h+'</div>';const b=el.querySelector('.rv-more');if(b)b.onclick=()=>{open=!open;draw()}})}
function paint(){const dueN=G.over.length+G.today.length;
 F('over',G.over.length);F('today',G.today.length);F('duen0',dueN);F('duen',dueN?dueN+' 篇到期':'无到期');F('overmax',G.over.length?'最久 '+G.over[0].late+' 天':'没有逾期');
 document.querySelectorAll('[data-f="overbox"]').forEach(e=>{e.classList.toggle('red',!!G.over.length);if(!G.over.length)e.classList.remove('hot')});
 const top=G.over[0]||G.today[0];F('sum',dueN?('今天有 '+dueN+' 篇该复习'+(G.over.length?'，其中 '+G.over.length+' 篇已经逾期':'')+'。先从「'+R.items[top.item].title+'」开始。'):(G.later.length?'下一次复习在 '+G.later[0].date.slice(5)+'：'+R.items[G.later[0].item].title+'。':'复习队列是空的，去学点新东西吧。'));
 draw();
 const short=[...G.over.map(r=>['over',r]),...G.today.map(r=>['today',r])];const sl=short.length?short.slice(0,6).map(([k,r])=>{const it=R.items[r.item];return '<li><a href="'+E(it.href)+'">'+E(it.title)+'</a><em class="'+k+'">'+(k==='over'?'逾期 '+r.late+' 天':'今天')+'</em></li>'}).join('')+(short.length>6?'<li class="more"><a href="#b-review" onclick="__setTheme(\\'B\\')">还有 '+(short.length-6)+' 篇 →</a></li>':''):'<li>今天没有到期的复习 '+__ic('party-popper',15)+''+(G.later.length?'（下一次 '+G.later[0].date.slice(5)+'）':'')+'</li>';
 document.querySelectorAll('[data-rv="ol"],[data-rv="ul"]').forEach(el=>el.innerHTML=sl)}
window.__favRender=function(L){var TN={'x-brief':'X 简报','poster':'X 海报','concept':'概念卡','course':'公开课','page':'页面'};var h=L.length?L.slice(0,5).map(x=>'<div class="row"><span class="tag">'+E(TN[x.type]||'页面')+'</span><span class="t">'+((function(u){try{var q=new URL(String(u||''),location.href).protocol;return q==='http:'||q==='https:'}catch(e){return false}})(x.url)?'<a href="'+E(x.url)+'">'+E(x.title)+'</a>':E(x.title))+'</span><span class="d">'+E((x.added_at||'').slice(0,10))+'</span></div>').join(''):'<div class="row"><span class="t" style="font-weight:400;color:var(--meta)">还没有收藏，在任意页面点 '+__ic('star',13)+' 就能收藏</span></div>';document.querySelectorAll('[data-fav]').forEach(el=>el.innerHTML=h)};window.__favRender([]);
function tdPick(arr){if(!arr||!arr.length)return null;var hit=null;for(var i=0;i<arr.length;i++)if(arr[i].d===today)hit=arr[i];if(hit)return Object.assign({fresh:true},hit);var prev=null;for(var j=0;j<arr.length;j++)if(arr[j].d<=today&&(!prev||arr[j].d>prev.d))prev=arr[j];return prev?Object.assign({fresh:false},prev):null}
function tdMeta(fresh,d,extra){var base=fresh?'今天':(d.slice(5).replace('-','/')+' · 最近一天');return extra?base+' · '+extra:base}
function tdLoad(){try{return JSON.parse(localStorage.getItem('today-read:'+today)||'{}')||{}}catch(e){return {}}} /* 简报/雷达等同天已看；复习完成不写这里，写 rev-done */
function tdSave(o){try{localStorage.setItem('today-read:'+today,JSON.stringify(o))}catch(e){}}
${dgRow.toString()}
function tdRows(){var rows=[],src=TD.dg&&TD.dg.length?TD.dg.slice().sort(function(a,b){return a.d<b.d?1:a.d>b.d?-1:0})[0]:null,g=src?Object.assign({},src,{fresh:src.d===bjToday()}):null,rd=tdPick(TD.radar);
 if(g)rows.push({id:'digest:'+g.d,dg:g});else rows.push({src:'每日汇总',ic:TD.ic.dg,title:'还没有汇总'});
 if(TD.radar.length){if(rd)rows.push({id:'radar:'+rd.d,src:'雷达',ic:TD.ic.radar,href:rd.href,title:rd.title,sub:rd.sub||'',meta:tdMeta(rd.fresh,rd.d,'新增 '+rd.n+' 条').replace('最近一天','最近一次')});else rows.push({src:'雷达',ic:TD.ic.radar,title:'雷达还没有条目'})}
 var due=[].concat(G.over,G.today,G.seen);
 if(!due.length)rows.push({src:'复习',ic:TD.ic.rev,title:'今天没有到期的复习 '+__ic('party-popper',15),html:1});
 else due.forEach(function(r){var it=R.items[r.item];if(!it)return;var q=R.queue.find(function(x){return x.item===r.item}),lo=q&&q.start?q.start.slice(5).replace('-','/'):'';rows.push({id:'rev:'+r.item,src:'复习',ic:TD.ic.rev,href:it.href,title:it.title,sub:(it.col?it.col+' · ':'')+(it.label?it.label+' · ':'')+(lo?lo+' 学完，':'')+'第 '+r.day+' 天复习'+(r.n>1?' · 积压 '+r.n+' 次':''),meta:r.late>0?('逾期 '+r.late+' 天'):'今天到期',over:r.late>0,on:r.on?1:0})});
 return rows}
var tdFirst=1;
function renderToday(focusId){var box=document.querySelector('[data-td="list"]');if(!box)return;var saved=tdLoad(),rows=tdRows(),checks=rows.filter(function(r){return r.id}),k=0;
 box.innerHTML=rows.map(function(r){var rev=!!(r.id&&String(r.id).indexOf('rev:')===0);var on=rev?!!r.on:!!(r.id&&saved[r.id]);if(on)k++;var title=r.html?r.title:E(r.title);
  if(r.dg)return dgRow(r.dg,r.dg.fresh,on,CK,E,TD.ic);
  if(!r.id)return '<div class="row td-empty"><span class="td-src">'+r.ic+'<span>'+E(r.src)+'</span></span><span class="t">'+title+'</span></div>';
  var ext=/^https?:/.test(r.href)?' target="_blank" rel="noopener"':'';
  var act=on?(rev?'取消本次复习：':'取消已看：'):(rev?'标为已复习：':'标为看过：');
  return '<div class="row'+(on?' on':'')+'"><button type="button" class="td-ck" data-id="'+E(r.id)+'" aria-pressed="'+(on?'true':'false')+'" aria-label="'+act+E(r.title)+'">'+(on?CK:'<span class="td-box"></span>')+'</button><span class="td-src">'+r.ic+'<span>'+E(r.src)+'</span></span><span class="t"><a href="'+E(r.href)+'"'+ext+' title="'+E(r.title)+'">'+E(r.title)+'</a>'+(r.sub?'<small>'+E(r.sub)+'</small>':'')+'</span><span class="d'+(r.over?' td-late':'')+'">'+E(r.meta)+'</span></div>'}).join('')||'<div class="row td-empty"><span class="t">今天没有要读的</span></div>';
 var fin=document.querySelector('[data-td="fin"]');if(fin)fin.hidden=!(checks.length&&k===checks.length);
 var prog=document.querySelector('[data-td="prog"]');if(prog)prog.textContent=checks.length?(k+'/'+checks.length+' 已看'):'';
 if(tdFirst&&!matchMedia('(prefers-reduced-motion: reduce)').matches){tdFirst=0;box.querySelectorAll('.row').forEach(function(e,i){e.style.setProperty('--i',String(Math.min(i,10)));e.classList.add('fx-st')});document.querySelectorAll('.td-cols>.card').forEach(function(e,i){e.style.setProperty('--i',String(Math.min(i,10)));e.classList.add('fx-st')})}
 box.querySelectorAll('.td-ck').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-id');
  if(id&&id.indexOf('rev:')===0){var rid=id.slice(4),prev=revMap(rid);toggleRev(rid);var next=revMap(rid);bucket();paint();renderToday(id);if(window.PROG&&PROG.onReview)PROG.onReview(rid,prev,next);return}
  var o=tdLoad();if(o[id])delete o[id];else o[id]=1;tdSave(o);renderToday(id)}});
 if(focusId){var nb=box.querySelector('.td-ck[data-id="'+focusId.replace(/"/g,'')+'"]');if(nb)nb.focus()}}
bucket();paint();renderToday();
/* 云端进度：生成页里嵌的 review.json 是构建那一刻的，浏览器提交「学完了」、复习勾选不会触发重建。
   打开首页时再读一次仓库里的 data/review.json（有令牌走 API，最新；没令牌读 Pages 上的副本），以它的 learned / done / doneOn 为准。 */
function mergeCloud(doc){if(!doc||!Array.isArray(doc.queue))return;var by={},ch=0;doc.queue.forEach(function(c){if(c&&c.item)by[c.item]=c});
 var next=BAKED.map(function(q){var c=by[q.item];if(!c)return q;var n=JSON.parse(JSON.stringify(q));var cl=iso(c.learned)||undefined;if(cl!==n.learned){if(cl)n.learned=cl;else delete n.learned;ch=1}
  (n.reviews||[]).forEach(function(r){var cr=(c.reviews||[]).find(function(x){return +x.day===+r.day});if(!cr)return;if(!!cr.done!==!!r.done){r.done=!!cr.done;ch=1}if(iso(cr.doneOn))r.doneOn=cr.doneOn;else delete r.doneOn});return n});
 if(!ch)return;plan(next);bucket();paint();renderToday()}
function loadCloud(){var tk='';try{tk=localStorage.getItem('fav:token')||''}catch(e){}var base=new URL(typeof __R==='string'?__R:'index.html',location.href);
 var pub=function(){return fetch(new URL('data/review.json?t='+Date.now(),base).href,{cache:'no-store'}).then(function(r){return r.ok?r.json():null})};
 var dec=function(j){return j&&j.content?JSON.parse(decodeURIComponent(escape(atob(String(j.content).replace(/\\s/g,''))))):null};
 var p=tk?fetch('https://api.github.com/repos/ww880412/learning/contents/data/review.json?ref=main&t='+Date.now(),{headers:{Authorization:'Bearer '+tk,Accept:'application/vnd.github+json'},cache:'no-store'}).then(function(r){return r.ok?r.json().then(dec):pub()}).catch(pub):pub();
 return p.then(mergeCloud).catch(function(){}).then(function(){window.__cloudReady=1})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadCloud);else loadCloud();`;
  write(f, page(f, '首页', 'home', body, script));
}
// ---- 栏目页 + 主题页 ----
for (const c of columns) {
  const f = `${c.dir}/index.html`; const its = pages.filter(i => i.column === c.id); const gs = groups.filter(g => g.column === c.id);
  const pending = items.filter(i => i.column === c.id && !i.group && !isPage(i)).sort((a, b) => a.order - b.order);
  let body = `<div class="crumb"><a href="${rel(f, 'index.html')}">首页</a> / ${esc(c.title)}</div><section class="hero sheet"><div class="say"><span class="kk">栏目</span><h1>${colIc(c, 26)} ${esc(c.title)}</h1><p>${esc(c.desc)}</p></div><div class="stage"><div class="stat blue"><b>${its.length}</b><span>篇学习页</span></div><div class="stat green" data-k="done" data-ids="${its.map(i=>i.id).join(',')}"><b>${its.filter(i => ['已学完','已掌握'].includes(stateOf(i))).length}</b><span>已学完</span></div><div class="stat blue" data-k="doing" data-ids="${its.map(i=>i.id).join(',')}"><b>${its.filter(i => stateOf(i) === '进行中').length}</b><span>进行中</span></div><div class="stat"><b>${pending.length || gs.length}</b><span>${pending.length ? '篇未开始' : '个主题'}</span></div></div></section>`;
  if (!its.length && !gs.length && !pending.length) body += `<div style="margin-top:28px">${emptyBox('还没有内容', `以后学到${esc(c.title)}的内容，会出现在这里。`)}</div>`;
  for (const g of gs) { const gi = its.filter(i => i.group === g.id); const gp = items.filter(i => i.group === g.id && !isPage(i));
    body += `<div class="kicker">主题</div><div class="sub">${esc(g.title)}</div><div class="grid wide"><a class="card c1" href="${rel(f, g.dir + '/index.html')}"><span class="go">→</span><div class="ic">${colIc(c, 20)}</div><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p><div class="meta"><span class="tag blue">${gi.length} 篇学习页</span>${gp.length ? `<span class="tag">${gp.length} 讲未开始</span>` : ''}</div>${progBar(items.filter(i => i.group === g.id))}</a></div>`; }
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
{
  const f = 'favorites/index.html';
  const body = `<section class="hero sheet solo"><div class="say"><span class="kk">我的收藏</span><h1>收藏的页面、简报和海报</h1><p>在任意页面点 ${ic('star', 14)} 收藏。收藏存在仓库的 <code>favorites.json</code>（公开，只存标题、链接和标签）。学完和今日复习写进 <code>data/review.json</code>。两件事共用下面这一枚令牌。</p></div></section>
<div id="tkhint"></div>
<div class="fbar"><input id="fq" type="search" placeholder="搜索标题、标签、备注"><select id="ft"><option value="">全部类型</option></select></div>
<div class="chips" id="ftags"></div><div id="fcount" style="font-size:13px;color:var(--meta);margin:12px 0 8px"></div><div class="list" id="flist"><div class="empty"><b>加载中…</b></div></div>
<details class="panel" id="settings"><summary>${ic('settings', 15)} 同步设置 <span class="s" id="tkstate"></span></summary><div class="pb">
<div class="tkrow"><input id="tk" type="password" autocomplete="off" placeholder="粘贴 github_pat_ 开头的令牌"><button id="tksave" class="pri">保存</button><button id="tkclear">清除</button></div>
<ol><li>电脑上打开 GitHub，右上角头像 → <b>Settings</b> → 左侧最下面 <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>。</li><li>Token name 填「学习站同步」，Expiration 选一个期限（比如 1 年）。</li><li>Repository access 选 <b>Only select repositories</b>，只勾 <code>ww880412/learning</code>。</li><li>Permissions → Repository permissions 里找到 <b>Contents</b>，改成 <b>Read and write</b>，其他保持不动。</li><li>点 <b>Generate token</b>，复制那串 <code>github_pat_…</code>，粘贴到上面的框里点「保存」。每个浏览器（手机、电脑）各做一次。令牌只留在这个浏览器里，用来同步收藏和学习进度（学完、今日复习），不会上传到别的服务器。</li></ol></div></details>`;
  const script = `window.__favRender=function(L){var q=document.getElementById('fq'),t=document.getElementById('ft'),tg=document.getElementById('ftags'),out=document.getElementById('flist');if(!out)return;var TN={'x-brief':'X 简报','poster':'X 海报','concept':'概念卡','course':'公开课','page':'页面'};var types=[...new Set(L.map(x=>x.type||'page'))];var cur=t.value;t.innerHTML='<option value="">全部类型</option>'+types.map(x=>'<option value="'+x+'">'+(TN[x]||x)+'</option>').join('');t.value=types.includes(cur)?cur:'';var tags=[...new Set(L.flatMap(x=>x.tags||[]))];var on=window.__ftag||'';tg.innerHTML=tags.map(x=>'<a class="chip'+(x===on?' more':'')+'" href="#" data-t="'+x.replace(/"/g,'&quot;')+'">#'+x.replace(/</g,'&lt;')+'</a>').join('');tg.querySelectorAll('a').forEach(a=>a.onclick=e=>{e.preventDefault();window.__ftag=window.__ftag===a.dataset.t?'':a.dataset.t;__favRender(FAV.list())});var k=q.value.trim().toLowerCase();var R=L.filter(x=>(!t.value||(x.type||'page')===t.value)&&(!on||(x.tags||[]).includes(on))&&(!k||[x.title,x.note,(x.tags||[]).join(' '),x.url].join(' ').toLowerCase().includes(k)));document.getElementById('fcount').textContent='共 '+L.length+' 条'+(R.length!==L.length?'，筛出 '+R.length+' 条':'');var E=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);var OK=u=>{try{var x=new URL(String(u||''),location.href).protocol;return x==='http:'||x==='https:'}catch(e){return false}};var A=(u,t,ext)=>OK(u)?'<a href="'+E(u)+'"'+(ext?' target="_blank" rel="noopener"':'')+'>'+t+'</a>':'<span>'+t+'</span>';out.innerHTML=R.length?R.map((x,i)=>'<div class="row"><span class="tag">'+E(TN[x.type]||x.type||'页面')+'</span><span class="t">'+A(x.url,E(x.title||x.url),/^https?:/.test(x.url))+''+((x.tags||[]).length?'<div style="font-weight:400;font-size:13px;color:var(--meta)">'+x.tags.map(y=>'#'+E(y)).join(' ')+'</div>':'')+(x.page&&OK(x.page)?'<div style="font-weight:400;font-size:13px"><a href="'+E(x.page)+'">在简报里看 →</a></div>':'')+(x.x&&OK(x.x)?'<div style="font-weight:400;font-size:13px"><a href="'+E(x.x)+'" target="_blank" rel="noopener">X 原帖 →</a></div>':'')+'</span><span class="d">'+E((x.added_at||'').slice(0,10))+'</span><button class="fav-b on" data-i="'+i+'" title="取消收藏">★</button></div>').join(''):'<div class="empty"><b>'+(L.length?'没有符合条件的收藏':'还没有收藏')+'</b>'+(L.length?'':'在任意页面点 '+__ic('star',13)+' 就能收藏')+'</div>';out.querySelectorAll('button[data-i]').forEach(b=>b.onclick=async()=>{if(!FAV.token()){FAV.toast('先打开下面的「同步设置」填令牌');return}if(!confirm('取消收藏「'+R[b.dataset.i].title+'」？'))return;b.style.opacity=.3;try{await FAV.toggleItem(R[b.dataset.i]);FAV.toast('已取消收藏')}catch(e){FAV.toast('没保存成功：'+e.message)}})};
document.getElementById('fq').oninput=document.getElementById('ft').onchange=()=>window.FAV&&__favRender(FAV.list());
function tks(){var t=window.FAV&&FAV.token();document.getElementById('tkstate').textContent=t?'已设置 ✓（…'+t.slice(-4)+'）':'未设置';document.getElementById('tkhint').innerHTML=t?'':'<p class="fhint">这个浏览器还没设置同步：收藏、学完和复习勾选都只留在这台设备。<a href="#settings" onclick="document.getElementById(\\'settings\\').open=true">去同步设置 →</a></p>';}
function openS(){if(location.hash==='#settings')document.getElementById('settings').open=true}window.addEventListener('hashchange',openS);openS();
document.getElementById('tksave').onclick=()=>{var v=document.getElementById('tk').value.trim();if(!/^(github_pat_|ghp_)/.test(v)){alert('看起来不是 GitHub 令牌，应以 github_pat_ 开头');return}FAV.setToken(v);document.getElementById('tk').value='';tks();FAV.toast('已保存令牌')};
document.getElementById('tkclear').onclick=()=>{FAV.setToken('');tks();FAV.toast('已清除令牌')};
document.addEventListener('DOMContentLoaded',tks);`;
  write(f, page(f, '我的收藏', 'favorites', body, script));
}
// ---- 产品灵感（数据 data/ph-inspo.json；按天归档，可按标签、状态筛选） ----
{
  const f = 'ph-inspo/index.html';
  const ST_CLS = { '新发现': 'blue', '在跟进': 'amber', '已试用': 'green', '归档': '' };
  const all = PHI.days.flatMap(d => d.items.map(i => ({ ...i, date: d.date })));
  const tags = [...new Set([...(PHI.tags || []), ...all.flatMap(i => i.tags || [])])].filter(t => all.some(i => (i.tags || []).includes(t)));
  const cnt = s => all.filter(i => i.status === s).length;
  const num = v => v == null || v === '' ? '未获取' : esc(v);
  const xa = (h, t, n) => h ? `<a href="${esc(h)}" target="_blank" rel="noopener">${ic(n, 13)}${t}</a>` : '';
  const fuHtml = it => { const L = it.followups || []; return `<details class="pi-fu"><summary>${ic('history', 13)} 跟进记录 <span class="n">${L.length}</span></summary>${L.length ? `<ul>${L.map(x => `<li><span class="d">${esc(x.date || '')}</span><span class="tag">${esc(x.type || '其他')}</span><span>${esc(x.text)}${x.url ? ` <a href="${esc(x.url)}" target="_blank" rel="noopener">来源 →</a>` : ''}</span></li>`).join('')}</ul>` : '<p>还没有跟进记录。之后每周补：新版本、融资、定价、开源替代。</p>'}</details>`; };
  const card = it => `<article class="card pi-card" id="${esc(it.id)}" data-tags="${esc((it.tags || []).join('|'))}" data-st="${esc(it.status)}">
<div class="pi-hd"><span class="pi-rk" title="当天排名">${it.rank != null ? '#' + esc(it.rank) : '—'}</span><div class="pi-nm"><h3><a href="${esc(it.ph)}" target="_blank" rel="noopener">${esc(it.name)}</a></h3><div class="en">${esc(it.tagline || '')}</div></div><span class="tag st ${ST_CLS[it.status] ?? ''}">${esc(it.status)}</span></div>
<div class="pi-tags">${(it.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
<dl class="pi-f"><dt>是什么</dt><dd>${esc(it.what)}</dd><dt>解决</dt><dd>${esc(it.problem)}</dd><dt>亮点</dt><dd>${esc(it.highlight)}</dd><dt class="ins">${ic('lightbulb', 13)}启发</dt><dd class="ins">${esc(it.inspo)}</dd></dl>
<div class="pi-ft"><span title="PH 综合分（抓取时）">${ic('trending-up', 13)}分数 ${num(it.score)}</span><span>${ic('message-square', 13)}评论 ${num(it.comments)}</span>${xa(it.ph, 'PH', 'rocket')}${xa(it.site, '官网', 'external-link')}${xa(it.repo, '仓库', 'git-fork')}</div>
${fuHtml(it)}</article>`;
  const days = PHI.days.map(d => `<section class="pi-day" data-day="${esc(d.date)}"><div class="kicker">${ic('calendar', 16)} ${esc(d.date)} <span class="n">${d.items.length}</span></div><div class="sub">来源：<a href="${esc(d.source)}" target="_blank" rel="noopener">Product Hunt 当日榜单</a> · 抓取于 ${esc(d.fetched || '未记录')}${d.note ? ' · ' + esc(d.note) : ''}</div>
<div class="pi-grid">${[...d.items].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).map(card).join('')}</div></section>`).join('');
  const chip = (k, v, label, n) => `<button type="button" class="chip${v ? '' : ' on'}" data-k="${k}" data-v="${esc(v)}">${esc(label)}${n != null ? `<em>${n}</em>` : ''}</button>`;
  const body = `<div class="crumb"><a href="../index.html">首页</a> / 产品灵感</div>
<section class="hero sheet pi-hero"><div class="say"><span class="kk">PH灵感箱 · ${PHI.days.length} 天</span><h1>${ic('rocket', 26)} 产品灵感</h1><p>从 Product Hunt 日榜里挑 5–8 个和 coding agent 工作台、AI 工具、开发者工具、效率、创作、教育相关的新产品，写清楚是什么、解决什么、能抄什么。标题上的日期是太平洋时间的榜单日；北京时间早上能看到的最新一份，是两天前的榜。数据在 <code>data/ph-inspo.json</code>。</p></div>
<div class="stage"><div class="stat blue"><b>${all.length}</b><span>个产品</span></div><div class="stat amber"><b>${cnt('在跟进')}</b><span>在跟进</span></div><div class="stat green"><b>${cnt('已试用')}</b><span>已试用</span></div><div class="stat purple"><b>${all.filter(i => (i.tags || []).includes('coding agent')).length}</b><span>coding agent 相关</span></div></div></section>
${all.length ? `<div class="pi-bar"><span class="lb">${ic('tag', 13)}标签</span>${chip('tag', '', '全部')}${tags.map(t => chip('tag', t, t, all.filter(i => (i.tags || []).includes(t)).length)).join('')}</div>
<div class="pi-bar"><span class="lb">${ic('funnel', 13)}状态</span>${chip('st', '', '全部')}${(PHI.statuses || []).map(s => chip('st', s, s, cnt(s))).join('')}<span class="pi-cnt" id="pi-cnt"></span></div>
${days}<div class="empty" id="pi-none" hidden><b>没有符合条件的产品</b>换个标签或状态试试</div>` : emptyBox('还没有产品灵感', '每天的 PH 榜单挑完后会出现在这里（data/ph-inspo.json）。')}`;
  const script = `(function(){var F={tag:'',st:''};var bs=document.querySelectorAll('.pi-bar .chip');function run(){var n=0;document.querySelectorAll('.pi-day').forEach(function(d){var v=0;d.querySelectorAll('.pi-card').forEach(function(c){var ok=(!F.tag||c.dataset.tags.split('|').indexOf(F.tag)>=0)&&(!F.st||c.dataset.st===F.st);c.hidden=!ok;if(ok)v++});d.hidden=!v;n+=v});var e=document.getElementById('pi-none');if(e)e.hidden=!!n;var t=document.getElementById('pi-cnt');if(t)t.textContent=(F.tag||F.st)?'筛出 '+n+' 个':'';bs.forEach(function(b){b.classList.toggle('on',F[b.dataset.k]===b.dataset.v)})}bs.forEach(function(b){b.onclick=function(){F[b.dataset.k]=F[b.dataset.k]===b.dataset.v?'':b.dataset.v;run()}});run()})();`;
  write(f, page(f, '产品灵感', 'ph-inspo', body, script));
}
// ---- DSH 插件市场盘点（数据 data/dsh-plugins.json） ----
if (DSH) {
  const f = 'dsh-plugins/index.html';
  const exp = DSH.expect || {};
  const grp = n => Number(n).toLocaleString('en-US');
  if (dshVerified !== exp.verified) throw new Error(`dsh verify rows ${dshVerified} != ${exp.verified}`);
  if (DSH.highlights.length !== exp.highlights) throw new Error(`dsh highlights ${DSH.highlights.length} != ${exp.highlights}`);
  if (DSH.mechanisms.length !== exp.mechanisms) throw new Error(`dsh mechanisms ${DSH.mechanisms.length} != ${exp.mechanisms}`);
  if (DSH.categories.length !== exp.categoriesListed) throw new Error(`dsh categories ${DSH.categories.length} != ${exp.categoriesListed}`);
  if (String(DSH.kpis[0].value) !== String(dshVerified)) throw new Error('dsh kpi verified');
  if (DSH.kpis[1].value !== grp(DSH.indexEntries)) throw new Error('dsh kpi index');
  if (String(DSH.kpis[2].value) !== String(DSH.categoryTotal)) throw new Error('dsh kpi categories');
  if (String(DSH.kpis[3].value) !== String(DSH.mechanisms.length)) throw new Error('dsh kpi mechanisms');
  const nums = DSH.verify.flatMap(g => g.rows.map(r => r.n));
  if (nums.join(',') !== Array.from({ length: exp.verified }, (_, i) => i + 1).join(',')) throw new Error('dsh verify numbering');
  for (const r of [...DSH.highlights, ...DSH.verify.flatMap(g => g.rows)]) {
    if (!/^https:\/\/github\.com\//.test(r.url || '')) throw new Error('dsh url ' + (r.name || r.n));
    if (r.downloads == null || r.downloads === '') throw new Error('dsh downloads ' + r.name);
  }
  const inline = s => {
    const re = /`([^`]+)`|\[([^\]]+)\]\((https?:[^)\s]+|sources\/[^)\s]+)\)/g;
    let out = '', i = 0, m;
    while ((m = re.exec(String(s ?? '')))) {
      out += esc(s.slice(i, m.index));
      if (m[1] != null) out += `<code>${esc(m[1])}</code>`;
      else {
        const ext = /^https?:/.test(m[3]);
        const href = ext ? m[3] : rel(f, m[3]);
        out += `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${esc(m[2])}</a>`;
      }
      i = m.index + m[0].length;
    }
    return out + esc(String(s ?? '').slice(i));
  };
  const lis = items => `<ul>${items.map(it => typeof it === 'string' ? `<li>${inline(it)}</li>` : `<li>${inline(it.t)}${it.sub ? lis(it.sub) : ''}</li>`).join('')}</ul>`;
  const paras = arr => (arr || []).map(p => `<p>${inline(p)}</p>`).join('');
  const blocks = arr => (arr || []).map(b => `<h3 class="dsh-h3">${esc(b.h)}</h3>${paras(b.paras)}${b.items ? lis(b.items) : ''}`).join('');
  const gh = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
  const src = DSH.source;
  const lead = `来源：${esc(src.author)}《${esc(src.title)}》（<a href="${esc(src.url)}" target="_blank" rel="noopener">X 文章</a>，用户 ${esc(src.provided)} 提供，全文存于 <a href="${rel(f, src.archive)}">${esc(src.archive)}</a>）。`;
  const stage = `<div class="stage">${DSH.kpis.map(k => `<div class="stat"><b>${esc(k.value)}</b><span>${esc(k.label)}</span>${k.hint ? `<small>${esc(k.hint)}</small>` : ''}</div>`).join('')}</div>`;
  const jump = `<div class="chips dsh-jump">${[['eco', '生态形态'], ['fmt', '清单格式'], ['rev', '审核流程'], ['picks', '重点插件'], ['mech', '5 个机制'], ['verify', '核实表']].map(([id, t]) => `<a class="chip" href="#${id}">${t}</a>`).join('')}</div>`;
  const maxShare = DSH.indexEntries || 1;
  const maxCat = Math.max(...DSH.categories.map(c => c.n));
  const cats = `<div class="dsh-box"><h3>最大的 ${DSH.categories.length} 类 <span class="tag">共 ${esc(DSH.categoryTotal)} 类</span></h3><div class="dsh-cat">${DSH.categories.map(c => `<div class="r"><span class="nm"><code>${esc(c.name)}</code></span><span class="b" title="${grp(c.n)} 条 · 占索引 ${((c.n / maxShare) * 100).toFixed(1)}%"><i style="width:${((c.n / maxCat) * 100).toFixed(2)}%"></i></span><span class="n">${grp(c.n)}</span></div>`).join('')}</div><p class="dsh-note">${inline(DSH.categoriesNote)}</p></div>`;
  const caps = `<div class="dsh-box"><h3>${esc(DSH.scan.tool)} ${esc(DSH.scan.version)}</h3><p>${inline(DSH.scan.lead)}</p><div class="dsh-caps">${DSH.scan.caps.map(c => `<div><b>${grp(c.n)}</b><span>${esc(c.name)}</span></div>`).join('')}</div><p class="dsh-note">${inline(DSH.scan.redLines)}</p><p class="dsh-note">${inline(DSH.scan.disclaimer)}</p></div>`;
  let prev = '', hrows = '';
  for (const r of DSH.highlights) {
    if (r.group !== prev) { hrows += `<tr class="grp"><td colspan="7">${esc(r.group)}</td></tr>`; prev = r.group; }
    hrows += `<tr><td>${gh(r.url, r.name)}</td><td class="num">${esc(r.created)}</td><td class="num">${esc(r.stars)}</td><td>${esc(r.license)}</td><td class="num">${esc(r.pushed)}</td><td class="num">${esc(r.downloads)}</td><td>${inline(r.copy)}</td></tr>`;
  }
  const bodies = DSH.verify.map(g => `<tbody data-g="${esc(g.group)}"><tr class="grp"><td colspan="10">${esc(g.group)}</td></tr>${g.rows.map(r => `<tr><td class="num">${r.n}</td><td>${gh(r.url, r.name)}</td><td>${gh(r.url, r.repo)}</td><td class="num">${esc(r.created)}</td><td class="num">${esc(r.stars)}</td><td>${esc(r.license)}</td><td class="num">${esc(r.pushed)}</td><td class="num">${esc(r.downloads)}</td><td>${esc(r.blurb)}</td><td>${r.note ? esc(r.note) : ''}</td></tr>`).join('')}</tbody>`).join('');
  const chips = `<div class="dsh-bar"><button type="button" class="chip on" data-dsh-g="">全部<em>${dshVerified}</em></button>${DSH.verify.map(g => `<button type="button" class="chip" data-dsh-g="${esc(g.group)}">${esc(g.group)}<em>${g.rows.length}</em></button>`).join('')}<span class="cnt" id="dsh-vcnt"></span></div>`;
  const mechs = `<div class="dsh-mechs">${DSH.mechanisms.map((m, i) => `<article class="card dsh-mech" id="m${i + 1}"><div class="no">${String(i + 1).padStart(2, '0')}</div><h3>${esc(m.title)}</h3><p class="src">${inline(m.via)}</p><ul>${m.points.map(p => `<li>${inline(p)}</li>`).join('')}</ul></article>`).join('')}</div>`;
  const body = `<div class="crumb"><a href="../index.html">首页</a> / DSH 插件</div>
<section class="hero sheet dsh-hero"><div class="say"><span class="kk">插件市场盘点 · ${esc(DSH.asOf)} ${esc(DSH.tz)}</span><h1>${ic('boxes', 26)} ${esc(DSH.title)}</h1><p class="dsh-lead">${lead}</p><ul class="dsh-facts">${DSH.facts.map(x => `<li>${inline(x)}</li>`).join('')}</ul></div>
${stage}</section>
${jump}
<div class="kicker dsh-sec" id="eco">生态形态</div><div class="sub">两层结构：索引层收录，安装层只装列表里的来源</div>
<div class="dsh-prose">${lis(DSH.layers)}</div>
<div class="dsh-split">${cats}${caps}</div>
<div class="dsh-call"><b>同名坑。</b> ${inline(DSH.names)}</div>
<div class="kicker dsh-sec" id="fmt">清单与插件格式</div><div class="sub">manifest、索引条目、派生数据和安装链路</div>
<div class="sheet dsh-prose">${blocks(DSH.catalog)}</div>
<div class="kicker dsh-sec" id="rev">审核流程</div><div class="sub">${inline(DSH.reviewLead)}</div>
<div class="sheet dsh-prose">${blocks(DSH.review)}</div>
<div class="kicker dsh-sec" id="picks">重点插件 <span class="n">${DSH.highlights.length}</span></div><div class="sub">${inline(DSH.highlightsNote)}</div>
<div class="dsh-scroll"><table class="dsh-tbl"><thead><tr><th>插件</th><th>创建</th><th>★</th><th>License</th><th>最近推送</th><th>下载量</th><th>可以抄什么</th></tr></thead><tbody>${hrows}</tbody></table></div>
<p class="dsh-note">${inline(DSH.pathsNote)}</p>
<div class="kicker dsh-sec" id="mech">最值得抄的 5 个机制 <span class="n">5</span></div><div class="sub">对企业工作台插件市场</div>
${mechs}
<details class="panel dsh-sec" id="verify"><summary>${ic('file-text', 15)} 附：文章 ${dshVerified} 个插件核实表 <span class="s">${esc(DSH.verifyNote)}</span></summary><div class="pb">${chips}<div class="dsh-scroll"><table class="dsh-tbl wide"><thead><tr><th>#</th><th>插件</th><th>仓库</th><th>创建</th><th>★</th><th>License</th><th>最近推送</th><th>下载量</th><th>文章一句话</th><th>备注</th></tr></thead>${bodies}</table></div></div></details>
<p class="dsh-note">${inline(DSH.baseline)}</p>`;
  const script = `(function(){var cur='';var bs=document.querySelectorAll('.dsh-bar .chip');function run(){var n=0;document.querySelectorAll('#verify tbody[data-g]').forEach(function(tb){var on=!cur||tb.getAttribute('data-g')===cur;tb.hidden=!on;if(on)n+=tb.querySelectorAll('tr:not(.grp)').length});var t=document.getElementById('dsh-vcnt');if(t)t.textContent=cur?'筛出 '+n+' 个':'';bs.forEach(function(b){b.classList.toggle('on',(b.getAttribute('data-dsh-g')||'')===cur)})}bs.forEach(function(b){b.onclick=function(){var v=b.getAttribute('data-dsh-g')||'';cur=cur===v&&v?'':v;run()}});run()})();`;
  write(f, page(f, 'DSH 插件', 'dsh', body, script));
}
// ---- Agent 工作台雷达（数据 data/radar.json，由 scripts/sync-radar.mjs 从雷达 bot 的 refs.json 同步） ----
if (RADAR) {
  const f = 'radar/index.html';
  const E = RADAR.entries, TH = RADAR.themes;
  // 周报：data/radar-weekly/YYYY-MM-DD.md（sync-radar.mjs 从雷达目录 weekly/ 原样复制），版式沿用 X 简报周趋势页（.sheet / .tabs / .quick / .pn）
  const WKD = path.join(ROOT, 'data', 'radar-weekly');
  const wkInline = t => { const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:[^)\s]+)\)|(?<![*\w])\*([^*\n]+)\*(?!\*)/g; let o = '', i = 0, m; t = String(t);
    while ((m = re.exec(t))) { o += esc(t.slice(i, m.index)); o += m[1] != null ? `<b>${wkInline(m[1])}</b>` : m[2] != null ? `<code>${esc(m[2])}</code>` : m[3] != null ? `<a href="${esc(m[4])}" target="_blank" rel="noopener">${wkInline(m[3])}</a>` : `<i>${wkInline(m[5])}</i>`; i = m.index + m[0].length; }
    return o + esc(t.slice(i)); };
  const wkParse = src => {
    const lines = src.replace(/\r/g, '').split('\n'); const title = (lines[0] || '').replace(/^#\s*/, '').trim();
    const out = [], secs = [], quick = []; let stack = [], mode = '';
    const closeTo = d => { while (stack.length > d) { const t = stack.pop(); out.push(`</li></${t.tag}>`); } };
    for (const ln of lines.slice(1)) {
      const s = ln.trim();
      if (/^\*\*结论先说\*\*$/.test(s)) { closeTo(0); mode = 'q'; continue; }
      if (mode === 'q') { const m = s.match(/^\d+\.\s+(.*)$/); if (m) { quick.push(wkInline(m[1])); continue; } if (!s) continue; mode = ''; }
      if (!s) { closeTo(0); continue; }
      if (s.startsWith('## ')) { closeTo(0); secs.push(s.slice(3).trim()); out.push(`<h2 id="s${secs.length}">${wkInline(secs.at(-1))}</h2>`); continue; }
      if (s.startsWith('### ')) { closeTo(0); out.push(`<h3>${wkInline(s.slice(4))}</h3>`); continue; }
      const li = ln.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (li) { const d = Math.floor(li[1].length / 2) + 1, tag = /\d/.test(li[2]) ? 'ol' : 'ul';
        if (stack.length >= d) { closeTo(d); if (stack.length === d) out.push('</li><li>' + wkInline(li[3])); else { out.push(`<${tag}><li>${wkInline(li[3])}`); stack.push({ tag }); } }
        else { while (stack.length < d) { out.push(`<${tag}><li>`); stack.push({ tag }); } out[out.length - 1] += wkInline(li[3]); }
        continue; }
      if (/^\s+\S/.test(ln) && stack.length) { out.push('<br>' + wkInline(s)); continue; }
      closeTo(0);
      const h = s.match(/^\*\*([^*]+)\*\*$/);
      out.push(h ? `<h3>${wkInline(h[1])}</h3>` : `<p>${wkInline(s)}</p>`);
    }
    closeTo(0); return { title, secs, quick, body: out.join('\n') };
  };
  const WK = (fs.existsSync(WKD) ? fs.readdirSync(WKD).filter(x => /^\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort().reverse() : []).map(x => ({ d: x.slice(0, 10), ...wkParse(fs.readFileSync(path.join(WKD, x), 'utf8')) }));
  WK.forEach((w, i) => {
    const wf = `radar/weekly/${w.d}.html`;
    const tabs = w.secs.map((t, k) => `<a href="#s${k + 1}">${esc(t)}</a>`).join('');
    const newer = i ? `<a href="${WK[i - 1].d}.html">← ${WK[i - 1].d}</a>` : '<span></span>';
    const older = i + 1 < WK.length ? `<a href="${WK[i + 1].d}.html">${WK[i + 1].d} →</a>` : '<span></span>';
    const b = `<div class="crumb"><a href="../../index.html">首页</a> / <a href="../index.html">雷达</a> / 周报 ${esc(w.d)}</div>
<section class="sheet"><span class="kk">雷达周报 · ${esc(w.d)}（北京时间）</span><h1>${wkInline(w.title)}</h1>${w.quick.length ? `<div class="kk" style="margin:4px 0">结论先说</div><ol class="quick">${w.quick.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}</section>
<nav class="tabs">${tabs}</nav><section class="sheet">${w.body}</section><div class="pn">${newer}<a href="../index.html#weekly">周报目录</a>${older}</div>`;
    write(wf, page(wf, w.title, 'radar', b));
  });
  const wkBlock = WK.length ? `<div class="kicker" id="weekly">周报 <span class="n">${WK.length}</span></div><div class="sub">每周一的雷达周报原文，含结论、各方向新东西、最值得抄的作业</div>
<div class="list rd-wk">${WK.map((w, k) => `<div class="row"><span class="tag${k ? '' : ' green'}">${esc(w.d)}</span><span class="t"><a href="weekly/${esc(w.d)}.html">${wkInline(w.title)}</a></span>${k ? '' : '<span class="d">最新</span>'}</div>`).join('')}</div>` : '';
  if (TH.reduce((n, t) => n + t.n, 0) !== E.length) throw new Error('radar theme counts');
  const latest = E.filter(e => e.added === RADAR.updated);
  const grp = n => Number(n).toLocaleString('en-US');
  const md = d => d ? esc(d.slice(5).replace('-', '/')) : '';
  const ext = ' target="_blank" rel="noopener"';
  const card = e => `<article class="card rd-card" id="r${e.id}" data-th="${esc(e.theme)}" data-new="${e.added === RADAR.updated ? 1 : 0}" data-q="${esc([e.name, e.repo, e.what, e.borrow].join(' ').toLowerCase())}">
<div class="rd-hd"><span class="rd-no">#${e.id}</span><h3><a href="${esc(e.url)}"${ext}>${esc(e.name)}</a></h3>${e.added === RADAR.updated ? `<span class="tag green">新增 ${md(e.added)}</span>` : ''}</div>
<div class="rd-gh">${e.repo ? `<a href="https://github.com/${esc(e.repo)}"${ext}>${ic('git-fork', 13)}${esc(e.repo)}</a>` : '<span>无仓库</span>'}${e.verified ? `<span>${ic('star', 13)}${grp(e.stars)}</span><span>${esc(e.license)}</span><span title="最近推送（北京时间）">推送 ${esc(e.pushed)}</span>${e.archived ? '<span class="tag amber">已归档</span>' : ''}` : (e.repo ? '<span class="tag">仓库未核实</span>' : '<span class="tag">未核实</span>')}</div>
<p class="rd-what">${esc(e.what)}</p>
<p class="rd-borrow">${ic('lightbulb', 13)}<span>${esc(e.borrow)}</span></p>
${e.note ? `<p class="rd-note">${esc(e.note)}</p>` : ''}
<details class="rd-src"><summary>来源 ${e.sources.length}</summary><ul>${e.sources.map(s => `<li><a href="${esc(s.url)}"${ext}>${esc(s.author)}</a>${s.date ? ` <span>转发于 ${esc(s.date)}</span>` : ''}</li>`).join('')}</ul></details></article>`;
  const secs = TH.filter(t => t.n).map(t => `<section class="rd-sec" data-sec="${esc(t.key)}"><div class="kicker" id="t-${esc(t.key)}">${esc(t.title)} <span class="n">${t.n}</span></div>
<div class="rd-grid">${E.filter(e => e.theme === t.key).map(card).join('')}</div></section>`).join('');
  const chip = (v, label, n) => `<button type="button" class="chip${v ? '' : ' on'}" data-th="${esc(v)}">${esc(label)}<em>${n}</em></button>`;
  const sc = RADAR.source.scanned || {};
  const batches = [...RADAR.batches].reverse().map(b => `<div class="row"><span class="tag${b.date === RADAR.updated ? ' green' : ''}">${esc(b.date)}</span><span class="t">${esc(b.label)}</span><span class="d">#${b.ids[0]}${b.ids[1] !== b.ids[0] ? '–#' + b.ids[1] : ''} · ${b.n} 条</span></div>`).join('');
  const body = `<div class="crumb"><a href="../index.html">首页</a> / 雷达</div>
<section class="hero sheet rd-hero"><div class="say"><span class="kk">${esc(RADAR.title)} · 更新 ${esc(RADAR.updated)} ${esc(RADAR.tz)}</span><h1>${ic('radar', 26)} ${esc(RADAR.subtitle)}</h1>
<p>雷达 bot 从 ${esc(RADAR.source.account)} 的 X 时间线（${grp(sc.own_timeline_posts || 0)} 条，${esc(sc.date_range || '')}）、GitHub 搜索、Hacker News 和工程博客里挑出的开源项目与做法，按工具链方向分组，每条写清是什么、可以借鉴什么。${(() => { const gn = String(RADAR.source.githubNote || ''), d = (gn.match(/(\d{4}-\d\d-\d\d) ?全量刷新/) || gn.match(/抓取于 (\d{4}-\d\d-\d\d)/) || [])[1]; return d ? `星数、License、最近推送来自 GitHub API（抓取于 ${esc(d)}，日期为北京时间）；没写星数的是无仓库或仓库未核实。` : ''; })()}帖子里的效果数字是作者自述，没有复现。</p></div>
<div class="stage"><div class="stat blue"><b>${E.length}</b><span>个条目</span></div><div class="stat green"><b>${E.filter(e => e.verified).length}</b><span>个仓库已核实</span></div><div class="stat"><b>${TH.filter(t => t.n).length}</b><span>个方向</span></div><div class="stat amber"><b>${latest.length}</b><span>${md(RADAR.updated)} 新增</span></div></div></section>
${wkBlock}
<details class="panel rd-log"><summary>${ic('history', 15)} 补录记录 <span class="s">${RADAR.batches.length} 次，首版 ${esc(RADAR.generated)}</span></summary><div class="pb"><div class="list">${batches}</div></div></details>
<div class="pi-bar rd-bar"><span class="lb">${ic('funnel', 13)}方向</span>${chip('', '全部', E.length)}${TH.filter(t => t.n).map(t => chip(t.key, t.title, t.n)).join('')}<button type="button" class="chip" data-new="1">只看 ${md(RADAR.updated)} 新增<em>${latest.length}</em></button></div>
<div class="rd-q"><label>${ic('search', 15)}<input id="rd-q" type="search" placeholder="搜项目名、仓库或关键词" aria-label="搜索雷达条目"></label><span id="rd-cnt"></span></div>
${secs}<div class="empty" id="rd-none" hidden><b>没有符合条件的条目</b>换个方向或关键词试试</div>`;
  const script = `(function(){var th='',nw=0,q='';var bs=document.querySelectorAll('.rd-bar .chip');var inp=document.getElementById('rd-q');function run(){var n=0;document.querySelectorAll('.rd-sec').forEach(function(s){var v=0;s.querySelectorAll('.rd-card').forEach(function(c){var ok=(!th||c.dataset.th===th)&&(!nw||c.dataset.new==='1')&&(!q||c.dataset.q.indexOf(q)>=0);c.hidden=!ok;if(ok)v++});s.hidden=!v;n+=v});document.getElementById('rd-none').hidden=!!n;document.getElementById('rd-cnt').textContent=(th||nw||q)?'筛出 '+n+' 条':'';bs.forEach(function(b){b.classList.toggle('on',b.dataset.new?!!nw:(b.dataset.th||'')===th)})}bs.forEach(function(b){b.onclick=function(){if(b.dataset.new)nw=nw?0:1;else{var v=b.dataset.th||'';th=th===v?'':v}run()}});inp.oninput=function(){q=inp.value.trim().toLowerCase();run()};run()})();`;
  write(f, page(f, '雷达', 'radar', body, script));
}
// ---- review.md（人读版） ----
{
  let md = `# 间隔复习队列\n\n> 由 build.mjs 从 data/review.json 生成，不要手改本文件。\n> 跨设备以本文件为准。学习搭子把「学完了」写进对应条目的 \`learned\`（YYYY-MM-DD），把某一次复习写进 \`reviews[].done\`。浏览器里的 \`done:<路径>\` 和 \`rev-done:<条目 id>\`（第几天 → 完成日期）先写在这台设备，界面马上更新。收藏页「同步设置」里的令牌和收藏共用（\`fav:token\`）：有令牌时「学完了」把北京时间的日期写入 \`learned\`（已有更早的就留更早的，取消本机记录也不删除 \`learned\`），「今日」勾选把 \`reviews[].done\` 写成 true，并可以写上可选的 \`doneOn\`（完成日）；取消勾选只把 \`done\` 改回 false。没有令牌时只留在本机。首页：有 \`learned\` 或本机 \`done:\` 都算学过；两边都有时用更早的日期排 1/3/7/14/30，只有一边就用那一边。某一次复习在 \`done: true\` 或本机 \`rev-done\` 里有记录，都算完成。换设备：每台电脑在收藏页「同步设置」填一次令牌即可。构建重写本文件时保留已有的 \`learned\`、\`done\` 和 \`doneOn\`。\n> 规则：学完后第 ${review.intervals.join('、')} 天各复习一次。首页勾选会把当前已经到期、还没完成的复习一次记完（清掉积压），下一次仍按学完日顺延。勾完的那一行当天还留在「今日」里，算进「已看」，第二天消失。地址加 \`?today=YYYY-MM-DD\` 可以自查。下表日期按 \`start\` 列出；首页若有 \`learned\` 或本机学完日，会按那天重排。\n\n| 内容 | 学完 | 开始 | ${review.intervals.map(n => `第 ${n} 天`).join(' | ')} |\n|---|---|---|${review.intervals.map(() => '---').join('|')}|\n`;
  for (const q of review.queue) { const it = itemById[q.item]; md += `| ${it ? `${it.label} ${it.title}` : q.item} | ${q.learned || '—'} | ${q.start} | ${q.reviews.map(r => `${r.date}${r.done ? ' ✅' : ''}`).join(' | ')} |\n`; }
  write('review.md', md);
}
