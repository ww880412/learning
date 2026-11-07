// node scripts/test-governance.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const itemsJson = J('data/items.json');
const search = J('data/search-index.json');

assert.equal(search.version, 1, 'search-index version');
assert.ok(Array.isArray(search.entries) && search.entries.length > 50, 'search-index entries');
assert.ok(!Object.prototype.hasOwnProperty.call(search, 'generatedAt'), 'search-index should be deterministic (no generatedAt)');

const needTypes = ['学习页', '概念卡', 'X 简报', 'X 海报', '产品灵感', '每日汇总', 'DSH 插件'];
const gotTypes = new Set(search.entries.map((x) => x.type));
for (const t of needTypes) assert.ok(gotTypes.has(t), 'search-index missing type: ' + t);

const isPublicField = (v) => {
  const s = String(v ?? '');
  if (!s) return true;
  if (/_private\/|staticrypt|github_pat_|ghp_|token\s*[:=]|password\s*[:=]/i.test(s)) return false;
  return true;
};

for (const e of search.entries) {
  assert.ok(e && typeof e === 'object', 'entry should be object');
  assert.ok(typeof e.title === 'string' && e.title.trim(), 'entry title missing');
  assert.ok(typeof e.href === 'string' && e.href.trim(), 'entry href missing');
  assert.ok(isPublicField(e.title) && isPublicField(e.summary) && isPublicField(e.source) && isPublicField(e.href), 'public-field whitelist violated: ' + e.id);
  assert.ok(!/-close\.html($|#)/.test(e.href), 'must not index encrypted close page: ' + e.href);
  assert.ok(!/^https?:/.test(e.href), 'href should stay inside site: ' + e.href);
  if (e.source) assert.ok(/^https?:\/\//.test(e.source) || !/^[a-z]+:/i.test(e.source), 'source protocol not allowed: ' + e.source);
  assert.ok(e.trace && typeof e.trace.sourceFile === 'string' && e.trace.sourceFile, 'trace.sourceFile missing: ' + e.id);
  const base = e.href.split('#')[0];
  const abs = path.join(ROOT, base);
  assert.ok(fs.existsSync(abs), 'href target missing: ' + e.href);
}

const groupSource = new Map((itemsJson.groups || []).map((g) => [g.id, g.source]));
for (const it of itemsJson.items || []) {
  if (it.status === '未开始') continue;
  if (/^https?:/.test(it.href)) continue;
  const src = it.source || groupSource.get(it.group);
  assert.ok(src && /^https?:\/\//.test(src), `learning page source missing: ${it.id}`);
}

// DSH：对照 data/dsh-plugins.json，每一条重点插件和核实行都要进索引，锚点互不相同，并且页面上真有这个 id。
const dsh = J('data/dsh-plugins.json');
const dshPage = fs.readFileSync(path.join(ROOT, 'dsh-plugins/index.html'), 'utf8');
const dshHid = (name, i) => 'dsh-h-' + (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || String(i + 1));
const expected = [];
(dsh.highlights || []).forEach((h, i) => {
  const anchor = dshHid(h.name, i);
  expected.push({ id: `dsh-highlight:${h.name}`, href: `dsh-plugins/index.html#${anchor}`, anchor });
});
for (const g of dsh.verify || []) for (const r of g.rows || []) {
  const anchor = `dsh-v${r.n}`;
  expected.push({ id: `dsh:${r.n}`, href: `dsh-plugins/index.html#${anchor}`, anchor });
}
assert.ok(expected.length > 2, 'DSH 源数据应多于旧的 2 条');
const byId = new Map(search.entries.map((e) => [e.id, e]));
const indexed = search.entries.filter((e) => e.type === 'DSH 插件');
assert.equal(indexed.length, expected.length, `DSH 索引 ${indexed.length} 条，源数据 ${expected.length} 条，有条目被静默丢掉`);
const hrefs = new Set(), anchors = new Set();
for (const exp of expected) {
  const e = byId.get(exp.id);
  assert.ok(e, '索引缺少 ' + exp.id);
  assert.equal(e.href, exp.href, exp.id);
  assert.equal(e.trace.sourceFile, 'data/dsh-plugins.json');
  assert.ok(dshPage.includes(`id="${exp.anchor}"`), '页面缺少锚点 ' + exp.anchor);
  assert.ok(!hrefs.has(exp.href), '锚点重复 ' + exp.href);
  assert.ok(!anchors.has(exp.anchor), 'id 重复 ' + exp.anchor);
  hrefs.add(exp.href); anchors.add(exp.anchor);
}
assert.equal(hrefs.size, expected.length);

// trace 只是来源位置。修订原因在 git 历史里，不写进索引。
for (const e of search.entries) {
  assert.deepEqual(Object.keys(e.trace).sort(), ['key', 'sourceFile'], 'trace 不应带修订原因或判断：' + e.id);
  assert.equal(e.reason, undefined);
  assert.equal(e.revision, undefined);
}

// 可复现的公开规则变更：从 git 读出旧结论、新结论和当时写明的原因。不改页面正文，也不把 trace 当成修订史。
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/revision-sample.json'), 'utf8'));
const gitShow = (rev, file) => {
  const r = spawnSync('git', ['show', `${rev}:${file}`], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `git show ${rev}:${file} 失败\n${r.stderr}`);
  return r.stdout;
};
const parentBuild = gitShow(sample.parent, 'build.mjs');
const parentReadme = gitShow(sample.parent, 'README.md');
const commitBuild = gitShow(sample.commit, 'build.mjs');
const commitReadme = gitShow(sample.commit, 'README.md');
const currentBuild = fs.readFileSync(path.join(ROOT, 'build.mjs'), 'utf8');
const currentReadme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
assert.ok(parentBuild.includes(sample.old.rule), '父提交里应有旧的已学完规则');
assert.ok(parentReadme.includes(sample.old.readme), '父提交 README 应有旧口径');
assert.ok(!commitBuild.includes(sample.old.rule), '新提交不应再按小测加复述判定已学完');
assert.ok(commitBuild.includes(sample.next.rule), '新提交应写明按「学完了」');
assert.ok(commitBuild.includes(sample.next.reason), '新提交应保留当时的原因');
assert.ok(commitReadme.includes(sample.next.readme), '新提交 README 应是新口径');
assert.ok(currentBuild.includes(sample.next.rule) && currentBuild.includes(sample.next.reason), '当前 build.mjs 应仍带这条原因');
assert.ok(currentReadme.includes(sample.next.readme), '当前 README 应仍是新口径');
assert.equal(sample.notUserJudgment, true);

// 坏数据时重建脚本必须自己停发。这里真的跑一次，不再只检查测试源码里有没有某句话。
// 「失败后 origin/main 没有新提交」由 scripts/test-publish.mjs 用假远程仓库断言，本文件不重复那一段。
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-publish-'));
  try {
    fs.copyFileSync(path.join(ROOT, 'build.mjs'), path.join(tmp, 'build.mjs'));
    for (const d of ['assets', 'data', 'scripts']) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'data', 'concepts.json'), '[{"id":');
    const r = spawnSync('bash', [path.join(tmp, 'scripts/rebuild-home.sh')], {
      env: { ...process.env, LEARNING_ROOT: tmp },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.notEqual(r.status, 0, '坏数据时 rebuild-home.sh 应非零退出\n' + r.stdout + r.stderr);
    assert.match(r.stderr || '', /停止发布/, '应明确停止发布');
    assert.match((r.stdout || '') + (r.stderr || ''), /concepts\.json/, '应指出坏掉的文件');
    assert.equal(fs.existsSync(path.join(tmp, '.git')), false, '这个检查不推送，临时目录也不是仓库');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('ok');
