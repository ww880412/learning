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

const needTypes = ['学习页', '概念卡', 'X 简报', 'X 海报', '产品灵感', '每日汇总'];
const gotTypes = new Set(search.entries.map((x) => x.type));
for (const t of needTypes) assert.ok(gotTypes.has(t), 'search-index missing type: ' + t);

for (const e of search.entries) {
  assert.ok(e && typeof e === 'object', 'entry should be object');
  assert.ok(typeof e.title === 'string' && e.title.trim(), 'entry title missing');
  assert.ok(typeof e.href === 'string' && e.href.trim(), 'entry href missing');
  assert.ok(!e.href.includes('_private/'), 'must not leak private path: ' + e.href);
  assert.ok(!/-close\.html($|#)/.test(e.href), 'must not index encrypted close page: ' + e.href);
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

console.log('ok');
