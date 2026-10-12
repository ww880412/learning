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
const rootVars = (() => { try { const css = fs.readFileSync(TPL, 'utf8'); return css.match(/:root\{[\s\S]*?\}/)[0]; } catch { return ':root{--paper:#F2F4F7;--sheet:#fff;--ink:#16202C;--ink2:#4A5868;--hair:#D9DFE7;--blue:#2550D9;--blue-soft:#E3EAFD;--amber:#C77A00;--amber-soft:#FBEFD9;--green:#16875A;--green-soft:#DDF3E9;--red:#C8372D;--red-soft:#FBE3E1;--r-lg:20px;--r-sm:10px;--font:system-ui,sans-serif;--mono:monospace}'; } })();
const THEME = fs.readFileSync(path.join(ROOT,'assets/vp-theme.css'),'utf8'), HEADJS = fs.readFileSync(path.join(ROOT,'assets/vp-head.js'),'utf8');
const CSS = rootVars + `
*{box-sizing:border-box}html,body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 var(--font);-webkit-font-smoothing:antialiased}
a{color:var(--blue);text-decoration:none}
code{font:600 .9em var(--mono);background:var(--paper);border-radius:6px;padding:1px 6px}
.top{position:sticky;top:0;z-index:5;background:rgba(242,244,247,.88);backdrop-filter:saturate(1.4) blur(10px)}
.top .in{max-width:1160px;margin:0 auto;padding:12px 28px;display:flex;gap:20px;align-items:center}
.top .brand{font-weight:800;font-size:15px;color:var(--ink);display:flex;align-items:center;gap:10px;white-space:nowrap}
.top .brand i{width:28px;height:28px;border-radius:9px;background:var(--blue);display:grid;place-items:center;color:#fff;font-style:normal;font-size:14px}
.top nav{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-left:auto}.top nav::-webkit-scrollbar{display:none}
.top nav a{color:var(--ink2);font-size:14px;font-weight:600;padding:6px 14px;border-radius:99px;white-space:nowrap}
.top nav a:hover{background:var(--sheet);color:var(--ink)}.top nav a.on{background:var(--blue);color:#fff}
main{max-width:1160px;margin:0 auto;padding:18px 28px 72px}
.crumb{font-size:13px;color:var(--ink2);margin:6px 0 12px}.crumb a{color:var(--ink2);font-weight:600}.crumb a:hover{color:var(--blue)}
.sheet{background:var(--sheet);border-radius:var(--r-lg);box-shadow:0 1px 0 var(--hair),0 18px 40px -24px rgba(22,32,44,.25)}
.hero{display:grid;grid-template-columns:1.25fr 1fr;gap:14px;padding:14px;margin-top:6px}
.hero .say{padding:22px 18px 22px 22px;display:flex;flex-direction:column;justify-content:center;gap:10px}
.hero .kk{font-size:14px;color:var(--blue);font-weight:700}
.hero h1{font-size:36px;line-height:1.25;margin:0;letter-spacing:.01em}.hero p{margin:0;color:var(--ink2);font-size:17px}
.hero .stage{background:var(--paper);border-radius:14px;padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:center}
.stat{background:var(--sheet);border-radius:12px;padding:14px 16px;border-left:4px solid var(--hair)}
.stat b{display:block;font:800 30px/1.1 var(--mono);color:var(--ink)}.stat span{font-size:13px;color:var(--ink2);font-weight:600}
.stat.blue{border-color:var(--blue)}.stat.amber{border-color:var(--amber)}.stat.green{border-color:var(--green)}.stat.red{border-color:var(--red)}
.hero.solo{grid-template-columns:1fr}.hero .en{font:600 15px var(--mono);color:var(--ink2)}
.kicker{font-size:14px;color:var(--blue);font-weight:700;margin:40px 0 4px;display:flex;align-items:center;gap:8px}
.kicker .n{background:var(--blue-soft);border-radius:99px;padding:1px 10px;font-size:12px}
.kicker+.sub{font-size:22px;font-weight:800;margin:0 0 14px;line-height:1.35}
.kicker:not(:has(+.sub)){margin-bottom:14px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.grid.wide{grid-template-columns:repeat(auto-fill,minmax(340px,1fr))}
.card{background:var(--sheet);border-radius:var(--r-lg);padding:20px 22px;box-shadow:0 1px 0 var(--hair),0 18px 40px -26px rgba(22,32,44,.28);display:flex;flex-direction:column;gap:8px;color:var(--ink);min-width:0;transition:transform .2s ease,box-shadow .2s ease;position:relative}
a.card:hover{transform:translateY(-3px);box-shadow:0 0 0 2px var(--blue),0 24px 44px -24px rgba(37,80,217,.35)}
.card h3{margin:0;font-size:19px;line-height:1.4}.card p{margin:0;color:var(--ink2);font-size:14.5px}
.card .ic{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;font-size:24px;background:var(--blue-soft);margin-bottom:6px}
.card.c1 .ic{background:var(--blue-soft)}.card.c2 .ic{background:var(--amber-soft)}.card.c3 .ic{background:var(--green-soft)}.card.c4 .ic{background:var(--red-soft)}
.card .go{position:absolute;right:20px;top:20px;color:var(--ink2);font-weight:700;transition:transform .2s}a.card:hover .go{color:var(--blue);transform:translateX(3px)}
.card .meta{font-size:13px;color:var(--ink2);margin-top:auto;padding-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.card.item{padding:12px 12px 18px}.card.item>*:not(.thumb){margin-left:8px;margin-right:8px}
.thumb{background:var(--paper);border-radius:14px;padding:10px;margin-bottom:6px}
.thumb img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:center top;border-radius:10px;box-shadow:0 1px 0 var(--hair)}
.tag{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:7px;background:var(--paper);color:var(--ink2);white-space:nowrap}
.tag.blue{background:var(--blue-soft);color:var(--blue)}.tag.green{background:var(--green-soft);color:var(--green)}.tag.amber{background:var(--amber-soft);color:var(--amber)}.tag.red{background:var(--red-soft);color:var(--red)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--sheet);border-radius:99px;padding:7px 14px;font-weight:600;font-size:14px;color:var(--ink);box-shadow:0 0 0 1px var(--hair);transition:all .15s}
.chip:hover{box-shadow:0 0 0 2px var(--blue);color:var(--blue)}.chip.more{background:var(--blue);color:#fff;box-shadow:none}
.empty{background:var(--sheet);border:2px dashed var(--hair);border-radius:var(--r-lg);padding:26px;text-align:center;color:var(--ink2);font-size:14.5px}
.empty b{display:block;color:var(--ink);font-size:17px;margin-bottom:4px}
.list{display:flex;flex-direction:column;gap:8px}
.list .row{display:flex;gap:14px;align-items:center;padding:13px 18px;background:var(--sheet);border-radius:12px;border-left:4px solid var(--hair);box-shadow:0 1px 0 var(--hair);flex-wrap:wrap;transition:box-shadow .15s}
.list .row:has(a:hover){box-shadow:0 0 0 2px var(--blue)}
.list .row .t{flex:1;min-width:180px;font-weight:600}.list .row .t a{color:var(--ink)}.list .row .t a:hover{color:var(--blue)}
.list .row .d{font:600 13px var(--mono);color:var(--ink2)}
.list .row.due{background:var(--amber-soft);border-color:var(--amber)}.list .row.over{background:var(--red-soft);border-color:var(--red)}.list .row.ok{border-color:var(--green)}
.list .row .num{font:700 13px var(--mono);color:var(--ink2);min-width:28px}
.defcard{display:grid;grid-template-columns:1.2fr 1fr;gap:14px;padding:14px;margin-top:6px}
.defcard .stage{background:var(--paper);border-radius:14px;padding:30px;display:flex;flex-direction:column;justify-content:center;gap:8px;min-height:220px}
.defcard .stage .term{font-size:40px;font-weight:800;line-height:1.2}
.defcard .say{padding:18px 14px 18px 8px;display:flex;flex-direction:column;justify-content:center;gap:10px}
.key{background:var(--blue-soft);border-radius:12px;padding:12px 16px;font-size:17px;line-height:1.75;margin:0}
.key::before{content:"一句话 ";font-weight:800;color:var(--blue)}
.foot{margin-top:56px;font-size:13px;color:var(--ink2);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media(max-width:820px){.hero,.defcard{grid-template-columns:1fr}.hero .say{padding:14px 10px 4px}.defcard .stage{min-height:0;padding:22px}.defcard .stage .term{font-size:32px}}
@media(max-width:600px){main{padding:10px 16px 48px}.hero h1{font-size:28px}.hero p{font-size:15.5px}.stat b{font-size:24px}.top .in{padding:10px 14px;gap:10px;flex-direction:column;align-items:stretch}.top nav{margin-left:0}
.grid{grid-template-columns:1fr 1fr;gap:12px}.grid.wide{grid-template-columns:1fr}.grid .card:not(.item){padding:16px}.card h3{font-size:17px}.card .go{display:none}.kicker+.sub{font-size:19px}.list .row{padding:12px 14px;gap:8px 10px}}
`;
function page(file, title, active, body, script = '') {
  const r = p => rel(file, p);
  const nav = [['index.html', '首页', 'home'], ...columns.map(c => [`${c.dir}/index.html`, c.title, c.id]), ['glossary.html', '概念卡', 'glossary'], ['x-brief/index.html', 'X 简报', 'x-brief']]
    .map(([h, t, id]) => `<a href="${r(h)}"${id === active ? ' class="on"' : ''}>${esc(t)}</a>`).join('');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 王玮的学习库</title><style>${CSS}${THEME}</style><script>${HEADJS}</script></head><body>
<header class="top"><div class="in"><a class="brand" href="${r('index.html')}"><i>学</i>王玮的学习库</a><nav>${nav}</nav><button class="dm" onclick="__tt()" aria-label="切换深色模式">◐</button></div></header>
<main>${body}<div class="foot"><span>王玮的学习库 · 每篇都是可翻页、可动手、带小测的学习页</span><span>由 build.mjs 从 data/ 生成 · 风格改编自 <a href="https://github.com/vuejs/vitepress">VitePress</a>（MIT）</span></div></main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), s); console.log('wrote', f); };
const statusTag = s => `<span class="tag st ${STATE_CLS[s] ?? ''}">${esc(s)}</span>`;
const tagOf = it => statusTag(stateOf(it));
const countBy = arr => Object.fromEntries(STATES.map(k => [k, arr.filter(i => stateOf(i) === k).length]));
const progBar = arr => { const n = arr.length, c = countBy(arr), done = c['已学完'] + c['已掌握']; return `<div class="prog"><div class="bar"><i class="g" style="width:${n ? c['已掌握'] / n * 100 : 0}%"></i><i class="l" style="width:${n ? c['已学完'] / n * 100 : 0}%"></i><i class="b" style="width:${n ? c['进行中'] / n * 100 : 0}%"></i></div><span>已学完 ${done}/${n}${c['已掌握'] ? ` · 已掌握 ${c['已掌握']}` : ''}${c['进行中'] ? ` · 进行中 ${c['进行中']}` : ''}</span></div>`; };
const stateStats = arr => { const c = countBy(arr); return STATES.map(k => `<div class="stat ${({'未开始':'','进行中':'blue','已学完':'green','已掌握':'purple'})[k]}"><b>${c[k]}</b><span>${k}</span></div>`).join(''); };
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
    + `<a class="card c1" href="x-brief/index.html"><span class="go">→</span><div class="ic">📰</div><h3>X 简报</h3><p>每天一期的 X 中文简报，按日期翻往期。</p><div class="meta"><span class="tag blue">每日更新</span></div></a>`;
  const doing = items.filter(i => stateOf(i) === '进行中');
  const recent = [...pages].sort((a, b) => (b.start || '').localeCompare(a.start || '')).slice(0, 6);
  const inboxHtml = inbox.length ? `<div class="list">${inbox.map(x => `<div class="row"><span class="tag">${esc(colById[x.column]?.title || '未分类')}</span><span class="t"><a href="${esc(x.url)}">${esc(x.title || x.url)}</a></span><span class="d">${esc(x.added || '')}</span></div>`).join('')}</div>`
    : emptyBox('收件箱是空的', '看到想学的链接，丢到群里给学习搭子，它会先放在这里（data/inbox.json）。');
  const revData = JSON.stringify({ queue: review.queue, items: Object.fromEntries(items.map(i => [i.id, { title: i.title, label: i.label, href: i.href }])) }).replace(/</g, '\\u003c');
  const body = `<section class="hero sheet"><div class="say"><span class="kk">个人学习知识库</span><h1>一屏一个要点，学完就能动手</h1><p>按来源分栏目。每篇学习页都可以翻页、点模拟器、做小测，学完按第 1、3、7、14、30 天复习。</p></div>
<div class="stage"><div class="stat blue"><b>${pages.length}</b><span>篇学习页</span></div><div class="stat amber"><b id="due-big">…</b><span>今天该复习</span></div><div class="stat green"><b>${concepts.length}</b><span>张概念卡</span></div><div class="stat"><b>${columns.length}</b><span>个栏目</span></div></div></section>
<div class="kicker">学习状态</div><div class="sub">未开始 → 进行中 → 已学完 → 已掌握</div><div class="states">${stateStats(items)}</div>
<div class="kicker">栏目</div><div class="sub">按来源找内容</div><div class="grid">${colCards}</div>
<div class="kicker">今天该复习 <span class="n" id="due-n">…</span></div><div class="sub">到期的先复习，再学新的</div><div id="review"></div>
<div class="kicker">正在学</div><div class="sub">从上次停下的地方继续</div>${doing.length ? `<div class="grid wide">${doing.map(i => itemCard(f, i)).join('')}</div>` : emptyBox('现在没有进行中的内容', '')}
<div class="kicker">最近学过</div><div class="list">${recent.map(i => `<div class="row"><span class="tag">${esc(colById[i.column]?.title)}</span><span class="t"><a href="${i.href}">${esc(i.label)} · ${esc(i.title)}</a></span>${tagOf(i)}<span class="d">${esc(i.start)}</span></div>`).join('')}</div>
<div class="kicker">待学收件箱 <span class="n">${inbox.length}</span></div>${inboxHtml}
<div class="kicker">概念卡</div><div class="sub">一个术语一张卡，跨栏目串起来</div><div class="chips">${concepts.map(c => `<a class="chip" href="concepts/${c.id}.html">${esc(c.term)}</a>`).join('')}<a class="chip more" href="glossary.html">全部概念卡 →</a></div>`;
  const script = `const R=${revData};const p=n=>String(n).padStart(2,'0');const d=new Date();const today=new URLSearchParams(location.search).get('today')||(d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())); /* 自查用：?today=2026-10-14 */
const all=[];for(const q of R.queue)for(const r of q.reviews)if(!r.done)all.push({...r,item:q.item});all.sort((a,b)=>a.date.localeCompare(b.date));
const due=all.filter(r=>r.date<=today),soon=all.filter(r=>r.date>today).slice(0,4);const el=document.getElementById('review');
document.getElementById('due-n').textContent=due.length+' 项到期';document.getElementById('due-big').textContent=due.length;
const row=(r,cls,lab)=>{const it=R.items[r.item]||{};return '<div class="row '+cls+'"><span class="tag '+(cls==='over'?'red':cls==='due'?'amber':'')+'">'+lab+'</span><span class="t"><a href="'+it.href+'">'+it.label+' · '+it.title+'</a></span><span class="d">第 '+r.day+' 天 · '+r.date+'</span></div>'};
let h=due.map(r=>row(r,r.date<today?'over':'due',r.date<today?'已逾期':'今天')).join('');
if(!due.length)h='<div class="row ok"><span class="t">今天（'+today+'）没有到期的复习 🎉</span></div>';
if(soon.length)h+=soon.map(r=>row(r,'','即将')).join('');el.innerHTML='<div class="list">'+h+'</div>';`;
  write(f, page(f, '首页', 'home', body, script));
}
// ---- 栏目页 + 主题页 ----
for (const c of columns) {
  const f = `${c.dir}/index.html`; const its = pages.filter(i => i.column === c.id); const gs = groups.filter(g => g.column === c.id);
  const pending = items.filter(i => i.column === c.id && !i.group && !isPage(i)).sort((a, b) => a.order - b.order);
  let body = `<div class="crumb"><a href="${rel(f, 'index.html')}">首页</a> / ${esc(c.title)}</div><section class="hero sheet"><div class="say"><span class="kk">栏目</span><h1>${c.icon} ${esc(c.title)}</h1><p>${esc(c.desc)}</p></div><div class="stage"><div class="stat blue"><b>${its.length}</b><span>篇学习页</span></div><div class="stat green"><b>${its.filter(i => ['已学完','已掌握'].includes(stateOf(i))).length}</b><span>已学完</span></div><div class="stat blue"><b>${its.filter(i => stateOf(i) === '进行中').length}</b><span>进行中</span></div><div class="stat"><b>${pending.length || gs.length}</b><span>${pending.length ? '篇未开始' : '个主题'}</span></div></div></section>`;
  if (!its.length && !gs.length && !pending.length) body += `<div style="margin-top:28px">${emptyBox('还没有内容', `以后学到${esc(c.title)}的内容，会出现在这里。`)}</div>`;
  for (const g of gs) { const gi = its.filter(i => i.group === g.id); const gp = items.filter(i => i.group === g.id && !isPage(i));
    body += `<div class="kicker">主题</div><div class="sub">${esc(g.title)}</div><div class="grid wide"><a class="card c1" href="${rel(f, g.dir + '/index.html')}"><span class="go">→</span><div class="ic">${c.icon}</div><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p><div class="meta"><span class="tag blue">${gi.length} 篇学习页</span>${gp.length ? `<span class="tag">${gp.length} 讲未开始</span>` : ''}</div>${progBar(items.filter(i => i.group === g.id))}</a></div>`; }
  const loose = its.filter(i => !i.group);
  if (loose.length) body += `<div class="kicker">文章 <span class="n">${loose.length}</span></div><div class="sub">一篇一页，点开就学</div><div class="grid wide">${loose.map(i => itemCard(f, i)).join('')}</div>`;
  if (pending.length) body += `<div class="kicker">待学 <span class="n">${pending.length}</span></div><div class="sub">还没做成学习页，先看原文</div><div class="list">${pending.map(i => `<div class="row">${statusTag('未开始')}<span class="tag">${esc(i.label)}</span><span class="t"><a href="${esc(i.href)}"${/^https?:/.test(i.href) ? ' target="_blank" rel="noopener"' : ''}>${esc(i.title)}</a>${i.note ? `<div style="font-weight:400;font-size:14px;color:var(--ink2)">${esc(i.note)}</div>` : ''}</span>${i.date ? `<span class="d">${esc(i.date)}</span>` : ''}</div>`).join('')}</div>`;
  write(f, page(f, c.title, c.id, body));
}
for (const g of groups) {
  const f = `${g.dir}/index.html`; const c = colById[g.column]; const gall = items.filter(i => i.group === g.id).sort((a, b) => a.order - b.order); const gi = gall.filter(isPage), gp = gall.filter(i => !isPage(i));
  const ext = h => /^https?:/.test(h) ? h : rel(f, h);
  const rowsHtml = rs => `<div class="list">${rs.map(r => `<div class="row">${r.tag ? `<span class="tag ${r.tagc || ''}">${esc(r.tag)}</span>` : ''}${r.st ? statusTag(r.st) : ''}<span class="t"><a href="${esc(ext(r.href))}">${esc(r.title)}</a>${r.note ? `<div style="font-weight:400;font-size:14px;color:var(--ink2)">${esc(r.note)}</div>` : ''}</span>${r.d ? `<span class="d">${esc(r.d)}</span>` : ''}</div>`).join('')}</div>`;
  const body = `<div class="crumb"><a href="${rel(f, 'index.html')}">首页</a> / <a href="${rel(f, c.dir + '/index.html')}">${esc(c.title)}</a> / ${esc(g.title)}</div>
<section class="hero sheet"><div class="say"><span class="kk">${esc(c.title)} · 主题</span><h1>${esc(g.title)}</h1><p>${esc(g.desc)}</p><p style="font-size:14px">课程网站：<a href="${esc(g.source)}">${esc(g.source.replace(/^https?:\/\//, ''))}</a></p>${progBar(gall)}</div><div class="stage"><div class="stat blue"><b>${gi.length}</b><span>讲已做成学习页</span></div><div class="stat green"><b>${gi.filter(i => ['已学完','已掌握'].includes(stateOf(i))).length}</b><span>已学完</span></div><div class="stat blue"><b>${gi.filter(i => stateOf(i) === '进行中').length}</b><span>进行中</span></div>${gp.length ? `<div class="stat"><b>${gp.length}</b><span>讲未开始</span></div>` : `<div class="stat"><b>${new Set(gi.flatMap(i => itemConcepts(i.id).map(x => x.id))).size}</b><span>张相关概念卡</span></div>`}</div></section>
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
  const refs = c.refs.map(r => { const it = itemById[r.item]; return `<div class="row"><span class="tag">${esc(colById[it.column]?.title)}</span><span class="t"><a href="${rel(f, it.href)}#${r.card}">${esc(it.label)} · ${esc(r.note)}</a></span><span class="d">第 ${r.card} 张 →</span></div>`; }).join('');
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
// ---- review.md（人读版） ----
{
  let md = `# 间隔复习队列\n\n> 由 build.mjs 从 data/review.json 生成，不要手改本文件。复习完成后把 data/review.json 里对应条目的 \`done\` 改成 \`true\`，再运行 \`node build.mjs\`。\n> 规则：开始学习后第 ${review.intervals.join('、')} 天各复习一次。首页按浏览器当天日期高亮到期项。\n\n| 内容 | 开始 | ${review.intervals.map(n => `第 ${n} 天`).join(' | ')} |\n|---|---|${review.intervals.map(() => '---').join('|')}|\n`;
  for (const q of review.queue) { const it = itemById[q.item]; md += `| ${it ? `${it.label} ${it.title}` : q.item} | ${q.start} | ${q.reviews.map(r => `${r.date}${r.done ? ' ✅' : ''}`).join(' | ')} |\n`; }
  write('review.md', md);
}
