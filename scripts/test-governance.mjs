// node scripts/test-governance.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

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

// 发布契约证据：至少要求仓库内可执行的“构建失败停发”测试脚本存在并断言坏数据不推送。
const publishTest = fs.readFileSync(path.join(ROOT, 'scripts/test-publish.mjs'), 'utf8');
assert.match(publishTest, /构建失败应非零退出/);
assert.match(publishTest, /origin\/main 不应有新提交/);

console.log('ok');
