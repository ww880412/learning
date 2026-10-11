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

// ---- 复习队列：保留已有记录（含 done），为新条目补排期 ----
const reviewPath = path.join(ROOT, 'data', 'review.json');
let review = fs.existsSync(reviewPath) ? JSON.parse(fs.readFileSync(reviewPath, 'utf8')) : { intervals: INTERVALS, queue: [] };
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
for (const it of items) {
  if (!it.start || review.queue.some(q => q.item === it.id)) continue;
  review.queue.push({ item: it.id, start: it.start, reviews: INTERVALS.map(n => ({ day: n, date: addDays(it.start, n), done: false })) });
}
fs.writeFileSync(reviewPath, JSON.stringify(review, null, 2) + '\n');

// ---- 工具 ----
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rel = (fromFile, to) => { const r = path.relative(path.dirname(fromFile), to); return r || '.'; };
const itemById = Object.fromEntries(items.map(i => [i.id, i]));
const colById = Object.fromEntries(columns.map(c => [c.id, c]));
const conById = Object.fromEntries(concepts.map(c => [c.id, c]));
const rootVars = (() => { try { const css = fs.readFileSync(TPL, 'utf8'); return css.match(/:root\{[\s\S]*?\}/)[0]; } catch { return ':root{--paper:#F2F4F7;--sheet:#fff;--ink:#16202C;--ink2:#4A5868;--hair:#D9DFE7;--blue:#2550D9;--blue-soft:#E3EAFD;--amber:#C77A00;--amber-soft:#FBEFD9;--green:#16875A;--green-soft:#DDF3E9;--red:#C8372D;--red-soft:#FBE3E1;--r-lg:20px;--r-sm:10px;--font:system-ui,sans-serif;--mono:monospace}'; } })();
const CSS = rootVars + `
*{box-sizing:border-box}html,body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 var(--font);-webkit-font-smoothing:antialiased}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.top{position:sticky;top:0;z-index:5;background:rgba(242,244,247,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--hair)}
.top .in{max-width:1120px;margin:0 auto;padding:12px 24px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.top .brand{font-weight:800;color:var(--ink)}.top nav{display:flex;gap:14px;flex-wrap:wrap;font-size:14px}.top nav a{color:var(--ink2)}.top nav a.on{color:var(--blue);font-weight:700}
main{max-width:1120px;margin:0 auto;padding:28px 24px 64px}
.crumb{font-size:13px;color:var(--ink2);margin-bottom:6px}
.hero h1{font-size:34px;line-height:1.25;margin:0 0 8px}.hero p{margin:0;color:var(--ink2)}
.kicker{font-size:14px;color:var(--blue);font-weight:700;margin:36px 0 12px;display:flex;align-items:center;gap:8px}
.kicker .n{background:var(--blue-soft);border-radius:99px;padding:0 9px;font-size:12px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.grid.wide{grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.card{background:var(--sheet);border-radius:var(--r-lg);padding:20px 22px;box-shadow:0 1px 0 var(--hair),0 18px 40px -28px rgba(22,32,44,.3);display:flex;flex-direction:column;gap:8px;color:var(--ink);min-width:0}
a.card:hover{text-decoration:none;outline:2px solid var(--blue-soft)}
.card h3{margin:0;font-size:19px;line-height:1.35}.card p{margin:0;color:var(--ink2);font-size:14px}
.card .ic{font-size:26px;line-height:1}.card .meta{font-size:13px;color:var(--ink2);margin-top:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.card img{width:100%;aspect-ratio:16/9;object-fit:cover;object-position:top;border-radius:var(--r-sm);background:var(--paper);border:1px solid var(--hair)}
.tag{display:inline-block;font-size:12px;font-weight:700;padding:1px 8px;border-radius:6px;background:var(--paper);color:var(--ink2)}
.tag.blue{background:var(--blue-soft);color:var(--blue)}.tag.green{background:var(--green-soft);color:var(--green)}.tag.amber{background:var(--amber-soft);color:var(--amber)}.tag.red{background:var(--red-soft);color:var(--red)}
.empty{background:var(--sheet);border:2px dashed var(--hair);border-radius:var(--r-lg);padding:28px;text-align:center;color:var(--ink2)}
.empty b{display:block;color:var(--ink);font-size:18px;margin-bottom:4px}
.list{background:var(--sheet);border-radius:var(--r-lg);overflow:hidden;box-shadow:0 1px 0 var(--hair)}
.list .row{display:flex;gap:14px;align-items:center;padding:14px 20px;border-top:1px solid var(--hair);flex-wrap:wrap}.list .row:first-child{border-top:0}
.list .row .t{flex:1;min-width:180px}.list .row .d{font:600 13px var(--mono);color:var(--ink2)}
.list .row.due{background:var(--amber-soft)}.list .row.over{background:var(--red-soft)}
.def{font-size:18px;line-height:1.75;margin:0}.en{font:600 14px var(--mono);color:var(--ink2)}
.foot{margin-top:48px;font-size:13px;color:var(--ink2);border-top:1px solid var(--hair);padding-top:14px}
@media(max-width:600px){main{padding:20px 16px 48px}.hero h1{font-size:27px}.top .in{padding:10px 16px;gap:8px 14px}.def{font-size:16px}.grid{grid-template-columns:1fr 1fr;gap:12px}.grid.wide{grid-template-columns:1fr}.grid .card{padding:16px}.card h3{font-size:17px}}
`;
function page(file, title, active, body, script = '') {
  const r = p => rel(file, p);
  const nav = [['index.html', '首页', 'home'], ...columns.map(c => [`${c.dir}/index.html`, c.title, c.id]), ['glossary.html', '概念卡', 'glossary']]
    .map(([h, t, id]) => `<a href="${r(h)}"${id === active ? ' class="on"' : ''}>${esc(t)}</a>`).join('');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 王玮的学习库</title><style>${CSS}</style></head><body>
<header class="top"><div class="in"><a class="brand" href="${r('index.html')}">📚 王玮的学习库</a><nav>${nav}</nav></div></header>
<main>${body}<div class="foot">由 build.mjs 从 data/ 生成 · 学习页模板：xuexi-template</div></main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), s); console.log('wrote', f); };
const statusTag = s => `<span class="tag ${s === '进行中' ? 'blue' : s === '已学' ? 'green' : 'amber'}">${esc(s)}</span>`;
const itemCard = (file, it) => `<a class="card" href="${rel(file, it.href)}">${it.preview ? `<img src="${rel(file, it.preview)}" alt="" loading="lazy">` : ''}
<div class="meta" style="margin-top:0"><span class="tag">${esc(it.label)}</span>${statusTag(it.status)}</div><h3>${esc(it.title)}</h3><p>${esc(it.note)}</p>
<div class="meta">开始于 ${esc(it.start)}${it.cards ? ` · ${it.cards} 张卡片` : ''}</div></a>`;
const emptyBox = (t, s) => `<div class="empty"><b>${t}</b>${s}</div>`;
const itemConcepts = id => concepts.filter(c => c.refs.some(r => r.item === id));

// ---- 首页 ----
{
  const f = 'index.html';
  const colCards = columns.map(c => { const n = items.filter(i => i.column === c.id).length;
    return `<a class="card" href="${c.dir}/index.html"><div class="ic">${c.icon}</div><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p><div class="meta">${n ? `<span class="tag blue">${n} 篇</span>` : '<span class="tag">还没有内容</span>'}</div></a>`; }).join('');
  const doing = items.filter(i => i.status === '进行中');
  const recent = [...items].sort((a, b) => (b.start || '').localeCompare(a.start || '')).slice(0, 6);
  const inboxHtml = inbox.length ? `<div class="list">${inbox.map(x => `<div class="row"><span class="tag">${esc(colById[x.column]?.title || '未分类')}</span><span class="t"><a href="${esc(x.url)}">${esc(x.title || x.url)}</a></span><span class="d">${esc(x.added || '')}</span></div>`).join('')}</div>`
    : emptyBox('收件箱是空的', '看到想学的链接，丢到群里给学习搭子，它会先放在这里（data/inbox.json）。');
  const revData = JSON.stringify({ queue: review.queue, items: Object.fromEntries(items.map(i => [i.id, { title: i.title, label: i.label, href: i.href }])) }).replace(/</g, '\\u003c');
  const body = `<section class="hero"><h1>王玮的学习库</h1><p>按来源分栏目，每篇都是可翻页、可动手、带小测的学习页。</p></section>
<div class="kicker">栏目</div><div class="grid">${colCards}</div>
<div class="kicker">今天该复习 <span class="n" id="due-n">…</span></div><div id="review"></div>
<div class="kicker">正在学</div>${doing.length ? `<div class="grid wide">${doing.map(i => itemCard(f, i)).join('')}</div>` : emptyBox('现在没有进行中的内容', '')}
<div class="kicker">最近学过</div><div class="list">${recent.map(i => `<div class="row"><span class="tag">${esc(colById[i.column]?.title)}</span><span class="t"><a href="${i.href}">${esc(i.label)} · ${esc(i.title)}</a></span>${statusTag(i.status)}<span class="d">${esc(i.start)}</span></div>`).join('')}</div>
<div class="kicker">待学收件箱 <span class="n">${inbox.length}</span></div>${inboxHtml}
<div class="kicker">概念卡</div><p style="margin:0">${concepts.map(c => `<a class="tag blue" style="margin:0 6px 6px 0" href="concepts/${c.id}.html">${esc(c.term)}</a>`).join('')} <a href="glossary.html">全部 →</a></p>`;
  const script = `const R=${revData};const p=n=>String(n).padStart(2,'0');const d=new Date();const today=new URLSearchParams(location.search).get('today')||(d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())); /* 自查用：?today=2026-10-14 */
const all=[];for(const q of R.queue)for(const r of q.reviews)if(!r.done)all.push({...r,item:q.item});all.sort((a,b)=>a.date.localeCompare(b.date));
const due=all.filter(r=>r.date<=today),soon=all.filter(r=>r.date>today).slice(0,4);const el=document.getElementById('review');
document.getElementById('due-n').textContent=due.length+' 项到期';
const row=(r,cls,lab)=>{const it=R.items[r.item]||{};return '<div class="row '+cls+'"><span class="tag '+(cls==='over'?'red':cls==='due'?'amber':'')+'">'+lab+'</span><span class="t"><a href="'+it.href+'">'+it.label+' · '+it.title+'</a></span><span class="d">第 '+r.day+' 天 · '+r.date+'</span></div>'};
let h=due.map(r=>row(r,r.date<today?'over':'due',r.date<today?'已逾期':'今天')).join('');
if(!due.length)h='<div class="row"><span class="t">今天（'+today+'）没有到期的复习 🎉</span></div>';
if(soon.length)h+=soon.map(r=>row(r,'','即将')).join('');el.innerHTML='<div class="list">'+h+'</div>';`;
  write(f, page(f, '首页', 'home', body, script));
}
// ---- 栏目页 + 主题页 ----
for (const c of columns) {
  const f = `${c.dir}/index.html`; const its = items.filter(i => i.column === c.id); const gs = groups.filter(g => g.column === c.id);
  let body = `<div class="crumb"><a href="${rel(f, 'index.html')}">首页</a> / ${esc(c.title)}</div><section class="hero"><h1>${c.icon} ${esc(c.title)}</h1><p>${esc(c.desc)}</p></section>`;
  if (!its.length) body += `<div style="margin-top:28px">${emptyBox('还没有内容', `以后学到${esc(c.title)}的内容，会出现在这里。`)}</div>`;
  for (const g of gs) { const gi = its.filter(i => i.group === g.id);
    body += `<div class="kicker">主题</div><div class="grid wide"><a class="card" href="${rel(f, g.dir + '/index.html')}"><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p><div class="meta"><span class="tag blue">${gi.length} 讲</span></div></a></div>`; }
  const loose = its.filter(i => !i.group);
  if (loose.length) body += `<div class="kicker">文章 <span class="n">${loose.length}</span></div><div class="grid wide">${loose.map(i => itemCard(f, i)).join('')}</div>`;
  write(f, page(f, c.title, c.id, body));
}
for (const g of groups) {
  const f = `${g.dir}/index.html`; const c = colById[g.column]; const gi = items.filter(i => i.group === g.id).sort((a, b) => a.order - b.order);
  const body = `<div class="crumb"><a href="${rel(f, 'index.html')}">首页</a> / <a href="${rel(f, c.dir + '/index.html')}">${esc(c.title)}</a> / ${esc(g.title)}</div>
<section class="hero"><h1>${esc(g.title)}</h1><p>${esc(g.desc)} 课程网站：<a href="${esc(g.source)}">${esc(g.source)}</a></p></section>
<div class="kicker">按讲次 <span class="n">${gi.length}</span></div><div class="grid wide">${gi.map(i => itemCard(f, i)).join('')}</div>
${gi.map(i => { const cs = itemConcepts(i.id); return cs.length ? `<div class="kicker">${esc(i.label)} 本课概念</div><p style="margin:0">${cs.map(x => `<a class="tag blue" style="margin:0 6px 6px 0" href="${rel(f, 'concepts/' + x.id + '.html')}">${esc(x.term)}</a>`).join('')}</p>` : ''; }).join('')}`;
  write(f, page(f, g.title, c.id, body));
}
// ---- 概念卡 + 术语表 ----
for (const c of concepts) {
  const f = `concepts/${c.id}.html`;
  const refs = c.refs.map(r => { const it = itemById[r.item]; return `<div class="row"><span class="tag">${esc(colById[it.column]?.title)}</span><span class="t"><a href="${rel(f, it.href)}#${r.card}">${esc(it.label)} · 第 ${r.card} 张：${esc(r.note)}</a></span></div>`; }).join('');
  const lessons = [...new Set(c.refs.map(r => r.item))].length;
  const body = `<div class="crumb"><a href="../index.html">首页</a> / <a href="../glossary.html">概念卡</a> / ${esc(c.term)}</div>
<section class="hero"><h1>${esc(c.term)}</h1><div class="en">${esc(c.en)}</div></section>
<div class="kicker">一句话说清</div><div class="card"><p class="def">${esc(c.def)}</p></div>
<div class="kicker">出现在 <span class="n">${lessons} 篇 · ${c.refs.length} 处</span></div><div class="list">${refs}</div>
${c.related?.length ? `<div class="kicker">相关概念</div><p style="margin:0">${c.related.filter(x => conById[x]).map(x => `<a class="tag blue" style="margin:0 6px 6px 0" href="${x}.html">${esc(conById[x].term)}</a>`).join('')}</p>` : ''}`;
  write(f, page(f, c.term, 'glossary', body));
}
{
  const f = 'glossary.html';
  const body = `<section class="hero"><h1>概念卡</h1><p>一个术语一张卡，卡上列出它在哪几篇学习页里出现。点卡片看定义和出处。</p></section>
<div class="kicker">全部 <span class="n">${concepts.length}</span></div><div class="grid">${concepts.map(c => { const its = [...new Set(c.refs.map(r => r.item))].map(id => itemById[id]);
    return `<a class="card" href="concepts/${c.id}.html"><h3>${esc(c.term)}</h3><div class="en">${esc(c.en)}</div><p>${esc(c.def.length > 60 ? c.def.slice(0, 60) + '…' : c.def)}</p><div class="meta">${its.map(i => `<span class="tag">${esc(i.label)}</span>`).join('')}</div></a>`; }).join('')}</div>`;
  write(f, page(f, '概念卡', 'glossary', body));
}
// ---- review.md（人读版） ----
{
  let md = `# 间隔复习队列\n\n> 由 build.mjs 从 data/review.json 生成，不要手改本文件。复习完成后把 data/review.json 里对应条目的 \`done\` 改成 \`true\`，再运行 \`node build.mjs\`。\n> 规则：开始学习后第 ${review.intervals.join('、')} 天各复习一次。首页按浏览器当天日期高亮到期项。\n\n| 内容 | 开始 | ${review.intervals.map(n => `第 ${n} 天`).join(' | ')} |\n|---|---|${review.intervals.map(() => '---').join('|')}|\n`;
  for (const q of review.queue) { const it = itemById[q.item]; md += `| ${it ? `${it.label} ${it.title}` : q.item} | ${q.start} | ${q.reviews.map(r => `${r.date}${r.done ? ' ✅' : ''}`).join(' | ')} |\n`; }
  write('review.md', md);
}
