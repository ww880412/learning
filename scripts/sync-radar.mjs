#!/usr/bin/env node
// 把「Agent 工作台雷达」bot 的调研结果同步成 data/radar.json，供 build.mjs 生成 radar/ 栏目和首页卡片。
// 用法：node scripts/sync-radar.mjs [雷达目录，默认 /workspace/agent-workbench]
// 只搬运 refs.json 里已有的字段，不改写、不补数据。每个条目的「补录日期」取自 refs.md 头部的补录说明（> YYYY-MM-DD … 新增 #a–#b），
// 没被任何补录说明覆盖的条目记为首次生成日（meta.generated 的日期）。
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = process.argv[2] || '/workspace/agent-workbench';
const refs = JSON.parse(fs.readFileSync(path.join(SRC, 'refs.json'), 'utf8'));
const md = fs.readFileSync(path.join(SRC, 'refs.md'), 'utf8');
const head = md.split('## 条目明细')[0];
// 主题顺序与名称：和雷达 build.py 的 TH 一致
const THEMES = [['plugin', '端侧插件生态'], ['enterprise', '企业资产与知识库'], ['memory', '上下文/记忆'], ['harness', 'harness 与编排'], ['sandbox', '沙箱与安全权限'], ['gateway', '身份权限与 MCP 网关'], ['eval', '评测与可观测'], ['cost', '成本与模型路由'], ['review', '代码审查与 CI'], ['other', '其他']];
const gen = (refs.meta.generated.match(/\d{4}-\d{2}-\d{2}/) || [])[0];
if (!gen) throw new Error('refs.json meta.generated 没有日期');
const added = {}; const batches = [];
for (const line of head.split('\n')) {
  const m = line.match(/^>\s*(\d{4}-\d{2}-\d{2})\s*([^：]*)：(.*)$/); if (!m) continue;
  const [, date, label, rest] = m; const ids = [];
  // 「新增 #a–#b」；没有「新增」二字时，接受以「#a–#b 共 N 条」开头的写法（如 2026-10-26 PH 灵感箱补录）
  const segs = rest.includes('新增') ? rest.split('新增').slice(1) : (/^\s*#\d+(?:[–-]#\d+)?\s*共/.test(rest) ? [rest] : []);
  for (const seg of segs) {
    const clause = seg.split(/[；。：]/)[0];
    for (const r of clause.matchAll(/#(\d+)(?:[–-]#(\d+))?/g)) { const a = +r[1], b = r[2] ? +r[2] : a; for (let i = a; i <= b; i++) ids.push(i); }
  }
  if (!ids.length) continue;
  for (const i of ids) added[i] ??= date;
  batches.push({ date, label: label.trim(), ids: [ids[0], ids[ids.length - 1]], n: ids.length });
}
const entries = refs.entries.map(e => ({
  id: e.id, theme: e.theme_key, name: e.name, url: e.url, repo: e.repo || null,
  stars: e.github?.stars ?? null, license: e.github?.license ?? null, pushed: e.github?.pushed_at ?? null, archived: e.github?.archived ?? false,
  verified: !!e.repo_verified, what: e.what, borrow: e.borrow, note: e.note || '',
  sources: e.sources.map(s => ({ author: s.author, date: s.reposted_on, url: s.url })),
  added: added[e.id] || gen,
}));
const known = new Set(THEMES.map(t => t[0]));
for (const e of entries) if (!known.has(e.theme)) throw new Error('未知主题 ' + e.theme);
if (entries.length !== refs.meta.entries) throw new Error(`条目数 ${entries.length} != meta.entries ${refs.meta.entries}`);
const updated = entries.reduce((m, e) => e.added > m ? e.added : m, gen);
const out = {
  _readme: '由 scripts/sync-radar.mjs 从雷达 bot 的 refs.json / refs.md 同步，不要手改。build.mjs 用它生成 radar/index.html 和首页「雷达」卡。',
  title: 'Agent 工作台雷达', subtitle: '企业级 Coding Agent 原生工作台 · 开源参考清单',
  source: { dir: SRC, files: ['refs.json', 'refs.md'], account: refs.meta.account, scanned: refs.meta.scanned, postsCited: refs.meta.posts_cited, githubNote: refs.meta.github_stats_note },
  generated: gen, updated, tz: '北京时间', batches,
  themes: THEMES.map(([key, title]) => ({ key, title, n: entries.filter(e => e.theme === key).length })),
  entries,
};
fs.writeFileSync(path.join(ROOT, 'data', 'radar.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`radar: ${entries.length} entries, ${entries.filter(e => e.verified).length} verified repos, updated ${updated}, batches ${batches.map(b => b.date + '#' + b.ids.join('-')).join(' ')}`);

// 周报：雷达目录 weekly/YYYY-MM-DD.md（北京日期，原文照搬）复制到 data/radar-weekly/，build.mjs 生成 radar/weekly/YYYY-MM-DD.html。
const WK_SRC = path.join(SRC, 'weekly'), WK_DST = path.join(ROOT, 'data', 'radar-weekly');
const wk = fs.existsSync(WK_SRC) ? fs.readdirSync(WK_SRC).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort() : [];
fs.mkdirSync(WK_DST, { recursive: true });
for (const f of fs.readdirSync(WK_DST)) if (/\.md$/.test(f) && !wk.includes(f)) fs.rmSync(path.join(WK_DST, f));
for (const f of wk) fs.copyFileSync(path.join(WK_SRC, f), path.join(WK_DST, f));
console.log(`radar weekly: ${wk.length} 份${wk.length ? '（' + wk.map(f => f.slice(0, 10)).join(' ') + '）' : ''}`);
