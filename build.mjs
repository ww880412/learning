#!/usr/bin/env node
// 用法：node build.mjs
// 从 data/*.json 生成：index.html、各栏目 index.html、主题 index.html、glossary.html、concepts/*.html、review.md
// 视觉沿用 xuexi-template 的设计变量（styles.css 的 :root），不改模板文件。
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const PROG = createRequire(import.meta.url)('./assets/progress.js');
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
// picks（先看 3 个）由 PH灵感箱 写进数据；有就严格校验，不合规直接停
const PICKS_FROM = '2026-10-28'; // 这天起每天都要写 picks（先看 3 个）；缺了构建照常，但大声告警
for (const d of PHI.days || []) { if (!d.picks) { if (d.date >= PICKS_FROM) console.warn(`\n⚠️  warn: ph-inspo ${d.date} 没写 picks（先看 3 个），页面顶部不会显示这一天的推荐。按 /workspace/ph-inspo/RUNBOOK.md 补上 picks 再发布。\n`); continue; }
  const ids = new Set(d.items.map(i => i.id)), P = d.picks;
  if (P.length !== 3) throw new Error(`ph-inspo ${d.date}: picks 要正好 3 个，现在 ${P.length} 个`);
  if (new Set(P.map(x => x.id)).size !== 3) throw new Error(`ph-inspo ${d.date}: picks 有重复`);
  for (const x of P) { if (!ids.has(x.id)) throw new Error(`ph-inspo ${d.date}: picks 里的 ${x.id} 不在当天 items 里`); if (!x.why || !x.limit) throw new Error(`ph-inspo ${d.date}: picks ${x.id} 缺 why 或 limit`); }
  if (P.some((x, k) => d.items[k].id !== x.id)) throw new Error(`ph-inspo ${d.date}: items 的前 3 个要和 picks 顺序一致`); }
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
// 未开始：没有学习页；进行中：学习页已上线，还没点「学完了」；已学完：点过学习页的「学完了」（review.json 里有 learned，
// 或这台浏览器有 done:<路径>，页面脚本会补上）；已掌握：已学完，且用户加入复习后第 14 天复习已完成（day 14 done=true），没有重置（item.reset 为空/0）。
// 小测（quiz）和复述（retell）只是学习记录，不再决定状态（2026-10-26 王玮定：「已学完」按「学完了」按钮算）。
const STATES = ['未开始', '进行中', '已学完', '已掌握'];
const STATE_CLS = { '未开始': '', '进行中': 'blue', '已学完': 'green', '已掌握': 'purple' };
let reviewRef = null;
function stateOf(it) {
  if (!isPage(it)) return '未开始';
  const q = reviewRef?.queue.find(x => x.item === it.id);
  if (!q || !q.learned) return '进行中';
  if (q && q.reviews.some(r => r.day === 14 && r.done) && !it.reset) return '已掌握';
  return '已学完';
}

// ---- 复习队列：学完不排复习。只有用户点过「加入复习」（joined）才保留 reviews ----
// 没有 joined 的 reviews 是旧的自动排期，构建时清掉。learned 一律保留。
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
    dayField('data/review.json', w, 'start', q.start, false); dayField('data/review.json', w, 'learned', q.learned); dayField('data/review.json', w, 'joined', q.joined);
    if (q.joinAt != null && !(typeof q.joinAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(q.joinAt) && !Number.isNaN(Date.parse(q.joinAt)))) bad('data/review.json', w, `joinAt 不是 ISO 时间：${JSON.stringify(q.joinAt)}`);
    if (!Array.isArray(q.reviews)) { bad('data/review.json', w, 'reviews 应为数组'); return; }
    q.reviews.forEach((r, k) => { dayField('data/review.json', `${w} reviews[${k}] (day=${r.day})`, 'date', r.date, false); dayField('data/review.json', `${w} reviews[${k}] (day=${r.day})`, 'doneOn', r.doneOn);
      if (r.at != null && !(typeof r.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(r.at) && !Number.isNaN(Date.parse(r.at)))) bad('data/review.json', `${w} reviews[${k}] (day=${r.day})`, `at 不是 ISO 时间（如 2026-10-26T10:05:00.000Z）：${JSON.stringify(r.at)}`); }); });
  if (PHI) { const ids = new Set(); (PHI.days || []).forEach((d, i) => { const w = `days[${i}] (date=${d.date})`; dayField('data/ph-inspo.json', w, 'date', d.date, false);
    (d.items || []).forEach((it, k) => { const ww = `${w} items[${k}] (id=${it.id})`; if (!it.id) bad('data/ph-inspo.json', ww, '缺少 id'); else if (ids.has(it.id)) bad('data/ph-inspo.json', ww, 'id 重复'); else ids.add(it.id);
      for (const f of ['ph', 'site', 'repo']) linkField('data/ph-inspo.json', ww, f, it[f]); (it.followups || []).forEach((x, j) => linkField('data/ph-inspo.json', `${ww} followups[${j}]`, 'url', x.url)); }); }); }
  if (RADAR) { const thKeys = new Set((RADAR.themes || []).map(t => t.key)); dayField('data/radar.json', '', 'updated', RADAR.updated, false);
    uniq('data/radar.json', RADAR.entries, 'entries');
    (RADAR.entries || []).forEach((e, i) => { const w = `entries[${i}] (id=${e.id})`; if (!thKeys.has(e.theme)) bad('data/radar.json', w, `theme 引用了不存在的方向 ${JSON.stringify(e.theme)}`); dayField('data/radar.json', w, 'added', e.added); linkField('data/radar.json', w, 'url', e.url); (e.sources || []).forEach((x, j) => linkField('data/radar.json', `${w} sources[${j}]`, 'url', x.url)); }); }
  if (errs.length) { console.error('数据校验失败（没有写任何文件）：\n- ' + errs.join('\n- ')); process.exit(1); }
}
const keptReview = review.queue.map(q => ({ item: q.item, learned: Object.prototype.hasOwnProperty.call(q, 'learned') ? q.learned : undefined, joined: PROG.isDate(q.joined) ? q.joined : '', done: PROG.isDate(q.joined) ? (q.reviews || []).map(r => [r.day, r.done, Object.prototype.hasOwnProperty.call(r, 'doneOn') ? r.doneOn : undefined, Object.prototype.hasOwnProperty.call(r, 'at') ? r.at : undefined]) : null }));
const isoAt = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v) && !Number.isNaN(Date.parse(v));
for (const q of review.queue) {
  if (!PROG.isDate(q.joined)) {
    q.reviews = [];
    if (Object.prototype.hasOwnProperty.call(q, 'joined')) delete q.joined;
  } else {
    const prev = Array.isArray(q.reviews) ? q.reviews : [];
    q.reviews = INTERVALS.map(n => {
      const old = prev.find(r => +r.day === n);
      const date = addDays(q.joined, n);
      if (!old) return { day: n, date, done: false, ...(isoAt(q.joinAt) ? { at: q.joinAt } : {}) };
      const r = { day: n, date, done: !!old.done };
      if (old.done && PROG.isDate(old.doneOn)) r.doneOn = old.doneOn;
      if (isoAt(old.at)) r.at = old.at; else if (isoAt(q.joinAt)) r.at = q.joinAt;
      return r;
    });
  }
}
for (const it of items) {
  if (!isPage(it) || !it.start || review.queue.some(q => q.item === it.id)) continue;
  review.queue.push({ item: it.id, start: it.start, reviews: [] });
}
fs.writeFileSync(reviewPath, JSON.stringify(review, null, 2) + '\n');
{
  const back = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  for (const k of keptReview) {
    const q = back.queue.find(x => x.item === k.item);
    if (!q) throw new Error('review.json 丢失条目 ' + k.item);
    if (k.learned !== undefined && q.learned !== k.learned) throw new Error('review.json 丢掉了 learned：' + k.item);
    if (!k.joined) {
      if ((q.reviews || []).length) throw new Error('review.json 没有加入复习的条目仍有 reviews：' + k.item);
      continue;
    }
    if (q.joined !== k.joined) throw new Error('review.json 丢掉了 joined：' + k.item);
    for (const [day, done, doneOn, at] of k.done) {
      const r = (q.reviews || []).find(x => x.day === day);
      if (!r || r.done !== done) throw new Error('review.json 丢掉了 done：' + k.item + ' 第 ' + day + ' 天');
      if (doneOn !== undefined && r.doneOn !== doneOn) throw new Error('review.json 丢掉了 doneOn：' + k.item + ' 第 ' + day + ' 天');
      if (at !== undefined && r.at !== at) throw new Error('review.json 丢掉了 at：' + k.item + ' 第 ' + day + ' 天');
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
let latestDigestHref = 'digest/index.html', ATLAS_DATA = [];
const SUN_SVG = '<svg class="ic i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
const MOON_SVG = '<svg class="ic i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
const DOCK_SUN_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>';
const DOCK_GRID_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';
function page(file, title, active, body, script = '') {
  const r = p => rel(file, p);
  const rootRel = r('index.html').replace(/index\.html$/, '');
  const isDaily = ['digest', 'x-brief', 'x-posters', 'ph-inspo'].includes(active);
  const hubs = [
    ['index.html', '今日', active === 'home'],
    ['courses/index.html', '公开课', active === 'courses'],
    ['x-posts/index.html', 'X 好文', active === 'x-posts'],
    [latestDigestHref, '每日汇总', isDaily],
    ...(RADAR ? [['radar/index.html', '雷达', active === 'radar']] : []),
  ];
  const nav = hubs.map(([h, t, on]) => `<a href="${r(h)}"${on ? ' class="is-active" aria-current="page"' : ''}>${esc(t)}</a>`).join('');
  const atlasJson = JSON.stringify(ATLAS_DATA).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} · 王玮的学习库</title><style>${THEME}</style><script>window.__ATLAS=${atlasJson};${HEADJS}</script><script src="${r('assets/gh.js')}" defer></script><script src="${r('assets/favorites.js')}" defer></script><script src="${r('assets/progress.js')}" defer></script></head><body data-root="${esc(rootRel)}">
<header class="site-header top"><div class="header-inner"><a class="brand" href="${r('index.html')}"><span class="brand-dot" aria-hidden="true"></span><span class="brand-name">王玮的学习库</span></a><nav class="primary-nav" aria-label="主导航">${nav}</nav><div class="header-actions"><button type="button" class="hdr-btn" data-open-atlas aria-label="打开全站栏目目录"><span>全站目录</span><kbd>/</kbd></button><button type="button" class="hdr-btn icon-only dm" data-theme-toggle onclick="__tt()" aria-label="切换深浅色" aria-pressed="false">${SUN_SVG}${MOON_SVG}</button></div></div></header>
<main class="page-shell">${body}<footer class="site-footer"><span>王玮的学习库 · 活版书房 · 由 build.mjs 从 data/ 生成</span><span><a href="${r('index.html')}">首页</a> · <a href="${r('favorites/index.html')}">收藏与同步</a> · <a href="${r('glossary.html')}">概念卡</a></span></footer></main>
<nav class="mobile-dock" aria-label="手机主导航"><a class="dock-item${active === 'home' ? ' is-active' : ''}" href="${r('index.html')}"${active === 'home' ? ' aria-current="page"' : ''}>${DOCK_SUN_SVG}<span>今日</span></a><a class="dock-item${active === 'courses' ? ' is-active' : ''}" href="${r('courses/index.html')}"${active === 'courses' ? ' aria-current="page"' : ''}>${ic('graduation-cap', 16, 'ic')}<span>公开课</span></a><a class="dock-item${isDaily ? ' is-active' : ''}" href="${r(latestDigestHref)}"${isDaily ? ' aria-current="page"' : ''}>${ic('calendar', 16, 'ic')}<span>日更</span></a><button type="button" class="dock-item" data-open-atlas>${DOCK_GRID_SVG}<span>全站</span></button></nav>${script ? `<script>${script}</script>` : ''}<script>var __R='${r('index.html')}',__I=${JSON.stringify(Object.fromEntries(items.map(i=>[i.id,[i.href,stateOf(i)]]))).replace(/</g,'\\u003c')};(function(){const DONE=['已学完','已掌握'];const LP=new Set();const doneExpand=u=>{const out=[],vs=new Set([u]);if(u.endsWith('/index.html')){const d=u.slice(0,-10);vs.add(d);vs.add(d.replace(/\\/$/,'')||'/')}else if(u.endsWith('/')){vs.add(u+'index.html');vs.add(u.replace(/\\/$/,'')||'/')}else if(!/\\.[a-z0-9]+$/i.test(u)){vs.add(u+'/');vs.add(u+'/index.html')}for(const x of vs){out.push(x);const m=x.match(/^(.*)\\/courses\\/(.+)$/);if(m)out.push(m[1]+'/'+m[2]);const m2=x.match(/^(.*)\\/(cs146s)\\/(.+)$/);if(m2&&!x.includes('/courses/'))out.push(m2[1]+'/courses/'+m2[2]+'/'+m2[3])}return[...new Set(out)]};const doneHit=h=>{const keys=[];const add=u=>{for(const k of doneExpand(u))if(!keys.includes(k))keys.push(k)};try{add(new URL(h,new URL(__R,location.href)).pathname)}catch(e){}try{add(new URL(h,location.href).pathname)}catch(e){}for(const k of keys){if(LP.has(k))return 1;const d=localStorage.getItem('done:'+k);if(d)return d}return null};const st=id=>{const v=__I[id];if(!v)return null;let s=v[1];if(s!=='已掌握'&&!/^https?:/.test(v[0])){try{if(doneHit(v[0]))s='已学完'}catch(e){}}return s};const go=()=>{document.querySelectorAll('a[href]').forEach(a=>{const d=doneHit(a.getAttribute('href'));if(!d)return;const box=a.closest('.row,.card');if(!box)return;const t=box.querySelector('.tag.st');if(t&&!/已掌握/.test(t.textContent)){t.textContent='已学完';t.className='tag st green'}});document.querySelectorAll('[data-doing]').forEach(g=>{const dn=[];g.querySelectorAll('a.card').forEach(a=>{try{if(doneHit(a.getAttribute('href')))dn.push(a)}catch(e){}});if(!dn.length)return;const w=document.createElement('div');w.innerHTML='<div class="kicker">已学完 <span class="n">'+dn.length+'</span></div><div class="sub">加入复习后，到了复习日会出现在首页「今日」</div><div class="grid wide"></div>';const gd=w.querySelector('.grid');dn.forEach(a=>{a.querySelectorAll('.meta span').forEach(x=>{if(/开始学/.test(x.textContent))x.textContent='复习 →'});gd.appendChild(a)});g.after(...w.childNodes);if(!g.querySelector('a.card'))g.outerHTML='<div class="empty"><b>现在没有进行中的内容</b></div>'});document.querySelectorAll('[data-ids]').forEach(el=>{const ss=el.dataset.ids.split(',').filter(Boolean).map(st).filter(Boolean);const n=ss.length,c=x=>ss.filter(s=>s===x).length;const k=el.dataset.k,b=el.querySelector('b');if(k==='done'&&b)b.textContent=ss.filter(s=>DONE.includes(s)).length;else if(k==='doing'&&b)b.textContent=c('进行中');else if(k&&k.startsWith('st:')&&b)b.textContent=c(k.slice(3));else if(k==='prog'){const is=el.querySelectorAll('.bar i');const w=x=>(n?x/n*100:0)+'%';if(is.length>=3){is[0].style.width=w(c('已掌握'));is[1].style.width=w(c('已学完'));is[2].style.width=w(c('进行中'))}const sp=el.querySelector(':scope>span');const bb=el.querySelector(':scope>b');if(bb)bb.textContent=(n?Math.round((c('已学完')+c('已掌握'))/n*100):0)+'%';if(sp)sp.textContent='已学完 '+(c('已学完')+c('已掌握'))+'/'+n+(c('已掌握')?' · 已掌握 '+c('已掌握'):'')+(c('进行中')?' · 进行中 '+c('进行中'):'')}})};let ran=0;const once=()=>{if(!ran){ran=1;go()}};/* 已学完＝点过「学完了」：本机 done:<路径>，或仓库 review.json 里的 learned（别的设备点的） */try{const B=new URL(__R,location.href);fetch(new URL('data/review.json?t='+Date.now(),B).href,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{((j&&j.queue)||[]).forEach(q=>{const v=q&&__I[q.item];if(!v||!q.learned||/^https?:/.test(v[0]))return;try{for(const k of doneExpand(new URL(v[0],B).pathname))LP.add(k)}catch(e){}});once()}).catch(once)}catch(e){once()}setTimeout(once,1500)})();</script></body></html>`;
}
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), s); console.log('wrote', f); };
const statusTag = s => `<span class="tag st ${STATE_CLS[s] ?? ''}">${esc(s)}</span>`;
const tagOf = it => statusTag(stateOf(it));
const countBy = arr => Object.fromEntries(STATES.map(k => [k, arr.filter(i => stateOf(i) === k).length]));
const progBar = arr => { const n = arr.length, c = countBy(arr), done = c['已学完'] + c['已掌握']; return `<div class="prog" data-k="prog" data-ids="${arr.map(i=>i.id).join(',')}"><div class="bar"><i class="g" style="width:${n ? c['已掌握'] / n * 100 : 0}%"></i><i class="l" style="width:${n ? c['已学完'] / n * 100 : 0}%"></i><i class="b" style="width:${n ? c['进行中'] / n * 100 : 0}%"></i></div><span>已学完 ${done}/${n}${c['已掌握'] ? ` · 已掌握 ${c['已掌握']}` : ''}${c['进行中'] ? ` · 进行中 ${c['进行中']}` : ''}</span></div>`; };
const stateStats = arr => { const c = countBy(arr); return STATES.map(k => `<div data-k="st:${k}" data-ids="${arr.map(i=>i.id).join(',')}" class="stat ${({'未开始':'','进行中':'blue','已学完':'green','已掌握':'purple'})[k]}"><b>${c[k]}</b><span>${k}</span></div>`).join(''); };
// 学习页有几节：数页面里的 <section class="sec">（新模板每节一个）；分主线的长文把各条主线的节数加起来。读不到就不显示。
const secCount = href => { try { return (fs.readFileSync(path.join(ROOT, String(href).split('#')[0]), 'utf8').match(/<section class="sec[ "]/g) || []).length; } catch { return 0; } };
const lessonSecs = it => it.threads?.length ? it.threads.reduce((n, t) => n + secCount(t.href), 0) : secCount(it.href);
const cleanNote = s => String(s || '')
  .replace(/[·。；;\s]*(?:精读明文[^。；;]*[。；;]?)/g, '。')
  .replace(/[·。；;\s]*(?:动图版精读|精读版(?:待加密|[^：:]*))[：:][^\s。；;]*-close\.html[。；;]?/g, '。')
  .replace(/[^\s。；;]*-close\.html/g, '')
  .replace(/[^\s。；;]*_private\/[^\s。；;]*/g, '')
  .replace(/。{2,}/g, '。')
  .replace(/^[·。；;\s]+|[·。；;\s]+$/g, '')
  .trim();
const itemCard = (file, it) => `<a class="card item" href="${rel(file, it.href)}">${it.preview ? `<div class="thumb"><img src="${rel(file, it.preview)}" alt="" loading="lazy"></div>` : ''}
<div class="meta" style="margin-top:0;padding-top:0"><span class="tag">${esc(it.label)}</span>${tagOf(it)}</div><h3>${esc(it.title)}</h3><p>${esc(cleanNote(it.note))}</p>
<div class="meta">开始于 ${esc(it.start)}${lessonSecs(it) ? ` · ${lessonSecs(it)} 节` : ''}<button type="button" class="rev-join" data-item="${esc(it.id)}">加入复习</button><span style="margin-left:auto;color:var(--blue);font-weight:700">开始学 →</span></div></a>`;
const emptyBox = (t, s) => `<div class="empty"><b>${t}</b>${s}</div>`;
const itemConcepts = id => concepts.filter(c => c.refs.some(r => r.item === id));

// 简报文件名是美东日期，北京时间每天 09:00 发布（定时任务按 Asia/Shanghai 触发，不随美东夏令时变），那时美东还是前一天，所以是文件名日期的北京第二天。
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
// 简报主线条目下的「前提或争议 / 为什么值得看」小行（x-brief build.py 的 <div class="qd">）只在简报页显示，汇总和首页只取第一行
const noQd = s => String(s || '').replace(/<div class="qd">[\s\S]*?<\/div>/g, '');
// 简报、海报页里的「另见：…」小链接（x-brief/site/build.py 加的）不是正文，取摘要前去掉
const noXref = h => String(h).replace(/ ?<a class="xref"[^>]*>[\s\S]*?<\/a>/g, '');
// 「2026-10-26 08:10 EDT」这类带时区的时刻 → 北京「10/26 20:10」；认不出就返回 null
const bjStamp = raw => {
  const b = String(raw || '').trim().match(/^\d{4}-(\d{2})-(\d{2})[ T](\d{2}:\d{2})\s*(?:北京|北京时间|CST|\+08:?00)$/);
  if (b) return `${b[1]}/${b[2]} ${b[3]}`; // 已经是北京时间
  const m = String(raw || '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*(ET|EDT|EST|PT|PDT|PST|UTC|GMT)$/i);
  if (!m) return null;
  const zone = ZONES[m[3].toUpperCase()];
  const t = zone === 'UTC' ? new Date(`${m[1]}T${m[2]}:00Z`) : wallToInstant(m[1], m[2], zone);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hourCycle: 'h23', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(t).map(x => [x.type, x.value]));
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
};
// 「关于这页数据」：页头的说明文字收进可展开的一栏
const about = html => `<details class="panel about"><summary>${ic('file-text', 15)} 关于这页数据</summary><div class="pb">${html}</div></details>`;

// 海报页的卡片：旧版 <section class="… pc">（图在标题前）和 2026-10-27 起的 <section class="… pc2">（标题在图前）都认
function posterCards(h) {
  const secs = [...h.matchAll(/<section class="[^"]*\bpc2?" id="([^"]+)"/g)];
  return secs.map((m, k) => {
    const c = h.slice(m.index, k + 1 < secs.length ? secs[k + 1].index : h.length);
    const img = c.match(/<img src="([^"]+)" alt="([^"]*)"/), t = c.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const take = (c.match(/<p class="take">([\s\S]*?)<\/p>/) || [])[1] || '';
    const srcl = (c.match(/<p class="srcl">([\s\S]*?)<\/p>/) || [])[1] || '';
    const who = (srcl.match(/@[A-Za-z0-9_]+/) || (c.match(/class="h">([^<]+)</) || []))[0] || '';
    return img ? { id: m[1], src: img[1], alt: img[2], h3: t ? t[1] : '', take, who } : null;
  }).filter(Boolean);
}
// ---- 每日汇总（北京时间 9:00 推送用）：从 x-brief / x-posters / data/ph-inspo.json 汇成 data/digest/YYYY-MM-DD.json 和 digest/YYYY-MM-DD.html ----
// 汇总日 D 是北京时间。简报用北京日期（见 briefBeijingDate），海报目录已是北京日期，产品灵感取榜单日 ≤ D−2 的最新一份。
// 简报或海报只要有一边到了 D，就生成 digest/D（另一边 null，不把这一天藏起来，也不拿别天硬凑）。最新一天缺的来源写「今天的还没出」，更早的日期写「这天还没有…」。海报晚到后再构建，仍写回同一天。
const DG = (() => {
  const T = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const rd = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };
  const ls = d => fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)) : [];
  const WD = '日一二三四五六';
  const parseLead = rawLi => {
    const qds = [...rawLi.matchAll(/<div class="qd">([\s\S]*?)<\/div>/g)].map(m => T(m[1])).filter(Boolean);
    const clean = noQd(rawLi);
    const bm = clean.match(/^\s*<b>([\s\S]*?)<\/b>\s*[：:]?\s*([\s\S]*)$/);
    if (bm) return { head: T(bm[1]), summary: T(bm[2]), qds };
    const full = T(clean);
    const idx = full.search(/[：:]/);
    return idx > 12 && idx < 110 ? { head: full.slice(0, idx), summary: full.slice(idx + 1).trim(), qds } : { head: full, summary: '', qds };
  };
  const brief = {}, briefRich = {}, poster = {}, posterRich = {};
  for (const x of ls('x-brief').filter(x => /^\d{4}-\d\d-\d\d\.html$/.test(x)).sort()) {
    const fileDate = x.slice(0, 10), h = noXref(rd('x-brief/' + x));
    const d = briefBeijingDate(fileDate, h);
    if (brief[d] && (brief[d].href.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] >= fileDate) continue;
    const qm = h.match(/今日主线<\/div>\s*<ol class="quick">([\s\S]*?)<\/ol>/);
    const rawLis = qm ? [...qm[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1]) : [];
    let lines = rawLis.map(li => T(noQd(li))).filter(Boolean);
    let leads = rawLis.map(parseLead).filter(l => l.head);
    if (!lines.length) {
      lines = [...h.matchAll(/<h2 id="[^"]+"[^>]*>[\s\S]*?<\/h2>\s*<p>([\s\S]*?)<\/p>/g)].map(m => T(m[1])).filter(Boolean).slice(0, 3);
      leads = lines.map(l => ({ head: l, summary: '', qds: [] }));
    }
    brief[d] = { title: T((h.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1]) || `X 简报 · ${fileDate}`, href: `x-brief/${fileDate}.html`, lines: lines.slice(0, 3) };
    briefRich[d] = { leads: leads.slice(0, 3), totalLeads: leads.length || lines.length };
  }
  for (const d of ls('x-posters').filter(x => /^\d{4}-\d\d-\d\d$/.test(x))) {
    const h = rd(`x-posters/${d}/index.html`); if (!h) continue;
    const cards = posterCards(h);
    const items = cards.map(m => ({ title: T(m.h3) || T(m.alt), href: `x-posters/${d}/index.html#${m.id}`, img: `x-posters/${d}/${m.src}` }));
    if (items.length) {
      poster[d] = { title: T((h.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1]) || `${items.length} 张技术海报`, href: `x-posters/${d}/index.html`, n: items.length, items };
      posterRich[d] = cards.map(m => ({ title: T(m.h3) || T(m.alt), href: `x-posters/${d}/index.html#${m.id}`, img: `x-posters/${d}/${m.src}`, take: T(m.take), who: m.who }));
    }
  }
  const phDays = (PHI.days || []).filter(day => day.date && (day.items || []).length).sort((a, b) => b.date.localeCompare(a.date));
  const phFor = d => {
    const day = phDays.find(x => x.date <= addDays(d, -2));
    if (!day) return null;
    return { listDate: day.date, href: `ph-inspo/index.html`, n: day.items.length, source: day.source || null,
      picks: !!day.picks, // 写了 picks（先看 3 个）就按数据顺序（前 3 个就是 picks），否则按名次
      items: (day.picks ? day.items : [...day.items].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))).map((i, k) => ({ rank: i.rank ?? null, pick: !!day.picks && k < 3, name: i.name, what: i.what || '', href: `ph-inspo/index.html#${i.id}` })) };
  };
  const dates = [...new Set([...Object.keys(brief), ...Object.keys(poster)])].filter(Boolean).sort().reverse();
  const list = dates.map(d => { const [y, m, dd] = d.split('-').map(Number);
    return { date: d, label: `${m} 月 ${dd} 日 · 星期${WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]}`, href: `digest/${d}.html`, json: `data/digest/${d}.json`,
      brief: brief[d] || null, posters: poster[d] || null, ph: phFor(d) }; });
  return { list, byDate: Object.fromEntries(list.map(x => [x.date, x])), briefRich, posterRich, briefCount: Object.keys(brief).length, posterTotal: Object.values(poster).reduce((n, p) => n + p.n, 0) };
})();
// 全站目录抽屉（Atlas Dialog）实时数据与最新每日汇总路径
{
  latestDigestHref = DG.list[0]?.href || 'digest/index.html';
  const latestMd = DG.list[0]?.date ? DG.list[0].date.slice(5).replace('-', '/') : '今日';
  const phTotal = (PHI.days || []).reduce((n, d) => n + (d.items || []).length, 0);
  const colMeta = c => {
    const L = items.filter(i => i.column === c.id);
    const done = L.filter(i => ['已学完', '已掌握'].includes(stateOf(i))).length;
    const doing = L.filter(i => stateOf(i) === '进行中').length;
    return `${done}/${L.length}${doing ? ` · 进行中 ${doing}` : ''}`;
  };
  ATLAS_DATA = [
    {
      title: '每日信号与参考',
      items: [
        { name: '首页 · 今日', href: 'index.html', meta: latestMd, kw: 'today 首页 今日' },
        { name: '每日汇总', href: latestDigestHref, meta: `${latestMd} 最新 · ${DG.list.length} 期`, kw: 'digest 早报 汇总' },
        { name: 'X 简报', href: 'x-brief/index.html', meta: `${DG.briefCount} 期`, kw: 'brief 简报' },
        { name: 'X 海报', href: 'x-posters/index.html', meta: `${DG.posterTotal} 张`, kw: 'posters 海报 康奈尔' },
        { name: '产品灵感', href: 'ph-inspo/index.html', meta: `${phTotal} 个`, kw: 'ph product hunt 灵感' },
        ...(RADAR ? [{ name: '雷达', href: 'radar/index.html', meta: `${RADAR.entries.length} 条`, kw: 'radar 开源 工作台' }] : []),
      ],
    },
    {
      title: '长期精学',
      items: columns.map(c => ({ name: c.title, href: `${c.dir}/index.html`, meta: colMeta(c), kw: `${c.id} ${c.desc}` })),
    },
    {
      title: '索引与个人',
      items: [
        { name: '概念卡', href: 'glossary.html', meta: `${concepts.length} 张`, kw: 'glossary 术语' },
        ...(DSH ? [{ name: 'DSH 插件', href: 'dsh-plugins/index.html', meta: `${dshVerified} 个核实`, kw: 'dsh deepseek harness 插件' }] : []),
        { name: '收藏与同步设置', href: 'favorites/index.html', meta: '个人索引', kw: 'favorites 收藏 token 同步' },
        { name: '每日汇总归档', href: 'digest/index.html', meta: `全部 ${DG.list.length} 期`, kw: 'digest 历史 往期' },
      ],
    },
  ];
}
{
  const SITE = 'https://ww880412.github.io/learning/';
  const keep = new Set(DG.list.map(x => x.date + '.json'));
  fs.mkdirSync(path.join(ROOT, 'data', 'digest'), { recursive: true });
  for (const x of fs.readdirSync(path.join(ROOT, 'data', 'digest'))) if (/^\d{4}-\d\d-\d\d\.json$/.test(x) && !keep.has(x)) fs.rmSync(path.join(ROOT, 'data', 'digest', x));
  const rule = '汇总日 D 是北京时间。简报文件名是美东日期，北京时间 D 日 09:00 发布，那时美东还是 D−1 日，所以 D 一般对应 x-brief/(D−1).html（页面若有带时区的发布时间，则改用该时间换算到 Asia/Shanghai；链接仍是原文件）。海报是 x-posters/D/。产品灵感是最新一份榜单日 ≤ D−2 的那组（太平洋时间的 Product Hunt 日榜，北京时间 D 日 09:00 前能入库的最新一份），并标出实际榜单日。某一来源没有就是 null。';
  const rule0 = '汇总日 D 是北京时间。简报文件名是美东日期，美东 21:00 发布等于北京时间次日 09:00，所以 D 一般对应 x-brief/(D−1).html（页面若有带时区的发布时间，则改用该时间换算到 Asia/Shanghai；链接仍是原文件）。海报是 x-posters/D/。产品灵感是最新一份榜单日 ≤ D−2 的那组（太平洋时间的 Product Hunt 日榜，北京时间 D 日 09:00 前能入库的最新一份），并标出实际榜单日。某一来源没有就是 null。';
  // 2026-10-27 起的汇总用新说法（定时任务改按北京时间触发）；更早的汇总保留当时的说法，不改写历史 json
  const ruleOf = d => d >= '2026-10-27' ? rule : rule0;
  for (const x of DG.list) fs.writeFileSync(path.join(ROOT, 'data', 'digest', x.date + '.json'), JSON.stringify({ ...x, url: SITE + x.href, rule: ruleOf(x.date) }, null, 1) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data', 'digest', 'index.json'), JSON.stringify({ _readme: '由 build.mjs 生成。北京时间 9:00 的汇总推送直接链接 url，或读 json。', rule, site: SITE, latest: DG.list[0]?.date || null,
    days: DG.list.map(x => ({ date: x.date, url: SITE + x.href, json: x.json, brief: !!x.brief, posters: x.posters?.n || 0, ph: x.ph?.n || 0 })) }, null, 1) + '\n');
  console.log('wrote data/digest/*.json', DG.list.length);
  const none = t => `<div class="dg-none">${t}</div>`;
  const gap = (x, settled) => x.date === DG.list[0]?.date ? '今天的还没出' : settled;
  const zhNum = ['一', '二', '三', '四', '五'];
  const dayBody = (f, x) => {
    const br = DG.briefRich[x.date];
    const leads = br?.leads?.length ? br.leads : (x.brief?.lines || []).map(l => ({ head: l, summary: '' }));
    const pr = DG.posterRich[x.date];
    const pItems = pr?.length ? pr : (x.posters?.items || []).map(p => ({ ...p, take: '', who: '' }));
    return `<section class="digest-spread" aria-label="简报主线与产品灵感">
<div>
  <div class="sec-head">
    <h2>${x.brief ? esc(x.brief.title) : 'X 简报'}</h2>
    ${x.brief ? `<a class="text-link" href="${rel(f, x.brief.href)}">读完整 ${br?.totalLeads || leads.length} 条主线 →</a>` : ''}
  </div>
  ${x.brief ? `<div class="digest-stories">${leads.map((l, i) => `<article class="digest-story"><div class="digest-story-no">主线${zhNum[i] || (i + 1)}</div><h3>${esc(l.head)}</h3>${l.summary ? `<p>${esc(l.summary)}</p>` : ''}</article>`).join('')}</div><div style="margin-top:24px"><a class="btn primary" href="${rel(f, x.brief.href)}">读这期简报全文 →</a></div>` : none(gap(x, '这天还没有简报'))}
</div>
<div>
  <div class="sec-head">
    <h2>产品灵感${x.ph ? ` <span class="sec-sub">榜单 ${esc(x.ph.listDate.slice(5).replace('-', '/'))} · ${x.ph.n} 个</span>` : ''}</h2>
    <a class="quiet-link" href="${rel(f, 'ph-inspo/index.html')}">进入灵感板 →</a>
  </div>
  ${x.ph ? `<div class="inspo-list">${x.ph.items.map(i => `<a class="inspo-row" href="${rel(f, i.href)}"><div class="inspo-row-top"><span class="inspo-name">${esc(i.name)}</span>${i.pick ? '<span class="inspo-pick">先看</span>' : (i.rank != null ? `<span class="quiet-link mono">#${esc(i.rank)}</span>` : '')}</div><p class="inspo-brief">${esc(i.what)}</p></a>`).join('')}</div>` : none(gap(x, '这天还没有产品灵感'))}
</div>
</section>
<section aria-label="今日 X 海报">
  <div class="sec-head">
    <h2>X 海报${x.posters ? ` <span class="sec-sub">${x.posters.n} 张 · ${esc(x.date)}</span>` : ''}</h2>
    ${x.posters ? `<a class="text-link" href="${rel(f, x.posters.href)}">查看完整拆解 →</a>` : ''}
  </div>
  ${x.posters ? `<div class="poster-spread">${pItems.map(p => `<a class="poster-card card" href="${rel(f, p.href)}"><div class="poster-frame"><img src="${rel(f, p.img)}" alt="${esc(p.title)}" loading="lazy"></div><h3 class="poster-card-title">${esc(p.title)}</h3>${(p.who || p.take) ? `<span class="poster-card-meta">${esc([p.who, p.take].filter(Boolean).join(' · ').slice(0, 96))}</span>` : ''}</a>`).join('')}</div>` : none(gap(x, '这天还没有海报'))}
</section>`;
  };
  for (const [k, x] of DG.list.entries()) {
    const f = x.href, prev = DG.list[k + 1], next = DG.list[k - 1];
    const nav = `<div style="display:flex;gap:10px;flex-wrap:wrap">${prev ? `<a class="btn sm" href="${prev.date}.html">← ${esc(prev.date.slice(5).replace('-', '/'))}</a>` : ''}<a class="btn sm" href="index.html">全部 ${DG.list.length} 期日期</a>${next ? `<a class="btn sm" href="${next.date}.html">${esc(next.date.slice(5).replace('-', '/'))} →</a>` : ''}</div>`;
    const body = `<div class="crumb"><a href="../index.html">首页</a> <span>/</span> <a href="index.html">每日汇总</a> <span>/</span> <span class="tnum">${esc(x.date)}</span></div>
<section class="page-intro"><div><span class="eyebrow-tag" style="display:block;margin-bottom:8px">每日汇总 · 北京时间 09:00${k ? '' : ' · 最新一期'}</span><h1>${esc(x.label)}</h1><p class="intro-lead">当天的 X 简报主线、Product Hunt 产品灵感${x.ph ? `（榜单日 ${esc(x.ph.listDate.slice(5).replace('-', '/'))}）` : ''}与 X 技术海报合刊早报。</p></div>${nav}</section>
${dayBody(f, x)}
<details class="lead-details" style="margin-top:44px"><summary>关于这页数据</summary><div class="lead-details-body"><p>当天的 X 简报、X 海报和产品灵感放在一页，早上的推送和这页内容一致。产品灵感是 Product Hunt 的榜单日（太平洋时间），取北京时间这天 09:00 前能入库的最新一份。机读数据：<a href="${rel(f, x.json)}"><code>${esc(x.json)}</code></a>。</p></div></details>`;
    write(f, page(f, `每日汇总 ${x.date}`, 'digest', body));
  }
  const f = 'digest/index.html';
  const body = `<div class="crumb"><a href="../index.html">首页</a> <span>/</span> <span>每日汇总</span></div>
<section class="page-intro"><div><span class="eyebrow-tag" style="display:block;margin-bottom:8px">每日汇总 · 北京时间 09:00</span><h1>每日汇总</h1><p class="intro-lead">每天一页早间合刊，汇总当日 X 简报、X 海报与产品灵感。共 ${DG.list.length} 期。</p></div><div class="intro-stats"><div><b>${DG.list.length}</b><span>全部期数</span></div>${DG.list[0] ? `<div><b class="tnum">${esc(DG.list[0].date.slice(5).replace('-', '/'))}</b><span>最新一期</span></div>` : ''}</div></section>
<details class="lead-details"><summary>关于这页数据</summary><div class="lead-details-body"><p>${esc(rule)} 每天一页，链接格式 <code>digest/YYYY-MM-DD.html</code>，机器可读版 <code>data/digest/YYYY-MM-DD.json</code>。</p></div></details>
<div class="sec-head" style="margin-top:28px"><h2>全部日期 <span class="sec-sub">新的在上面</span></h2></div>
${DG.list.length ? `<div>${DG.list.map((x, idx) => `<div class="archive-row"><a href="${x.date}.html">${esc(x.label)}</a><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="tag${x.brief ? ' blue' : ''}">${x.brief ? '简报' : '无简报'}</span><span class="tag${x.posters ? ' blue' : ''}">${x.posters ? '海报 ' + x.posters.n : '无海报'}</span><span class="tag${x.ph ? ' blue' : ''}">${x.ph ? '灵感 ' + x.ph.n : '无灵感'}</span><span class="dt">${esc(x.date)}${idx === 0 ? ' · 最新' : ''}</span></div></div>`).join('')}</div>` : emptyBox('还没有汇总', '')}`;
  write(f, page(f, '每日汇总', 'digest', body));
}

// ---- 另见：同一个项目在雷达、产品灵感、X 海报里都出现时互相链接（按项目名，≥5 个字符，不分大小写） ----
const XR = (() => {
  const short = n => String(n || '').split(/[（(]/)[0].trim();
  const word = n => new RegExp('(?<![A-Za-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9])', 'i');
  const phAll = (PHI.days || []).flatMap(d => (d.items || []).map(i => ({ ...i, date: d.date })));
  const posts = DG.list.flatMap(x => x.posters ? x.posters.items.map(p => ({ ...p, d: x.date })) : []);
  const repoKey = u => { const m = /github\.com\/([^/?#\s]+\/[^/?#\s]+)/i.exec(String(u || '')); return m ? m[1].replace(/\.git$/, '').toLowerCase() : ''; };
  const radarOf = it => (RADAR?.entries || []).filter(e => (repoKey(it.repo) && repoKey(e.repo ? 'github.com/' + e.repo : e.url) === repoKey(it.repo)) || (short(e.name).length >= 5 && short(e.name).toLowerCase() === short(it.name).toLowerCase()));
  return {
    // 产品灵感卡片 → 雷达
    ph: it => radarOf(it).map(e => `<a class="xref" href="../radar/index.html#r${e.id}">另见：雷达 #${e.id}</a>`),
    // 雷达卡片 → 产品灵感、X 海报（同一项目只出现在不超过 3 张海报标题里才算，太常见的名字不连）
    radar: e => { const n = short(e.name); const rk = repoKey(e.repo ? 'github.com/' + e.repo : e.url);
      const ph = phAll.filter(i => (rk && repoKey(i.repo) === rk) || (n.length >= 5 && i.name.toLowerCase() === n.toLowerCase())).map(i => `<a class="xref" href="../ph-inspo/index.html#${esc(i.id)}">另见：产品灵感 · 榜单 ${esc(i.date.slice(5).replace('-', '/'))}</a>`);
      const ps = n.length < 5 ? [] : posts.filter(p => { const m = word(n).exec(p.title); return m && m.index < 16; }); // 名字在海报标题开头一段才算（和 publish_gallery.py 的 name_hit 一致）
      return [...ph, ...(ps.length && ps.length <= 3 ? [`<a class="xref" href="../${esc(ps[0].href)}">另见：X 海报 ${esc(ps[0].d.slice(5).replace('-', '/'))}</a>`] : [])]; },
  };
})();
// 雷达「本周首选」：取最新一份周报「结论先说」第 1 条（首页与雷达页共用）
const rdPick = (() => {
  const D = path.join(ROOT, 'data', 'radar-weekly'); if (!fs.existsSync(D)) return null;
  const plain = t => t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|`/g, '').trim();
  for (const x of fs.readdirSync(D).filter(x => /^\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort().reverse()) {
    const L = fs.readFileSync(path.join(D, x), 'utf8').replace(/\r/g, '').split('\n');
    const k = L.findIndex(l => /^\*\*结论先说\*\*$/.test(l.trim())); if (k < 0) continue;
    const m = L.slice(k + 1).map(l => l.trim()).filter(Boolean)[0]?.match(/^1\.\s+(.*)$/); if (!m) continue;
    const nx = L.slice(k + 1).filter(l => l.trim());
    const why = (nx[1] && /^\s+解决什么[：:]/.test(nx[1])) ? plain(nx[1].trim().replace(/^解决什么[：:]\s*/, '')) : '';
    const t = plain(m[1]), cut = why ? -1 : t.search(/[：:。]/);
    return { d: x.slice(0, 10), href: `radar/weekly/${x.slice(0, 10)}.html`, name: cut > 0 ? t.slice(0, cut) : t, title: '本周首选：' + (cut > 0 ? t.slice(0, cut) : t), sub: why || (cut > 0 ? t.slice(cut + 1).trim() : '') };
  }
  return null;
})();
// ---- 首页（V4 活版书房双主角：左今日头版 / 右砚墨继续学案头 + 海报/灵感/雷达 + 13 栏目可筛选总目） ----
{
  const f = 'index.html';
  const md = d => d ? esc(String(d).slice(5).replace('-', '/')) : '';
  const ord = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.start || '').localeCompare(b.start || '');
  const localPage = i => isPage(i) && !/^https?:/.test(i.href || '');
  const colTitle = id => (columns.find(c => c.id === id) || {}).title || '';
  const WD = '日一二三四五六';
  const CHECK_SVG = '<span class="chk-box" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>';

  const bjBuild = shanghaiDate(new Date());
  const [by, bm, bd] = bjBuild.split('-').map(Number);
  const bwd = WD[new Date(Date.UTC(by, bm - 1, bd)).getUTCDay()];

  const g0 = DG.list[0] || null;
  const gBrief = g0?.brief ? g0 : DG.list.find(x => x.brief) || null;
  const gPosters = g0?.posters ? g0 : DG.list.find(x => x.posters) || null;
  const brRich = gBrief ? DG.briefRich[gBrief.date] : null;
  const leads = brRich?.leads || [];
  const lead0 = leads[0] || (gBrief?.brief ? { head: gBrief.brief.lines[0] || gBrief.brief.title, summary: '', qds: [] } : null);
  const alsoLeads = leads.slice(1, 3);
  const totalLeads = brRich?.totalLeads || leads.length;

  const r0 = RADAR ? (() => {
    const L = RADAR.entries.filter(e => e.added === RADAR.updated).sort((a, b) => b.id - a.id);
    const e = L[0];
    if (rdPick && e) return { d: RADAR.updated, href: rdPick.href, title: rdPick.name, sub: rdPick.sub, n: L.length, fresh: RADAR.updated === bjBuild };
    return e ? { d: RADAR.updated, href: `radar/index.html#r${e.id}`, title: e.name, sub: e.what, n: L.length, fresh: RADAR.updated === bjBuild } : null;
  })() : null;

  // 在学公开课数据（供砚墨案头次要项展示真实课程进度）
  const CR = groups.map(G => {
    const all = items.filter(i => i.group === G.id).sort(ord);
    if (!all.some(isPage)) return null;
    const n = all.length, cnt = countBy(all), done = cnt['已学完'] + cnt['已掌握'];
    const pg = all.filter(localPage);
    const nx = pg.find(i => stateOf(i) === '进行中') || pg.find(i => !['已学完', '已掌握'].includes(stateOf(i))) || pg[0] || null;
    const parts = G.title.split(' · ');
    return { id: G.id, school: parts[0] || G.title, title: G.title, href: `${G.dir}/index.html`, n, done, doing: cnt['进行中'], ids: all.map(i => i.id), nx: nx ? { id: nx.id, label: nx.label, title: nx.title, href: nx.href } : null };
  }).filter(Boolean);

  // 继续学候选：学习页已上线、review.json 还没有 learned（进行中），按开始日从新到旧
  const contPool = items.filter(i => isPage(i) && stateOf(i) === '进行中').sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')))
    .map(i => ({ id: i.id, href: i.href, title: i.title, label: i.label || '', col: colTitle(i.column), colId: i.column, start: i.start || '', secs: lessonSecs(i), sub: [colTitle(i.column), i.label, i.start ? `${i.start.slice(5).replace('-', '/')} 开始` : '', lessonSecs(i) ? `${lessonSecs(i)} 节` : ''].filter(Boolean).join(' · ') }));

  const doneCount = items.filter(i => ['已学完', '已掌握'].includes(stateOf(i))).length;
  const doingCount = items.filter(i => stateOf(i) === '进行中').length;
  const totalCount = items.length;

  const firstCont = contPool[0] || null;
  const secondCont = contPool.find(c => c.id !== firstCont?.id && c.colId !== 'courses') || contPool[1] || null;
  const topCourse = CR[0] || null;

  // 海报数据（取最新一期的前 2 张展示，标注完整张数）
  const pCards = gPosters ? (DG.posterRich[gPosters.date] || gPosters.posters.items).slice(0, 2) : [];

  // 产品灵感（取 data/ph-inspo.json 最新一天，保留真实日期与全部产品计数）
  const phAllDays = (PHI.days || []).filter(d => d.date && (d.items || []).length).sort((a, b) => b.date.localeCompare(a.date));
  const phLatest = phAllDays[0] || null;
  const phN = phAllDays.reduce((n, d) => n + d.items.length, 0);
  const phItemsOrdered = phLatest ? (phLatest.picks ? phLatest.items : [...phLatest.items].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))) : [];
  const phTop3 = phItemsOrdered.slice(0, 3);
  const phRest = phItemsOrdered.slice(3);

  const trimText = (s, max = 230) => { const t = String(s || '').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; };
  const qdHtml = qd => {
    const m = qd.match(/^([^：:]{2,10})[：:]\s*(.*)$/);
    return m ? `<p><strong>${esc(m[1])}：</strong>${esc(m[2])}</p>` : `<p>${esc(qd)}</p>`;
  };

  // 馆藏总目 13 个真实入口
  const colProgInfo = id => {
    const L = items.filter(i => i.column === id);
    const done = L.filter(i => ['已学完', '已掌握'].includes(stateOf(i))).length;
    const doing = L.filter(i => stateOf(i) === '进行中').length;
    const n = L.length;
    return {
      ids: L.map(i => i.id).join(','),
      stat: `已学完 ${done}/${n}${doing ? ` · 进行中 ${doing}` : (n - done ? ` · 待学 ${n - done}` : ' · 全部学完')}`,
      donePct: n ? (done / n * 100).toFixed(1) : '0',
      doingPct: n ? (doing / n * 100).toFixed(1) : '0',
      n,
    };
  };
  const studyCatRows = columns.map(c => {
    const st = colProgInfo(c.id);
    const extraDesc = c.id === 'courses' ? `（含 ${groups.length} 门公开课，另附公开课参考清单）` : '';
    return `<a class="cat-row" href="${c.dir}/index.html" data-filter-item data-cats="study" data-hay="${esc(`${c.title} ${c.id} ${c.desc} ${st.n}`)}">
      <span class="cat-name">${esc(c.title)}</span>
      <span class="cat-stat">${esc(st.stat)}</span>
      <span class="cat-desc"><span>${esc(c.desc)}${esc(extraDesc)}</span></span>
      <span class="prog" data-k="prog" data-ids="${esc(st.ids)}"><span class="thin-bar bar"><i class="g" style="width:0%"></i><i class="l" style="width:${st.donePct}%"></i><i class="b" style="width:${st.doingPct}%"></i></span><span></span></span>
    </a>`;
  }).join('')
  + `<a class="cat-row" href="glossary.html" data-filter-item data-cats="study" data-hay="概念卡 术语 词典 glossary ${concepts.length}">
      <span class="cat-name">概念卡</span>
      <span class="cat-stat">${concepts.length} 张${gitDay('data/concepts.json') ? ` · 更新 ${md(gitDay('data/concepts.json'))}` : ''}</span>
      <span class="cat-desc"><span>一个术语一张卡，跨栏目串起来</span></span>
    </a>`
  + (DSH ? `<a class="cat-row" href="dsh-plugins/index.html" data-filter-item data-cats="study" data-hay="dsh 插件 deepseek harness 市场 ${dshVerified}">
      <span class="cat-name">DSH 插件</span>
      <span class="cat-stat">${dshVerified} 个核实${DSH.asOf ? ` · 更新 ${md(DSH.asOf)}` : ''}</span>
      <span class="cat-desc"><span>DeepSeek Harness 插件市场盘点与 5 个可借鉴机制</span></span>
    </a>` : '');

  const signalCatRows = [
    `<a class="cat-row" href="${g0 ? esc(g0.href) : 'digest/index.html'}" data-filter-item data-cats="signal" data-hay="每日汇总 日更 早报 digest ${DG.list.length}">
      <span class="cat-name">每日汇总</span>
      <span class="cat-stat">${g0 ? `${md(g0.date)} 最新 · ` : ''}${DG.list.length} 期</span>
      <span class="cat-desc"><span>当天 X 简报、X 海报与产品灵感合刊早报</span></span>
    </a>`,
    `<a class="cat-row" href="x-brief/index.html" data-filter-item data-cats="signal" data-hay="x 简报 每天 中文简报 往期 ${DG.briefCount}">
      <span class="cat-name">X 简报</span>
      <span class="cat-stat">${DG.briefCount} 期${gBrief ? ` · 更新 ${md(gBrief.date)}` : ''}</span>
      <span class="cat-desc"><span>每天一期的 X 中文简报，按日期翻往期与周趋势</span></span>
    </a>`,
    `<a class="cat-row" href="x-posters/index.html" data-filter-item data-cats="signal" data-hay="x 海报 康奈尔 笔记 画廊 ${DG.posterTotal}">
      <span class="cat-name">X 海报</span>
      <span class="cat-stat">${DG.posterTotal} 张${gPosters ? ` · 更新 ${md(gPosters.date)}` : ''}</span>
      <span class="cat-desc"><span>每天从 X 挑技术帖做成康奈尔笔记海报，附原帖信息</span></span>
    </a>`,
    `<a class="cat-row" href="ph-inspo/index.html" data-filter-item data-cats="signal" data-hay="产品灵感 product hunt ph 榜单 ${phN}">
      <span class="cat-name">产品灵感</span>
      <span class="cat-stat">${phN} 个${phLatest ? ` · 榜单 ${md(phLatest.date)}` : ''}</span>
      <span class="cat-desc"><span>从 Product Hunt 榜单里挑的产品（${phAllDays.length} 天 · 太平洋时间榜单日）</span></span>
    </a>`,
    ...(RADAR ? [`<a class="cat-row" href="radar/index.html" data-filter-item data-cats="signal" data-hay="雷达 开源 参考 清单 coding agent 工作台 ${RADAR.entries.length}">
      <span class="cat-name">雷达</span>
      <span class="cat-stat">${RADAR.entries.length} 条 · 更新 ${md(RADAR.updated)}</span>
      <span class="cat-desc"><span>${esc(RADAR.title)} · ${esc(RADAR.subtitle)}</span></span>
    </a>`] : []),
    `<a class="cat-row" href="favorites/index.html" data-filter-item data-cats="mine" data-hay="收藏 favorites 书签 同步设置">
      <span class="cat-name">收藏</span>
      <span class="cat-stat">个人索引与同步</span>
      <span class="cat-desc"><span>跨栏目个人收藏与 GitHub 同步设置入口</span></span>
    </a>`,
  ].join('');
  const studyCatN = columns.length + 1 + (DSH ? 1 : 0);
  const signalCatN = 4 + (RADAR ? 1 : 0);
  const totalCatN = studyCatN + signalCatN + 1;

  const revData = JSON.stringify({ queue: review.queue, items: Object.fromEntries(items.map(i => [i.id, { title: i.title, label: i.label, href: i.href, col: colById[i.column]?.title || '' }])) }).replace(/</g, '\\u003c');
  const tdPayload = {
    cont: contPool,
    courses: CR,
    totalItems: totalCount,
    dgDate: g0?.date || null,
    radarDate: r0?.d || null,
  };
  const tdJson = JSON.stringify(tdPayload).replace(/</g, '\\u003c');

  const ssrPrimary = firstCont
    ? `<a class="resume-primary" href="${esc(firstCont.href)}"><div class="resume-kicker"><span class="td-src"><span>继续学</span> · ${esc(firstCont.col)}${firstCont.start ? ` · ${md(firstCont.start)} 开始` : ''}</span>${firstCont.secs ? `<span class="mono">${firstCont.secs} 节</span>` : ''}</div><h2>${esc(firstCont.title)}</h2><div class="resume-foot"><span>${esc(firstCont.label || firstCont.col)} · 进行中</span><span class="go-arrow">继续读 →</span></div></a>`
    : `<div class="resume-primary"><h2>全部学习页已学完</h2><div class="resume-foot"><span>去探索新主题或查看公开课</span></div></div>`;

  const ssrSecondary = [
    secondCont ? `<a class="monolith-item" href="${esc(secondCont.href)}"><div class="mi-meta"><span>在学 · ${esc(secondCont.col)}</span><span class="mono">${secondCont.secs ? `${secondCont.secs} 节` : (secondCont.start ? md(secondCont.start) : '进行中')}</span></div><div class="mi-title">${esc(secondCont.title)}</div><div class="mi-sub">${esc(secondCont.label || secondCont.col)} · 进行中 →</div></a>` : '',
    topCourse ? `<a class="monolith-item" href="${esc(topCourse.href)}"><div class="mi-meta"><span>在学公开课 · ${esc(topCourse.school)}</span><span class="mono">已学完 ${topCourse.done} / ${topCourse.n}</span></div><div class="mi-title">${esc(topCourse.title)}</div><div class="monolith-bar" aria-hidden="true"><span class="d" style="width:${topCourse.n ? (topCourse.done / topCourse.n * 100).toFixed(1) : 0}%"></span><span class="p" style="width:${topCourse.n ? (topCourse.doing / topCourse.n * 100).toFixed(1) : 0}%"></span></div><div class="mi-sub">${topCourse.nx ? `下一讲：${esc(topCourse.nx.label)} ${esc(topCourse.nx.title)} →` : '进入课程 →'}</div></a>` : '',
  ].join('');

  const body = `<div id="today">
  <section class="masthead" aria-label="今日刊头">
    <div class="masthead-date-wrap">
      <h1 class="masthead-date tnum" data-f="date-short">${bm}月${bd}日</h1>
      <div class="masthead-meta">
        <span data-f="date-meta">星期${bwd} · ${by}</span>
        <span class="dot" aria-hidden="true">/</span>
        <span>北京时间 09:00 汇总</span>
      </div>
    </div>
    <div class="masthead-right">
      <span class="today-status-pill" data-td="prog">今日已读 0 / ${(g0 ? 1 : 0) + (r0 ? 1 : 0)}</span>
      ${g0 ? `<a class="quiet-link" href="${esc(g0.href)}">${md(g0.date)} 汇总</a>` : ''}
      <a class="quiet-link" href="favorites/index.html#settings">同步设置 →</a>
    </div>
  </section>

  <p id="prog-hint" class="td-synchint" hidden></p>

  <div class="done-banner" data-td="fin" hidden role="status">
    ${ic('circle-check', 17, 'ic')}
    <span>今天读完了</span>
  </div>

  <!-- 第一幕：双主角并置（桌面左右并置 / 手机首屏紧凑书签 + 今日头条） -->
  <section class="home-stage" aria-label="今日头条与继续学习">
    <article class="lead-col">
      <div class="lead-eyebrow">
        <span class="eyebrow-tag">今日头条 · ${gBrief ? `${esc(gBrief.brief.title)}` : '每日汇总'}</span>
        ${g0 ? `<button type="button" class="read-check td-ck" data-id="digest:${esc(g0.date)}" aria-pressed="false" aria-label="标为看过：${md(g0.date)} 每日汇总">${CHECK_SVG}<span class="chk-lbl">标为看过</span></button>` : ''}
      </div>

      ${lead0 && gBrief ? `
      <h2 class="lead-headline"><a href="${esc(gBrief.brief.href)}">${esc(lead0.head)}</a></h2>
      ${lead0.summary ? `<p class="lead-summary">${esc(trimText(lead0.summary, 280))}</p>` : ''}
      ${lead0.qds?.length ? `<details class="lead-details"><summary>展开前提争议与看点</summary><div class="lead-details-body">${lead0.qds.map(qdHtml).join('')}</div></details>` : ''}
      <div class="lead-actions">
        <a class="btn primary" href="${esc(gBrief.brief.href)}">读 ${md(gBrief.date)} 简报全文（${totalLeads} 条主线）→</a>
        ${g0 ? `<a class="text-link" href="${esc(g0.href)}">${md(g0.date)} 每日汇总</a>` : ''}
        <a class="quiet-link" href="x-brief/index.html">翻往期 ${DG.briefCount} 期</a>
      </div>
      ${alsoLeads.length ? `<div class="also-today"><span class="also-label">同日另${alsoLeads.length === 2 ? '两' : alsoLeads.length}条主线</span>${alsoLeads.map(l => `<a class="also-item" href="${esc(gBrief.brief.href)}"><span class="also-title">${esc(l.head)}</span>${l.summary ? `<span class="also-desc">${esc(trimText(l.summary, 110))}</span>` : ''}</a>`).join('')}</div>` : ''}
      ` : '<p class="lead-summary">还没有简报。</p>'}
    </article>

    <aside class="study-monolith" data-td="list" aria-label="继续学习案头">
      <div class="monolith-head">
        <span class="monolith-label">继续学习 · 案头书签</span>
        <span class="monolith-ratio" data-td="ratio">已学完 ${doneCount} / ${totalCount}</span>
      </div>
      <div class="row resume-wrap" data-td="continue">${ssrPrimary}</div>
      <div class="monolith-secondary" data-td="secondary">${ssrSecondary}</div>
      <div class="monolith-review" data-td="review">
        <div class="monolith-review-head">
          <span>间隔复习</span>
          <span class="ok-state"><span class="ok-dot" aria-hidden="true"></span>今天没有到期的复习 ${ic('party-popper', 14)}</span>
        </div>
      </div>
    </aside>
  </section>
</div>

<!-- 第二幕：今日海报 + 产品灵感与每周雷达 -->
<section class="home-band" aria-label="今日海报、产品灵感与每周雷达">
  <div class="signal-grid">
    <div>
      <div class="sec-head">
        <h2>今日 X 海报${gPosters ? ` <span class="sec-sub">${md(gPosters.date)} · 共 ${gPosters.posters.n} 张康奈尔笔记</span>` : ''}</h2>
        ${gPosters ? `<a class="quiet-link" href="${esc(gPosters.posters.href)}">查看全部 ${gPosters.posters.n} 张拆解 →</a>` : '<a class="quiet-link" href="x-posters/index.html">往期画廊 →</a>'}
      </div>
      ${pCards.length ? `<div class="poster-spread">${pCards.map(p => `<a class="poster-card card" href="${esc(p.href)}"><div class="poster-frame"><img src="${esc(p.img)}" alt="${esc(p.title)}" loading="lazy"></div><h3 class="poster-card-title">${esc(p.title)}</h3>${(p.who || p.take) ? `<span class="poster-card-meta">${esc(trimText([p.who, p.take].filter(Boolean).join(' · '), 86))}</span>` : ''}</a>`).join('')}</div>` : '<div class="empty"><b>还没有海报</b>每天从 X 挑技术帖做成康奈尔笔记海报。</div>'}
    </div>

    <div class="signal-side">
      <div>
        <div class="sec-head">
          <h2>产品灵感${phLatest ? ` <span class="sec-sub">PH 榜单 ${md(phLatest.date)} · ${phLatest.items.length} 个</span>` : ''}</h2>
          <a class="quiet-link" href="ph-inspo/index.html">全部 ${phN} 个 →</a>
        </div>
        ${phTop3.length ? `<div class="inspo-list">${phTop3.map((it, k) => `<a class="inspo-row" href="ph-inspo/index.html#${esc(it.id)}"><div class="inspo-row-top"><span class="inspo-name">${esc(it.name)}</span>${phLatest.picks && k < 3 ? '<span class="inspo-pick">先看</span>' : (it.rank != null ? `<span class="quiet-link mono">#${esc(it.rank)}</span>` : '')}</div><p class="inspo-brief">${esc(trimText(it.what, 110))}</p></a>`).join('')}</div>` : '<p class="muted">还没有产品灵感。</p>'}
        ${phRest.length ? `<div class="inspo-rest"><span>同榜其余 ${phRest.length} 款：</span>${phRest.map(it => `<a href="ph-inspo/index.html#${esc(it.id)}">${it.rank != null ? `#${esc(it.rank)} ` : ''}${esc(it.name)}</a>`).join('')}</div>` : ''}
      </div>

      ${RADAR && r0 ? `<article class="radar-feature" aria-labelledby="h-radar">
        <div class="radar-feature-top">
          <span class="eyebrow-tag" id="h-radar">${esc(RADAR.title)} · 本周首选</span>
          <button type="button" class="read-check td-ck" data-id="radar:${esc(r0.d)}" aria-pressed="false" aria-label="标为看过：${esc(r0.title)}">${CHECK_SVG}<span class="chk-lbl">标为看过</span></button>
        </div>
        <h3><a href="${esc(r0.href)}">${esc(r0.title)}</a></h3>
        ${r0.sub ? `<p>${esc(trimText(r0.sub, 150))}</p>` : ''}
        <div class="radar-feature-foot">
          <span class="tnum">${md(r0.d)} · 最近一次 · 新增 ${r0.n} 条</span>
          <a class="text-link" href="radar/index.html">翻阅雷达（${RADAR.entries.length} 条）→</a>
        </div>
      </article>` : ''}
    </div>
  </div>
</section>

<!-- 第三幕：找回资料 · 馆藏总目 -->
<section class="home-band" id="catalogue" data-filter-scope aria-labelledby="h-cat">
  <div class="sec-head">
    <h2 id="h-cat">馆藏总目 <span class="sec-sub">找回已收进来的资料 · 全部 ${totalCatN} 个入口</span></h2>
    <span class="quiet-link tnum" data-filter-count>显示 ${totalCatN} / ${totalCatN}</span>
  </div>

  <div class="catalogue-controls">
    <div class="filter-tabs" role="group" aria-label="按用途筛选馆藏">
      <button type="button" class="filter-tab" data-filter-tab="all" aria-pressed="true">全部</button>
      <button type="button" class="filter-tab" data-filter-tab="study" aria-pressed="false">长期精学（${studyCatN}）</button>
      <button type="button" class="filter-tab" data-filter-tab="signal" aria-pressed="false">每日与雷达（${signalCatN}）</button>
      <button type="button" class="filter-tab" data-filter-tab="mine" aria-pressed="false">收藏（1）</button>
    </div>
    <label class="search-line">
      ${ic('search', 15, 'ic')}
      <input type="search" data-filter-input placeholder="按栏目或主题找回资料…" aria-label="筛选馆藏栏目">
    </label>
  </div>

  <div class="catalogue-cols">
    <div data-filter-group>
      <h3 class="cat-group-title">
        <span>长期精学</span>
        <span class="tnum">已学完 ${doneCount} · 进行中 ${doingCount} · 共 ${totalCount} 篇</span>
      </h3>
      ${studyCatRows}
    </div>
    <div data-filter-group>
      <h3 class="cat-group-title">
        <span>每日信号、开源雷达与收藏</span>
        <span>日更与长期检索</span>
      </h3>
      ${signalCatRows}
    </div>
  </div>

  <p data-filter-empty hidden style="margin:24px 0 0;color:var(--ink-3);font-size:14.5px">没有找到匹配的馆藏栏目，请清空关键词重试。</p>
</section>`;

  const script = `const R=${revData};const TD=${tdJson};const p=n=>String(n).padStart(2,'0');const today=bjToday(); /* 北京时间的今天；自查用：?today=2026-10-14 */
function bjToday(){var q=new URLSearchParams(location.search).get('today');if(q)return q;try{var s=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(/^\\d{4}-\\d{2}-\\d{2}$/.test(s))return s}catch(e){}var t=new Date(Date.now()+8*36e5);return t.getUTCFullYear()+'-'+p(t.getUTCMonth()+1)+'-'+p(t.getUTCDate())}
const add=(t,n)=>{const x=new Date(t+'T12:00:00');x.setDate(x.getDate()+n);return x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate())};
const doneExpand=u=>{const out=[],vs=new Set([u]);if(u.endsWith('/index.html')){const d=u.slice(0,-10);vs.add(d);vs.add(d.replace(/\\/$/,'')||'/')}else if(u.endsWith('/')){vs.add(u+'index.html');vs.add(u.replace(/\\/$/,'')||'/')}else if(!/\\.[a-z0-9]+$/i.test(u)){vs.add(u+'/');vs.add(u+'/index.html')}for(const x of vs){out.push(x);const m=x.match(/^(.*)\\/courses\\/(.+)$/);if(m)out.push(m[1]+'/'+m[2]);const m2=x.match(/^(.*)\\/(cs146s)\\/(.+)$/);if(m2&&!x.includes('/courses/'))out.push(m2[1]+'/courses/'+m2[2]+'/'+m2[3])}return[...new Set(out)]};
const doneOf=h=>{const keys=[];const addK=u=>{for(const k of doneExpand(u))if(!keys.includes(k))keys.push(k)};try{addK(new URL(h,new URL(__R,location.href)).pathname)}catch(e){}try{addK(new URL(h,location.href).pathname)}catch(e){}for(const k of keys){const d=localStorage.getItem('done:'+k);if(d)return d}return null};
const iso=s=>typeof s==='string'&&/^\\d{4}-\\d{2}-\\d{2}$/.test(s)?s:'';
const BAKED=JSON.parse(JSON.stringify(R.queue));
const EFFJOIN=${PROG.effectiveJoin.toString()};
const INTERVALS=${JSON.stringify(PROG.INTERVALS)};
function joinMap(id){try{const o=JSON.parse(localStorage.getItem('rev-join:'+id)||'null');if(!o||typeof o!=='object'||!(+o.at>0))return null;if(o.joined&&!iso(o.joined))return null;return{joined:iso(o.joined),at:+o.at}}catch(e){return null}}
function plan(queue){R.queue=JSON.parse(JSON.stringify(queue));for(const q of R.queue){if(!R.items[q.item])continue;const local=joinMap(q.item);const j=EFFJOIN(q,local);if(!j){q.reviews=[];delete q.joined;continue}const have=(q.joined===j&&Array.isArray(q.reviews))?q.reviews:[];const at=new Date((local&&local.at)||Date.parse(q.joinAt||'')||Date.now()).toISOString();q.joined=j;q.reviews=INTERVALS.map(function(n){const old=have.find(function(r){return +r.day===n});if(old)return Object.assign({},old,{day:n,date:add(j,n)});return{day:n,date:add(j,n),done:false,at:at}})}}
plan(BAKED);
const diff=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);
const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const EFF=${PROG.effReview.toString()};
const NEXT=${PROG.nextContinue.toString()};
const G={over:[],today:[],later:[],seen:[]};
function revMap(id){try{const o=JSON.parse(localStorage.getItem('rev-done:'+id)||'{}');return o&&typeof o==='object'&&!Array.isArray(o)?o:{}}catch(e){return {}}}
function revPut(id,o){try{const k='rev-done:'+id;if(!o||!Object.keys(o).length)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(o))}catch(e){}}
function revDated(m,day){const v=m[day];return typeof v==='string'&&/^\\d{4}-\\d{2}-\\d{2}$/.test(v)?v:''}
function opsMap(id){try{const o=JSON.parse(localStorage.getItem('rev-op:'+id)||'{}');return o&&typeof o==='object'&&!Array.isArray(o)?o:{}}catch(e){return {}}}
function opsPut(id,o){try{const k='rev-op:'+id;if(!o||!Object.keys(o).length)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(o))}catch(e){}}
const stOf=(q,m,o)=>r=>EFF(r,revDated(m,r.day),o[r.day]);
function bucket(){G.over.length=0;G.today.length=0;G.later.length=0;G.seen.length=0;
 for(const q of R.queue){if(!R.items[q.item]||!q.joined||!q.reviews||!q.reviews.length)continue;const st=stOf(q,revMap(q.item),opsMap(q.item));const done=r=>st(r).done;
  const pend=q.reviews.filter(r=>!done(r));const due=pend.filter(r=>r.date<=today);
  if(due.length){const late=diff(due[0].date,today);(late>0?G.over:G.today).push({item:q.item,day:due[due.length-1].day,late,n:due.length,date:due[0].date})}
  else if(pend.length)G.later.push({item:q.item,day:pend[0].day,date:pend[0].date,inN:diff(today,pend[0].date)});
  const fin=q.reviews.filter(r=>{const e=st(r);return e.done&&e.on===today});
  if(fin.length&&!due.length){const late=diff(fin[0].date,today);G.seen.push({item:q.item,day:fin[fin.length-1].day,late,n:fin.length,date:fin[0].date,on:1})}}
 G.over.sort((a,b)=>b.late-a.late);G.later.sort((a,b)=>a.date.localeCompare(b.date))}
function toggleRev(id){const q=R.queue.find(x=>x.item===id);if(!q)return;const m=revMap(id),o=opsMap(id),st=stOf(q,m,o),now=Date.now();const marked=q.reviews.filter(r=>{const e=st(r);return e.done&&e.on===today});
 if(marked.length){for(const r of marked){delete m[r.day];o[r.day]={done:false,at:now}}revPut(id,m);opsPut(id,o);return}
 for(const r of q.reviews){if(st(r).done)continue;if(r.date<=today){m[r.day]=today;o[r.day]={done:true,on:today,at:now}}}
 revPut(id,m);opsPut(id,o)}
{const W='日一二三四五六',[y,m,dd]=today.split('-').map(Number),wd=new Date(y,m-1,dd).getDay();
 document.querySelectorAll('[data-f="date-short"]').forEach(e=>e.textContent=m+'月'+dd+'日');
 document.querySelectorAll('[data-f="date-meta"]').forEach(e=>e.textContent='星期'+W[wd]+' · '+y);}
function tdLoad(){try{return JSON.parse(localStorage.getItem('today-read:'+today)||'{}')||{}}catch(e){return {}}}
function tdSave(o){try{localStorage.setItem('today-read:'+today,JSON.stringify(o))}catch(e){}}
function isLearnedId(id){const q=R.queue.find(x=>x.item===id);if(q&&q.learned)return true;const it=R.items[id];return !!(it&&it.href&&!/^https?:/.test(it.href)&&doneOf(it.href))}
function mdStr(d){return d?String(d).slice(5).replace('-','/'):''}
function renderToday(focusId){
 var contBox=document.querySelector('[data-td="continue"]');
 var secBox=document.querySelector('[data-td="secondary"]');
 var revBox=document.querySelector('[data-td="review"]');
 var ratioEl=document.querySelector('[data-td="ratio"]');
 var cont=NEXT(TD.cont,R.queue,R.items,doneOf);
 if(contBox){
  contBox.innerHTML=cont?'<a class="resume-primary" href="'+E(cont.href)+'"><div class="resume-kicker"><span class="td-src"><span>继续学</span> · '+E(cont.col)+(cont.start?' · '+E(mdStr(cont.start))+' 开始':'')+'</span>'+(cont.secs?'<span class="mono">'+cont.secs+' 节</span>':'')+'</div><h2>'+E(cont.title)+'</h2><div class="resume-foot"><span>'+E(cont.label||cont.col)+' · 进行中</span><span class="go-arrow">继续读 →</span></div></a>':'<div class="resume-primary"><h2>全部学习页已学完</h2><div class="resume-foot"><span>去探索新主题或查看公开课</span></div></div>';
 }
 if(secBox){
  var rest=TD.cont.filter(function(c){return c&&(!cont||c.id!==cont.id)&&!isLearnedId(c.id)});
  var second=rest.find(function(c){return c.colId!=='courses'})||rest[0]||null;
  var crs=TD.courses&&TD.courses[0]||null;
  var sh='';
  if(second){sh+='<a class="monolith-item" href="'+E(second.href)+'"><div class="mi-meta"><span>在学 · '+E(second.col)+'</span><span class="mono">'+(second.secs?second.secs+' 节':(second.start?E(mdStr(second.start)):'进行中'))+'</span></div><div class="mi-title">'+E(second.title)+'</div><div class="mi-sub">'+E(second.label||second.col)+' · 进行中 →</div></a>';}
  if(crs){
   var cDone=crs.ids.filter(isLearnedId).length,cDoing=Math.max(0,crs.n-cDone);
   var dPct=crs.n?(cDone/crs.n*100).toFixed(1):'0',pPct=crs.n?(Math.min(crs.doing,cDoing)/crs.n*100).toFixed(1):'0';
   sh+='<a class="monolith-item" href="'+E(crs.href)+'"><div class="mi-meta"><span>在学公开课 · '+E(crs.school)+'</span><span class="mono">已学完 '+cDone+' / '+crs.n+'</span></div><div class="mi-title">'+E(crs.title)+'</div><div class="monolith-bar" aria-hidden="true"><span class="d" style="width:'+dPct+'%"></span><span class="p" style="width:'+pPct+'%"></span></div><div class="mi-sub">'+(crs.nx?'下一讲：'+E(crs.nx.label)+' '+E(crs.nx.title)+' →':'进入课程 →')+'</div></a>';
  }
  secBox.innerHTML=sh;
 }
 if(ratioEl){
  var doneN=Object.keys(R.items).filter(isLearnedId).length;
  ratioEl.textContent='已学完 '+doneN+' / '+TD.totalItems;
 }
 var due=[].concat(G.over,G.today,G.seen);
 if(revBox){
  if(!due.length){
   var nx=G.later[0],ni=nx&&R.items[nx.item];
   revBox.innerHTML='<div class="monolith-review-head"><span>间隔复习</span><span class="ok-state"><span class="ok-dot" aria-hidden="true"></span>今天没有到期的复习 '+__ic('party-popper',14)+'</span></div>'+(ni?'<div style="margin-top:6px;font-size:12px;color:var(--obsidian-ink-3)">下一次 '+E(mdStr(nx.date))+'：'+E(ni.title)+'</div>':'');
  }else{
   var pendingN=G.over.length+G.today.length;
   var rowsHtml=due.map(function(r){
    var it=R.items[r.item];if(!it)return '';
    var q=R.queue.find(function(x){return x.item===r.item});
    var learned=iso(q&&q.learned)||iso(doneOf(it.href))||'';
    var when=learned?mdStr(learned)+' 学完 · ':'';
    var sub=(it.col?it.col+' · ':'')+(it.label?it.label+' · ':'')+when+'第 '+r.day+' 天复习'+(r.n>1?' · 积压 '+r.n+' 次':'');
    var meta=r.late>0?('逾期 '+r.late+' 天'):'今天到期';
    var on=!!r.on;
    var act=on?'取消本次复习：':'标为已复习：';
    return '<div class="row monolith-rev-row'+(on?' on':'')+'"><button type="button" class="td-ck" data-id="rev:'+E(r.item)+'" aria-pressed="'+(on?'true':'false')+'" aria-label="'+act+E(it.title)+'">'+(on?'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>':'')+'</button><div class="rev-body"><a class="rev-title" href="'+E(it.href)+'">'+E(it.title)+'</a><span class="rev-sub">'+E(sub)+'</span><span class="rev-meta">'+E(meta)+'</span></div></div>';
   }).join('');
   revBox.innerHTML='<div class="monolith-review-head"><span>间隔复习</span><span style="color:#eb846c;font-weight:600">'+(pendingN?pendingN+' 篇到期':'今日已复习')+'</span></div><div class="monolith-rev-list">'+rowsHtml+'</div>';
  }
 }
 var saved=tdLoad(),ckBtns=[].slice.call(document.querySelectorAll('.td-ck')),doneCk=0;
 ckBtns.forEach(function(b){
  var id=b.getAttribute('data-id')||'';
  var isRev=id.indexOf('rev:')===0;
  var on=isRev?(b.getAttribute('aria-pressed')==='true'):!!saved[id];
  if(!isRev){
   b.setAttribute('aria-pressed',on?'true':'false');
   var lbl=b.querySelector('.chk-lbl');if(lbl)lbl.textContent=on?'今日已读':'标为看过';
  }
  if(on)doneCk++;
  b.onclick=function(){
   if(isRev){var rid=id.slice(4),prev=revMap(rid);toggleRev(rid);var next=revMap(rid);bucket();renderToday(id);if(window.PROG&&PROG.onReview)PROG.onReview(rid,prev,next);return}
   var o=tdLoad();if(o[id])delete o[id];else o[id]=1;tdSave(o);renderToday(id);
  };
 });
 var prog=document.querySelector('[data-td="prog"]');if(prog)prog.textContent=ckBtns.length?('今日已读 '+doneCk+' / '+ckBtns.length):'';
 var fin=document.querySelector('[data-td="fin"]');if(fin)fin.hidden=!(ckBtns.length&&doneCk===ckBtns.length);
 if(focusId){var nb=document.querySelector('.td-ck[data-id="'+focusId.replace(/"/g,'')+'"]');if(nb)nb.focus()}
}
bucket();renderToday();
/* 云端进度：生成页里嵌的 review.json 是构建那一刻的，打开首页时再读一次仓库里的 data/review.json */
function mergeCloud(doc){if(!doc||!Array.isArray(doc.queue))return;var by={};doc.queue.forEach(function(c){if(c&&c.item)by[c.item]=c});
 var next=BAKED.map(function(q){var c=by[q.item];if(!c)return JSON.parse(JSON.stringify(q));var n=JSON.parse(JSON.stringify(q));var cl=iso(c.learned)||'';if(cl)n.learned=cl;else delete n.learned;
  if(iso(c.joined)){n.joined=c.joined;n.reviews=JSON.parse(JSON.stringify(c.reviews||[]));}else{delete n.joined;n.reviews=[];}
  if(typeof c.joinAt==='string'&&c.joinAt)n.joinAt=c.joinAt;else delete n.joinAt;return n});
 next.forEach(function(q){var local=joinMap(q.item),j=EFFJOIN(q,local),ca=Date.parse(q.joinAt||'')||0;
  if(local&&local.at<=ca){try{localStorage.removeItem('rev-join:'+q.item)}catch(e){}}
  if(!j){try{localStorage.removeItem('rev-done:'+q.item);localStorage.removeItem('rev-op:'+q.item)}catch(e){}return}
  var m=revMap(q.item),o=opsMap(q.item),mc=0,oc=0;(q.reviews||[]).forEach(function(r){var ra=Date.parse(r.at||'')||0;if(!ra)return;var op=o[r.day];if(op&&+op.at>ra)return;if(op){delete o[r.day];oc=1}if(!r.done&&m[r.day]){delete m[r.day];mc=1}});if(mc)revPut(q.item,m);if(oc)opsPut(q.item,o)});
 plan(next);bucket();renderToday()}
window.addEventListener('prog-doc',function(e){mergeCloud(e.detail)});
function loadCloud(){var tk='';try{tk=localStorage.getItem('fav:token')||''}catch(e){}var base=new URL(typeof __R==='string'?__R:'index.html',location.href);
 var pub=function(){return fetch(new URL('data/review.json?t='+Date.now(),base).href,{cache:'no-store'}).then(function(r){return r.ok?r.json():null})};
 var dec=function(j){return j&&j.content?JSON.parse(decodeURIComponent(escape(atob(String(j.content).replace(/\\s/g,''))))):null};
 var p=tk?fetch('https://api.github.com/repos/ww880412/learning/contents/data/review.json?ref=main&t='+Date.now(),{headers:{Authorization:'Bearer '+tk,Accept:'application/vnd.github+json'},cache:'no-store'}).then(function(r){return r.ok?r.json().then(dec):pub()}).catch(pub):pub();
 return p.then(mergeCloud).catch(function(){}).then(function(){window.__cloudReady=1})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadCloud);else loadCloud();`;
  write(f, page(f, '首页', 'home', body, script));
}
// ---- 栏目页 + 主题页（V4 活版书房：公开课行卷 + 文章筛选列表） ----
for (const c of columns) {
  const f = `${c.dir}/index.html`;
  const allCol = items.filter(i => i.column === c.id);
  const its = pages.filter(i => i.column === c.id);
  const gs = groups.filter(g => g.column === c.id);
  const pending = items.filter(i => i.column === c.id && !i.group && !isPage(i)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const doneN = its.filter(i => ['已学完', '已掌握'].includes(stateOf(i))).length;
  const doingN = its.filter(i => stateOf(i) === '进行中').length;

  let body = `<div class="crumb"><a href="${rel(f, 'index.html')}">首页</a> <span>/</span> <span>${esc(c.title)}</span></div>
<section class="page-intro">
  <div>
    <h1>${esc(c.title)}</h1>
    <p class="intro-lead">${esc(c.desc)}${gs.length ? ` 共收录 ${gs.length} 个主题、${allCol.length} 讲（${its.length} 篇已做成学习页）。` : ` 共 ${allCol.length} 篇（${its.length} 篇已做成学习页${pending.length ? `，另有 ${pending.length} 篇待学` : ''}）。`}</p>
  </div>
  <div class="intro-stats" aria-label="${esc(c.title)}学习统计">
    ${gs.length ? `<div><b>${gs.length}</b><span>门主题课</span></div>` : `<div><b>${allCol.length}</b><span>篇总计</span></div>`}
    <div><b>${its.length}</b><span>篇学习页</span></div>
    <div class="st-ok" data-k="done" data-ids="${its.map(i => i.id).join(',')}"><b>${doneN}</b><span>已学完</span></div>
    <div class="st-doing" data-k="doing" data-ids="${its.map(i => i.id).join(',')}"><b>${doingN}</b><span>进行中</span></div>
    ${pending.length ? `<div><b>${pending.length}</b><span>篇未开始</span></div>` : ''}
  </div>
</section>`;

  if (!its.length && !gs.length && !pending.length) {
    body += emptyBox('还没有内容', `以后学到${esc(c.title)}的内容，会出现在这里。`);
  }

  // 公开课参考清单是用户自制静态页（courses/ai-agent-catalog/courses.html），不是第 6 门课：不进 items / review，勾选只在该页 localStorage。
  if (c.id === 'courses') {
    const cat = 'courses/ai-agent-catalog/courses.html';
    if (!fs.existsSync(path.join(ROOT, cat))) console.warn(`\n⚠️  warn: 缺少 ${cat}，公开课页的参考清单链接会 404。\n`);
    body += `<section class="catalog-ref-bar" id="course-catalog" aria-label="公开课参考清单">
  <div>
    <span class="eyebrow-tag" style="color:var(--warn)">参考清单 · 不计入进度</span>
    <h2>公开课参考清单</h2>
    <p>不是正在学的课，不进入复习队列。20 门、6 专题 + 综合，沿 2026-11-22 快照；勾选只留在这台浏览器。</p>
  </div>
  <a class="btn sm" href="${rel(f, cat)}">打开参考清单 →</a>
</section>`;
  }

  // 课程主题：V4 学术课表行卷（手机首屏紧凑显示多门课程）
  if (gs.length) {
    body += `<section class="course-ledger" aria-label="全部 ${gs.length} 门主题课">${gs.map(g => {
      const gall = items.filter(i => i.group === g.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const gi = gall.filter(isPage);
      const gp = gall.filter(i => !isPage(i));
      const cnt = countBy(gall);
      const gDone = cnt['已学完'] + cnt['已掌握'];
      const gDoing = cnt['进行中'];
      const n = gall.length;
      const parts = g.title.split(' · ');
      const school = parts[0] || g.title;
      const thumbs = gi.filter(i => i.preview).slice(0, 2);
      const nx = gi.find(i => stateOf(i) === '进行中') || gi[0];
      return `<a class="course-entry" href="${rel(f, g.dir + '/index.html')}">
  <div class="ce-code">
    <span class="ce-school">${esc(school)}</span>
    <span class="ce-term">${n} 讲${gp.length ? ` · ${gp.length} 讲未开始` : ''}</span>
  </div>
  <div class="ce-body">
    <h2 class="ce-title">${esc(g.title)}</h2>
    <p class="ce-desc">${esc(g.desc)}</p>
    <div class="prog ce-prog-wrap" data-k="prog" data-ids="${gall.map(i => i.id).join(',')}">
      <div class="thin-bar bar"><i class="g" style="width:${n ? (cnt['已掌握'] / n * 100).toFixed(1) : 0}%"></i><i class="l" style="width:${n ? (cnt['已学完'] / n * 100).toFixed(1) : 0}%"></i><i class="b" style="width:${n ? (gDoing / n * 100).toFixed(1) : 0}%"></i></div>
      <span class="ce-prog-txt">已学完 ${gDone}/${n}${gDoing ? ` · 进行中 ${gDoing}` : ''}${nx ? ` · 下一讲 ${esc(nx.label)}` : ''}</span>
    </div>
    ${thumbs.length ? `<div class="ce-thumbs" aria-hidden="true">${thumbs.map(t => `<img src="${rel(f, t.preview)}" alt="" loading="lazy">`).join('')}</div>` : ''}
  </div>
  <div class="ce-side">
    <span class="ce-count">${gi.length} 篇学习页</span>
    <span class="ce-go">进入课程 →</span>
  </div>
</a>`;
    }).join('')}</section>`;
  }

  // 散篇与待学：V4 可筛选文选目录（最新开始在前）
  const loose = its.filter(i => !i.group).sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')) || (b.order ?? 0) - (a.order ?? 0));
  const combined = [...loose, ...pending];
  if (combined.length) {
    const looseDone = loose.filter(i => ['已学完', '已掌握'].includes(stateOf(i))).length;
    const looseDoing = loose.filter(i => stateOf(i) === '进行中').length;
    const rowHtml = it => {
      const st = stateOf(it);
      const isP = isPage(it);
      const cat = !isP ? 'todo' : (['已学完', '已掌握'].includes(st) ? 'done' : 'doing');
      const href = /^https?:/.test(it.href) ? it.href : rel(f, it.href);
      const extAttr = /^https?:/.test(it.href) ? ' target="_blank" rel="noopener"' : '';
      const secs = isP ? lessonSecs(it) : 0;
      const note = cleanNote(it.note);
      const hay = `${it.label || ''} ${it.title || ''} ${note} ${st}`;
      return `<article class="essay-row row${it.preview ? ' has-thumb' : ''}" data-filter-item data-cats="${cat}" data-hay="${esc(hay)}">
  ${it.preview ? `<div class="essay-thumb"><a href="${esc(href)}"${extAttr}><img src="${rel(f, it.preview)}" alt="" loading="lazy"></a></div>` : ''}
  <div>
    <div class="essay-row-meta">
      <span class="essay-author">${esc(it.label)}</span>
      ${statusTag(st)}
      ${it.start ? `<span class="tnum">开始于 ${esc(it.start)}${secs ? ` · ${secs} 节` : ''}</span>` : (it.date ? `<span class="tnum">${esc(it.date)}</span>` : '')}
    </div>
    <h3><a href="${esc(href)}"${extAttr}>${esc(it.title)}</a></h3>
    ${note ? `<p class="essay-desc">${esc(note)}</p>` : ''}
  </div>
  <div class="syl-actions">
    ${isP ? `<button type="button" class="rev-join" data-item="${esc(it.id)}">加入复习</button>` : ''}
    <a class="text-link" href="${esc(href)}"${extAttr}>${isP ? (['已学完', '已掌握'].includes(st) ? '复习 →' : '打开阅读 →') : '看原文 →'}</a>
  </div>
</article>`;
    };
    body += `<section data-filter-scope aria-labelledby="h-col-list" style="margin-top:${gs.length ? '44px' : '0'}">
  <div class="sec-head">
    <h2 id="h-col-list">文选目录 <span class="sec-sub">${loose.length} 篇学习页${pending.length ? ` + ${pending.length} 篇待学` : ''}</span></h2>
    <span class="quiet-link tnum" data-filter-count>显示 ${combined.length} / ${combined.length}</span>
  </div>
  <div class="catalogue-controls">
    <div class="filter-tabs" role="group" aria-label="按学习状态筛选">
      <button type="button" class="filter-tab" data-filter-tab="all" aria-pressed="true">全部（${combined.length}）</button>
      ${looseDoing ? `<button type="button" class="filter-tab" data-filter-tab="doing" aria-pressed="false">进行中（${looseDoing}）</button>` : ''}
      ${looseDone ? `<button type="button" class="filter-tab" data-filter-tab="done" aria-pressed="false">已学完（${looseDone}）</button>` : ''}
      ${pending.length ? `<button type="button" class="filter-tab" data-filter-tab="todo" aria-pressed="false">未开始（${pending.length}）</button>` : ''}
    </div>
    <label class="search-line">
      ${ic('search', 15, 'ic')}
      <input type="search" data-filter-input placeholder="按作者或标题筛选…" aria-label="筛选${esc(c.title)}">
    </label>
  </div>
  <div class="essay-list" data-filter-group>${combined.map(rowHtml).join('')}</div>
  <p data-filter-empty hidden style="margin:24px 0 0;color:var(--ink-3);font-size:14.5px">没有匹配的文章，请更换筛选条件。</p>
</section>`;
  }

  // 长文分主线：item.threads
  for (const i of loose.filter(x => x.threads?.length)) {
    body += `<div class="kicker">${esc(i.label)} · 分主线学 <span class="n">${i.threads.length} 条</span></div><div class="sub">${esc(i.title)}</div><div class="list"><div class="row"><span class="tag blue">导读</span><span class="t"><a href="${rel(f, i.href)}">全文导读：主线怎么连起来</a></span></div>${i.threads.map(t => `<div class="row"><span class="tag">${esc(t.label)}</span><span class="t"><a href="${rel(f, t.href)}">${esc(t.title)}</a><div style="font-weight:400;font-size:14px;color:var(--ink-2)">${esc(t.conclusion)}</div></span><span class="d">${esc(t.range)} · ${t.cards} 张</span></div>`).join('')}</div>`;
  }
  write(f, page(f, c.title, c.id, body));
}

for (const g of groups) {
  const f = `${g.dir}/index.html`;
  const c = colById[g.column];
  const gall = items.filter(i => i.group === g.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const gi = gall.filter(isPage), gp = gall.filter(i => !isPage(i));
  const ext = h => /^https?:/.test(h) ? h : rel(f, h);
  const doneN = gi.filter(i => ['已学完', '已掌握'].includes(stateOf(i))).length;
  const doingN = gi.filter(i => stateOf(i) === '进行中').length;
  const gConcepts = [...new Set(gi.flatMap(i => itemConcepts(i.id).map(x => x.id)))];
  const featLecs = gi.filter(i => i.preview);
  const sylLecs = gi.filter(i => !i.preview);

  const rowsHtml = rs => `<div class="list">${rs.map(r => `<div class="row">${r.tag ? `<span class="tag ${r.tagc || ''}">${esc(r.tag)}</span>` : ''}${r.st ? statusTag(r.st) : ''}<span class="t"><a href="${esc(ext(r.href))}"${/^https?:/.test(r.href) ? ' target="_blank" rel="noopener"' : ''}>${esc(r.title)}</a>${r.note ? `<div style="font-weight:400;font-size:14px;color:var(--ink-2)">${esc(r.note)}</div>` : ''}</span>${r.d ? `<span class="d">${esc(r.d)}</span>` : ''}</div>`).join('')}</div>`;

  const body = `<div class="crumb"><a href="${rel(f, 'index.html')}">首页</a> <span>/</span> <a href="${rel(f, c.dir + '/index.html')}">${esc(c.title)}</a> <span>/</span> <span>${esc(g.title)}</span></div>
<section class="page-intro">
  <div>
    <span class="eyebrow-tag" style="display:block;margin-bottom:8px">${esc(c.title)} · 主题</span>
    <h1>${esc(g.title)}</h1>
    <p class="intro-lead">${esc(g.desc)}${g.source ? ` 课程网站：<a href="${esc(g.source)}" target="_blank" rel="noopener">${esc(g.source.replace(/^https?:\/\//, ''))}</a>` : ''}</p>
    <div style="margin-top:14px">${progBar(gall)}</div>
  </div>
  <div class="intro-stats">
    <div><b>${gi.length}</b><span>讲学习页</span></div>
    <div class="st-ok" data-k="done" data-ids="${gi.map(i => i.id).join(',')}"><b>${doneN}</b><span>已学完</span></div>
    <div class="st-doing" data-k="doing" data-ids="${gi.map(i => i.id).join(',')}"><b>${doingN}</b><span>进行中</span></div>
    ${gp.length ? `<div><b>${gp.length}</b><span>讲未开始</span></div>` : `<div><b>${gConcepts.length}</b><span>相关概念卡</span></div>`}
  </div>
</section>
${(g.intro || []).length ? `<section style="margin-bottom:36px"><div class="sec-head"><h2>课程简介 <span class="sec-sub">只写官方资料里有的</span></h2></div><div class="list">${g.intro.map(x => `<div class="row"><span class="t" style="font-weight:400">${esc(x.text)}</span>${x.cite ? `<a class="tag blue" href="${esc(x.cite)}" target="_blank" rel="noopener">出处</a>` : ''}</div>`).join('')}</div></section>` : ''}
${featLecs.length ? `<section aria-label="含交互预览图讲次"><div class="sec-head"><h2>含交互预览图讲次 <span class="sec-sub">实景预览图 · ${featLecs.length} 讲</span></h2></div><div class="featured-lectures">${featLecs.map(i => {
    const st = stateOf(i), secs = lessonSecs(i), href = rel(f, i.href);
    return `<article class="lec-visual-card card"><div class="lec-visual-img"><a href="${esc(href)}"><img src="${rel(f, i.preview)}" alt="${esc(i.label)} 预览图" loading="lazy"></a></div><div class="lec-visual-body"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span class="mono" style="font-size:13px;font-weight:700;color:var(--cinnabar)">${esc(i.label)}</span>${statusTag(st)}</div><h3><a href="${esc(href)}">${esc(i.title)}</a></h3><p>${esc(cleanNote(i.note))}</p><div class="lec-foot"><span class="tnum">开始于 ${esc(i.start)}${secs ? ` · ${secs} 节` : ''}</span><div style="display:flex;gap:10px;align-items:center"><button type="button" class="rev-join" data-item="${esc(i.id)}">加入复习</button><a class="text-link" href="${esc(href)}">${['已学完', '已掌握'].includes(st) ? '复习 →' : '继续学 →'}</a></div></div></div></article>`;
  }).join('')}</div></section>` : ''}
${sylLecs.length ? `<section aria-label="讲次大纲"><div class="sec-head"><h2>${featLecs.length ? '后续讲次大纲' : '按讲次'} <span class="sec-sub">一讲一页，按顺序学 · ${sylLecs.length} 讲</span></h2></div><div class="syllabus-list">${sylLecs.map(i => {
    const st = stateOf(i), secs = lessonSecs(i), href = rel(f, i.href);
    return `<article class="syllabus-row row"><div class="syl-no">${esc(i.label)}</div><div class="syl-body"><h3><a href="${esc(href)}">${esc(i.title)}</a></h3><p>${esc(cleanNote(i.note))}</p><div class="syl-meta">${statusTag(st)}<span class="tnum">开始于 ${esc(i.start)}${secs ? ` · ${secs} 节` : ''}</span></div></div><div class="syl-actions"><button type="button" class="rev-join" data-item="${esc(i.id)}">加入复习</button><a class="text-link" href="${esc(href)}">${['已学完', '已掌握'].includes(st) ? '复习 →' : '开始学 →'}</a></div></article>`;
  }).join('')}</div></section>` : ''}
${gp.length ? `<section style="margin-top:44px" aria-label="未开始讲次"><div class="sec-head"><h2>全部讲次 <span class="sec-sub">${gp.length} 讲未开始 · 先看官方原始资料</span></h2></div>${g.planNote ? `<p style="margin:-12px 0 16px;color:var(--ink-2);font-size:14px">${esc(g.planNote)}</p>` : ''}<div class="syllabus-list">${gp.map(i => `<article class="syllabus-row row"><div class="syl-no" style="color:var(--ink-3)">${esc(i.label)}</div><div class="syl-body"><h3><a href="${esc(ext(i.href))}"${/^https?:/.test(i.href) ? ' target="_blank" rel="noopener"' : ''}>${esc(i.title)}</a></h3>${i.note ? `<p>${esc(cleanNote(i.note))}</p>` : ''}<div class="syl-meta">${statusTag('未开始')}${i.date ? `<span class="tnum">${esc(i.date)}</span>` : ''}</div></div><div class="syl-actions"><a class="quiet-link" href="${esc(ext(i.href))}"${/^https?:/.test(i.href) ? ' target="_blank" rel="noopener"' : ''}>官方资料 →</a></div></article>`).join('')}</div></section>` : ''}
${(g.sections || []).map(sec => `<section style="margin-top:44px"><div class="sec-head"><h2>${esc(sec.kicker)}${sec.sub ? ` <span class="sec-sub">${esc(sec.sub)}</span>` : ''}</h2></div>${sec.note ? `<p style="margin:-12px 0 16px;color:var(--ink-2);font-size:14px">${esc(sec.note)}</p>` : ''}${rowsHtml(sec.rows)}</section>`).join('')}
${gi.map(i => { const cs = itemConcepts(i.id); return cs.length ? `<section class="home-band"><div class="sec-head"><h2>${esc(i.label)} 本课概念 <span class="sec-sub">${cs.length} 张关联概念卡</span></h2><a class="quiet-link" href="${rel(f, 'glossary.html')}">概念卡栏目（${concepts.length} 张）→</a></div><div class="concept-strip">${cs.map(x => `<a class="concept-link" href="${rel(f, 'concepts/' + x.id + '.html')}">${esc(x.term)}</a>`).join('')}</div></section>` : ''; }).join('')}`;
  write(f, page(f, g.title, c.id, body));
}
// ---- 概念卡 + 术语表 ----
for (const c of concepts) {
  const f = `concepts/${c.id}.html`;
  const refs = c.refs.map(r => { const it = itemById[r.item]; const th = r.thread ? it.threads?.[r.thread - 1] : null; return `<div class="row"><span class="tag">${esc(colById[it.column]?.title)}</span><span class="t"><a href="${rel(f, th ? th.href : it.href)}#${r.card}">${esc(it.label)}${th ? ' · ' + esc(th.label) : ''} · ${esc(r.note)}</a></span><span class="d">第 ${r.card} 张 →</span></div>`; }).join('');
  const lessons = [...new Set(c.refs.map(r => r.item))].length;
  const body = `<div class="crumb"><a href="../index.html">首页</a> <span>/</span> <a href="../glossary.html">概念卡</a> <span>/</span> <span>${esc(c.term)}</span></div>
<section class="defcard sheet"><div class="stage"><span class="eyebrow-tag">概念卡</span><div class="term">${esc(c.term)}</div><div class="mono" style="font-size:14.5px;color:var(--ink-2)">${esc(c.en)}</div></div>
<div class="say"><p class="key">${esc(c.def)}</p><div style="font-size:13px;color:var(--ink-3)">出现在 ${lessons} 篇学习页 · ${c.refs.length} 张卡片</div></div></section>
<div class="sec-head" style="margin-top:36px"><h2>出现在 <span class="sec-sub">${lessons} 篇 · ${c.refs.length} 处 · 点一条直接跳到那张卡片</span></h2></div><div class="list">${refs}</div>
${c.related?.length ? `<div class="sec-head" style="margin-top:36px"><h2>相关概念</h2></div><div class="concept-strip">${c.related.filter(x => conById[x]).map(x => `<a class="concept-link" href="${x}.html">${esc(conById[x].term)}</a>`).join('')}</div>` : ''}`;
  write(f, page(f, c.term, 'glossary', body));
}
{
  const f = 'glossary.html';
  const body = `<div class="crumb"><a href="index.html">首页</a> <span>/</span> <span>概念卡</span></div>
<section class="page-intro"><div><span class="eyebrow-tag" style="display:block;margin-bottom:8px">术语表</span><h1>概念卡</h1><p class="intro-lead">一个术语一张卡，跨栏目串起来。每张卡写一句定义，并列出它在哪几篇学习页出现。</p></div><div class="intro-stats"><div><b>${concepts.length}</b><span>张概念卡</span></div><div><b>${concepts.reduce((n, c) => n + c.refs.length, 0)}</b><span>处出处</span></div><div><b>${concepts.filter(c => new Set(c.refs.map(r => itemById[r.item]?.column)).size > 1).length}</b><span>张跨栏目</span></div><div><b>${pages.length}</b><span>篇学习页</span></div></div></section>
<div class="grid">${concepts.map(c => { const its = [...new Set(c.refs.map(r => r.item))].map(id => itemById[id]);
    return `<a class="card" href="concepts/${c.id}.html"><span class="go">→</span><h3>${esc(c.term)}</h3><div class="en">${esc(c.en)}</div><p>${esc(c.def.length > 68 ? c.def.slice(0, 68) + '…' : c.def)}</p><div class="meta">${its.map(i => `<span class="tag">${esc(i.label)}</span>`).join('')}</div></a>`; }).join('')}</div>`;
  write(f, page(f, '概念卡', 'glossary', body));
}
// ---- 我的收藏（数据在 favorites.json，由 assets/favorites.js 读写） ----
{
  const f = 'favorites/index.html';
  const body = `<div class="crumb"><a href="../index.html">首页</a> <span>/</span> <span>我的收藏</span></div>
<section class="page-intro"><div><span class="eyebrow-tag" style="display:block;margin-bottom:8px">个人索引与同步</span><h1>收藏的页面、简报和海报</h1><p class="intro-lead">在任意页面点 ${ic('star', 14)} 收藏。收藏存在仓库的 <code>favorites.json</code>（公开，只存标题、链接和标签）。学完、加入复习和今日复习写进 <code>data/review.json</code>。这几件事共用下面这一枚令牌。</p></div></section>
<div id="tkhint"></div>
<div class="fbar"><input id="fq" type="search" placeholder="搜索标题、标签、备注"><select id="ft"><option value="">全部类型</option></select></div>
<div class="chips" id="ftags"></div><div id="fcount" style="font-size:13px;color:var(--ink-3);margin:14px 0 8px"></div><div class="list" id="flist"><div class="empty"><b>加载中…</b></div></div>
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
  const PK = (PHI.days || []).find(d => d.picks);
  const ST_CLS = { '新发现': 'blue', '在跟进': 'amber', '已试用': 'green', '归档': '' };
  const all = PHI.days.flatMap(d => d.items.map(i => ({ ...i, date: d.date })));
  const tags = [...new Set([...(PHI.tags || []), ...all.flatMap(i => i.tags || [])])].filter(t => all.some(i => (i.tags || []).includes(t)));
  const cnt = s => all.filter(i => i.status === s).length;
  const num = v => v == null || v === '' ? '未获取' : esc(v);
  const xa = (h, t, n) => h ? `<a href="${esc(h)}" target="_blank" rel="noopener">${ic(n, 13)}${t}</a>` : '';
  const fuHtml = it => { const L = it.followups || []; return `<details class="pi-fu"><summary>${ic('history', 13)} 跟进记录 <span class="n">${L.length}</span></summary>${L.length ? `<ul>${L.map(x => `<li><span class="d">${esc(x.date || '')}</span><span class="tag">${esc(x.type || '其他')}</span><span>${esc(x.text)}${x.url ? ` <a href="${esc(x.url)}" target="_blank" rel="noopener">来源 →</a>` : ''}</span></li>`).join('')}</ul>` : '<p>还没有跟进记录。之后每周补：新版本、融资、定价、开源替代。</p>'}</details>`; };
  const card = it => `<article class="pi-card" id="${esc(it.id)}" data-tags="${esc((it.tags || []).join('|'))}" data-st="${esc(it.status)}">
<div class="pi-hd"><span class="pi-rk" title="当天排名">${it.rank != null ? '#' + esc(it.rank) : '—'}</span><div class="pi-nm"><h3><a href="${esc(it.ph)}" target="_blank" rel="noopener">${esc(it.name)}</a></h3><div class="en">${esc(it.tagline || '')}</div></div><span class="tag st ${ST_CLS[it.status] ?? ''}">${esc(it.status)}</span></div>${XR.ph(it).length ? `<p class="sa">${XR.ph(it).join(' ')}</p>` : ''}
<div class="pi-tags">${(it.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
<dl class="pi-f"><dt>是什么</dt><dd>${esc(it.what)}</dd><dt>解决</dt><dd>${esc(it.problem)}</dd><dt>亮点</dt><dd>${esc(it.highlight)}</dd><dt class="ins">${ic('lightbulb', 13)}启发</dt><dd class="ins">${esc(it.inspo)}</dd></dl>
<div class="pi-ft"><span title="PH 综合分（抓取时）">${ic('trending-up', 13)}分数 ${num(it.score)}</span><span>${ic('message-square', 13)}评论 ${num(it.comments)}</span>${xa(it.ph, 'PH', 'rocket')}${xa(it.site, '官网', 'external-link')}${xa(it.repo, '仓库', 'git-fork')}</div>
${fuHtml(it)}</article>`;
  const dayHtml = d => `<section class="pi-day" data-day="${esc(d.date)}"><div class="kicker">${ic('calendar', 16)} 榜单 ${esc(d.date.slice(5).replace('-', '/'))} <span class="n">${d.items.length}</span></div><div class="sub"><a href="${esc(d.source)}" target="_blank" rel="noopener">Product Hunt 日榜</a>（太平洋时间）· ${bjStamp(d.fetched) ? `北京 ${bjStamp(d.fetched)} 抓取` : `抓取于 ${esc(d.fetched || '未记录')}`}${d.note ? ` <details class="pi-note"><summary>说明</summary>${esc(d.note)}</details>` : ''}</div>
<div class="pi-grid">${(d.picks ? d.items : [...d.items].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))).map(card).join('')}</div></section>`;
  const [d0, ...older] = PHI.days;
  const days = (d0 ? dayHtml(d0) : '') + (older.length ? `<details class="panel pi-old"><summary>${ic('history', 15)} 更早的榜单 <span class="s">${older.length} 天 · ${older.reduce((n, d) => n + d.items.length, 0)} 个产品</span></summary><div class="pb">${older.map(dayHtml).join('')}</div></details>` : '');
  const chip = (k, v, label, n) => `<button type="button" class="chip${v ? '' : ' on'}" data-k="${k}" data-v="${esc(v)}">${esc(label)}${n != null ? `<em>${n}</em>` : ''}</button>`;
  const picksGrid = PK ? `<section aria-labelledby="h-picks" style="margin-bottom:32px"><div class="sec-head"><h2 id="h-picks">榜单 ${esc(PK.date.slice(5).replace('-', '/'))} · 先看 3 款${PK === PHI.days[0] ? '' : ' <span class="sec-sub">最近一次推荐</span>'}</h2><a class="quiet-link" href="${rel(f, latestDigestHref)}">回到每日汇总 →</a></div><div class="inspo-picks-grid">${PK.picks.map(x => { const it = PK.items.find(i => i.id === x.id); return `<article class="inspo-card"><span class="eyebrow-tag">先看</span><h3><a href="#${esc(x.id)}">${esc(it.name)}</a></h3><p>${esc(x.why)}</p><div class="lim"><span class="tag amber">限制</span> ${esc(x.limit)}</div></article>`; }).join('')}</div></section>` : '';
  const body = `<div class="crumb"><a href="../index.html">首页</a> <span>/</span> <span>产品灵感</span></div>
<section class="page-intro"><div><span class="eyebrow-tag" style="display:block;margin-bottom:8px">PH 灵感箱 · ${PHI.days.length} 天${d0 ? ` · 最新榜单 ${esc(d0.date)}` : ''}</span><h1>产品灵感</h1><p class="intro-lead">每天从 Product Hunt 日榜挑 5–8 个新产品，写清是什么、解决什么、能借鉴什么。</p></div><div class="intro-stats"><div><b>${all.length}</b><span>全库产品</span></div>${d0 ? `<div><b>${d0.items.length}</b><span>${esc(d0.date.slice(5).replace('-', '/'))} 当榜</span></div>` : ''}${cnt('在跟进') ? `<div class="st-cinnabar"><b>${cnt('在跟进')}</b><span>在跟进</span></div>` : ''}${cnt('已试用') ? `<div class="st-ok"><b>${cnt('已试用')}</b><span>已试用</span></div>` : ''}</div></section>
${picksGrid}
${about(`<p>从 Product Hunt 日榜里挑 5–8 个和 coding agent 工作台、AI 工具、开发者工具、效率、创作、教育相关的新产品，写清楚是什么、解决什么、能抄什么。</p><p>「榜单 11/21」是 Product Hunt 的榜单日，按太平洋时间算；北京时间早上能看到的最新一份，通常是两天前的榜。抓取时间已换成北京时间。数据在 <code>data/ph-inspo.json</code>。</p>`)}
${all.length ? `<div class="pi-bar"><span class="lb">${ic('tag', 13)}标签</span>${chip('tag', '', '全部')}${tags.map(t => chip('tag', t, t, all.filter(i => (i.tags || []).includes(t)).length)).join('')}</div>
<div class="pi-bar"><span class="lb">${ic('funnel', 13)}状态</span>${chip('st', '', '全部')}${(PHI.statuses || []).filter(s => cnt(s)).map(s => chip('st', s, s, cnt(s))).join('')}<span class="pi-cnt" id="pi-cnt"></span></div>
${days}<div class="empty" id="pi-none" hidden><b>没有符合条件的产品</b>换个标签或状态试试</div>` : emptyBox('还没有产品灵感', '每天的 PH 榜单挑完后会出现在这里（data/ph-inspo.json）。')}`;
  const script = `(function(){var F={tag:'',st:''};var bs=document.querySelectorAll('.pi-bar .chip');function run(){var n=0;if(F.tag||F.st)document.querySelectorAll('.pi-old').forEach(function(d){d.open=true});document.querySelectorAll('.pi-day').forEach(function(d){var v=0;d.querySelectorAll('.pi-card').forEach(function(c){var ok=(!F.tag||c.dataset.tags.split('|').indexOf(F.tag)>=0)&&(!F.st||c.dataset.st===F.st);c.hidden=!ok;if(ok)v++});d.hidden=!v;n+=v});var e=document.getElementById('pi-none');if(e)e.hidden=!!n;var t=document.getElementById('pi-cnt');if(t)t.textContent=(F.tag||F.st)?'筛出 '+n+' 个':'';bs.forEach(function(b){b.classList.toggle('on',F[b.dataset.k]===b.dataset.v)})}bs.forEach(function(b){b.onclick=function(){F[b.dataset.k]=F[b.dataset.k]===b.dataset.v?'':b.dataset.v;run()}});run()})();`;
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
  const stage = `<div class="intro-stats">${DSH.kpis.map(k => `<div><b>${esc(k.value)}</b><span>${esc(k.label)}</span></div>`).join('')}</div>`;
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
  const body = `<div class="crumb"><a href="../index.html">首页</a> <span>/</span> <span>DSH 插件</span></div>
<section class="page-intro"><div><span class="eyebrow-tag" style="display:block;margin-bottom:8px">插件市场盘点 · ${esc(DSH.asOf)} ${esc(DSH.tz)}</span><h1>${esc(DSH.title)}</h1><p class="dsh-lead">${lead}</p><ul class="dsh-facts">${DSH.facts.map(x => `<li>${inline(x)}</li>`).join('')}</ul></div>${stage}</section>
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
      if (mode === 'q') { const m = s.match(/^\d+\.\s+(.*)$/); if (m) { quick.push(wkInline(m[1])); continue; } if (!s) continue;
        if (/^\s+\S/.test(ln) && quick.length) { const lb = s.match(/^(解决什么|抄哪一处|还要确认)[：:]\s*(.*)$/); quick[quick.length - 1] += lb ? `<span class="ql"><b>${lb[1]}</b>${wkInline(lb[2])}</span>` : '<br>' + wkInline(s); continue; }
        mode = ''; }
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
    const b = `<div class="crumb"><a href="../../index.html">首页</a> <span>/</span> <a href="../index.html">雷达</a> <span>/</span> <span>周报 ${esc(w.d)}</span></div>
<section class="sheet"><span class="kk">${/^雷达周报/.test(w.title) ? `${esc(w.d)} 发布 · 日期均为北京时间` : `雷达周报 · ${esc(w.d)}（北京时间）`}</span><h1>${wkInline(w.title)}</h1>${w.quick.length ? `<div class="kk" style="margin:8px 0 4px">结论先说</div><ol class="quick">${w.quick.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}</section>
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
  // V4 雷达行卷条目：minmax(0, 1fr) + min-width:0 + 长路径/代码可读折行，390px/320px 零裁切
  const entry = e => `<article class="radar-entry" id="r${e.id}" data-th="${esc(e.theme)}" data-new="${e.added === RADAR.updated ? 1 : 0}" data-q="${esc([e.name, e.repo, e.what, e.borrow].join(' ').toLowerCase())}">
  <div class="radar-id">
    <span class="radar-no">#${e.id}</span>
    ${e.verified ? `<span class="radar-stars">★ ${grp(e.stars)}</span>` : '<span class="radar-stars">未核实</span>'}
    ${e.added === RADAR.updated ? `<span class="st-mark cinnabar">新增 ${md(e.added)}</span>` : ''}
  </div>
  <div class="radar-body">
    <h3><a href="${esc(e.url)}"${ext}>${esc(e.name)}</a></h3>
    <div class="radar-meta mono">
      ${e.repo ? `<span><a href="https://github.com/${esc(e.repo)}"${ext}>${esc(e.repo)}</a></span>` : '<span>无仓库</span>'}
      ${e.verified ? `<span>${esc(e.license)}</span><span title="最近推送（北京时间）">推送 ${esc(e.pushed)}</span>${e.archived ? '<span class="tag amber">已归档</span>' : ''}` : ''}
    </div>
    <p class="radar-summary">${esc(e.what)}</p>
    <p class="radar-borrow"><b>可借鉴架构：</b>${esc(e.borrow)}</p>
    ${e.note ? `<p class="rd-note">${esc(e.note)}</p>` : ''}
    ${XR.radar(e).length ? `<p class="sa">${XR.radar(e).join(' ')}</p>` : ''}
    <details class="rd-src"><summary>来源 ${e.sources.length}</summary><ul>${e.sources.map(s => `<li><a href="${esc(s.url)}"${ext}>${esc(s.author)}</a>${s.date ? ` <span>转发于 ${esc(s.date)}</span>` : ''}</li>`).join('')}</ul></details>
  </div>
</article>`;
  const newest = (a, b) => (b.added || '').localeCompare(a.added || '') || b.id - a.id;
  const secs = TH.filter(t => t.n).map(t => {
    const L = E.filter(e => e.theme === t.key).sort(newest), top = L.slice(0, 3), rest = L.slice(3);
    return `<section class="rd-sec" data-sec="${esc(t.key)}"><div class="kicker" id="t-${esc(t.key)}">${esc(t.title)} <span class="n">${t.n}</span></div>
<div class="radar-ledger">${top.map(entry).join('')}</div>${rest.length ? `<details class="rd-more"><summary>展开其余 ${rest.length} 条</summary><div class="radar-ledger">${rest.map(entry).join('')}</div></details>` : ''}</section>`;
  }).join('');
  const chip = (v, label, n) => `<button type="button" class="chip${v ? '' : ' on'}" data-th="${esc(v)}">${esc(label)}<em>${n}</em></button>`;
  const sc = RADAR.source.scanned || {};
  const batches = [...RADAR.batches].reverse().map(b => `<div class="row"><span class="tag${b.date === RADAR.updated ? ' green' : ''}">${esc(b.date)}</span><span class="t">${esc(b.label)}</span><span class="d">#${b.ids[0]}${b.ids[1] !== b.ids[0] ? '–#' + b.ids[1] : ''} · ${b.n} 条</span></div>`).join('');
  const spotlight = rdPick ? `<section class="radar-spotlight" aria-labelledby="h-radar-pick">
  <div>
    <span class="monolith-label">本周首选 · ${esc(rdPick.d)} 周报</span>
    <h2 id="h-radar-pick">${esc(rdPick.name)}</h2>
    ${rdPick.sub ? `<p>${esc(rdPick.sub)}</p>` : ''}
  </div>
  <div style="display:flex;flex-direction:column;align-items:flex-start;gap:10px">
    <span class="mono" style="font-size:12.5px;color:var(--obsidian-ink-3)">${md(RADAR.updated)} · 最近一次 · 新增 ${latest.length} 条</span>
    <a class="btn cinnabar sm" href="${rel(f, rdPick.href)}">阅读 ${esc(rdPick.d)} 周报全文 →</a>
  </div>
</section>` : '';
  const body = `<div class="crumb"><a href="../index.html">首页</a> <span>/</span> <span>${esc(RADAR.title)}</span></div>
<section class="page-intro"><div><span class="eyebrow-tag" style="display:block;margin-bottom:8px">${esc(RADAR.title)} · 更新 ${esc(RADAR.updated)} ${esc(RADAR.tz)}</span><h1>${esc(RADAR.subtitle)}</h1><p class="intro-lead">企业级 coding agent 工作台的开源参考，按方向分组，每个方向先看最新 3 条，全部 ${E.length} 条可按方向与关键词实时检索。</p></div>
<div class="intro-stats"><div><b>${E.length}</b><span>全库条目</span></div><div class="st-ok"><b>${E.filter(e => e.verified).length}</b><span>仓库已核实</span></div><div><b>${TH.filter(t => t.n).length}</b><span>个方向</span></div><div class="st-cinnabar"><b>${latest.length}</b><span>${md(RADAR.updated)} 新增</span></div></div></section>
${spotlight}
${about(`<p>雷达 bot 从 ${esc(RADAR.source.account)} 的 X 时间线（${grp(sc.own_timeline_posts || 0)} 条，${esc(sc.date_range || '')}）、GitHub 搜索、Hacker News 和工程博客里挑出的开源项目与做法，按工具链方向分组，每条写清是什么、可以借鉴什么。${(() => { const gn = String(RADAR.source.githubNote || ''), d = (gn.match(/(\d{4}-\d\d-\d\d) ?全量刷新/) || gn.match(/抓取于 (\d{4}-\d\d-\d\d)/) || [])[1]; return d ? `星数、License、最近推送来自 GitHub API（抓取于 ${esc(d)}，日期为北京时间）；没写星数的是无仓库或仓库未核实。` : ''; })()}帖子里的效果数字是作者自述，没有复现。日期都是北京时间。</p>`)}
${wkBlock}
<details class="panel rd-log"><summary>${ic('history', 15)} 补录记录 <span class="s">${RADAR.batches.length} 次，首版 ${esc(RADAR.generated)}</span></summary><div class="pb"><div class="list">${batches}</div></div></details>
<div class="pi-bar rd-bar"><span class="lb">${ic('funnel', 13)}方向</span>${chip('', '全部', E.length)}${TH.filter(t => t.n).map(t => chip(t.key, t.title, t.n)).join('')}<button type="button" class="chip" data-new="1">只看 ${md(RADAR.updated)} 新增<em>${latest.length}</em></button></div>
<div class="rd-q"><label class="search-line">${ic('search', 15, 'ic')}<input id="rd-q" type="search" placeholder="搜项目名、仓库或关键词…" aria-label="搜索雷达条目"></label><span id="rd-cnt"></span></div>
${secs}<div class="empty" id="rd-none" hidden><b>没有符合条件的条目</b>换个方向或关键词试试</div>`;
  const script = `(function(){var th='',nw=0,q='';var bs=document.querySelectorAll('.rd-bar .chip');var inp=document.getElementById('rd-q');function run(){var n=0;document.querySelectorAll('.rd-more').forEach(function(d){d.open=!!(th||nw||q)});document.querySelectorAll('.rd-sec').forEach(function(s){var v=0;s.querySelectorAll('.radar-entry').forEach(function(c){var ok=(!th||c.dataset.th===th)&&(!nw||c.dataset.new==='1')&&(!q||c.dataset.q.indexOf(q)>=0);c.hidden=!ok;if(ok)v++});s.hidden=!v;n+=v});document.getElementById('rd-none').hidden=!!n;document.getElementById('rd-cnt').textContent=(th||nw||q)?'筛出 '+n+' 条':'';bs.forEach(function(b){b.classList.toggle('on',b.dataset.new?!!nw:(b.dataset.th||'')===th)})}bs.forEach(function(b){b.onclick=function(){if(b.dataset.new)nw=nw?0:1;else{var v=b.dataset.th||'';th=th===v?'':v}run()}});inp.oninput=function(){q=inp.value.trim().toLowerCase();run()};run()})();`;
  write(f, page(f, RADAR.title || '雷达', 'radar', body, script));
}
// ---- review.md（人读版） ----
{
  let md = `# 间隔复习队列\n\n> 由 build.mjs 从 data/review.json 生成，不要手改本文件。\n> 跨设备以本文件为准。\`learned\` 是「学完了」的北京日期，点学完不会自动排复习。只有 \`joined\`（用户点「加入复习」的北京日期）存在时才有 \`reviews\`。间隔 ${review.intervals.join('、')} 天，从 \`joined\` 当天算起，不从学完日算。取消复习会去掉 \`joined\` 和 \`reviews\`，留下 \`joinAt\`，\`learned\` 保留。\n> 浏览器：\`done:<路径>\` 只记学完；\`rev-join:<条目 id>\` 是待上传的加入或取消（\`{joined, at}\`）；\`rev-op:<条目 id>\` / \`rev-done:<条目 id>\` 只作用在已经加入的条目上。没加入的旧操作不会把复习写回来。有令牌时这些操作写入 \`data/review.json\`。勾完的那一行当天还留在「今日」里，算进「已看」，第二天消失。地址加 \`?today=YYYY-MM-DD\` 可以自查。\n> 内容 bot 加新篇时写 \`{item, start, reviews: []}\`，不要写 \`joined\`，不要预填 \`reviews\`。构建会把没有 \`joined\` 的 \`reviews\` 清掉。\n\n| 内容 | 学完 | 加入复习 | 开始 | ${review.intervals.map(n => `第 ${n} 天`).join(' | ')} |\n|---|---|---|---|${review.intervals.map(() => '---').join('|')}|\n`;
  for (const q of review.queue) { const it = itemById[q.item]; const cells = review.intervals.map(n => { const r = (q.reviews || []).find(x => x.day === n); return r ? `${r.date}${r.done ? ' ✅' : ''}` : '—'; }); md += `| ${it ? `${it.label} ${it.title}` : q.item} | ${q.learned || '—'} | ${q.joined || '—'} | ${q.start} | ${cells.join(' | ')} |\n`; }
  write('review.md', md);
}
