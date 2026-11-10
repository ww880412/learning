// node scripts/test-guards.mjs —— 坏数据拦截的反向测试，全部通过打印 ok。不联网、不用真令牌、不改本仓库文件。
// 1. 仓库里的 JSON 存在但损坏：gh.js 报错，不发 PUT（收藏列表不会被覆盖成只剩一条）；404 仍可初始化。
// 2. build.mjs 在写任何文件之前校验数据：坏 JSON、概念卡引用不存在的条目、非法链接、非法日期都非零退出，报出具体条目，且一个文件都不写。
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const gh = require('../assets/gh.js');
const fav = require('../assets/favorites.js');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TOKEN = 'github_pat_fake_for_tests';

// ---------- 1. 坏 JSON 不写 ----------
function fakeApi(getStatus, text) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if ((init.method || 'GET') === 'GET') return { status: getStatus, ok: getStatus === 200, json: async () => ({ sha: 's1', content: text == null ? undefined : gh.b64enc(text) }) };
    return { status: 201, ok: true, json: async () => ({}) };
  };
  return { f, calls };
}
const item = { url: '/learning/x.html', title: '新收藏', type: 'page', tags: [] };
for (const [label, text] of [['截断的 JSON', '{"version":1,"items":[{"url":"/a"'], ['空文件', ''], ['不是 JSON', 'oops']]) {
  const api = fakeApi(200, text);
  await assert.rejects(fav.commitOp({ type: 'add', item }, TOKEN, api.f, 1), /内容损坏/, `favorites.json ${label} 应报错`);
  assert.equal(api.calls.filter(c => c.method === 'PUT').length, 0, `favorites.json ${label} 不应发 PUT`);
  const api2 = fakeApi(200, text);
  await assert.rejects(gh.commitJson('data/review.json', TOKEN, d => ({ doc: d, message: 'x' }), api2.f, 1), /data\/review\.json 内容损坏/);
  assert.equal(api2.calls.filter(c => c.method === 'PUT').length, 0, `review.json ${label} 不应发 PUT`);
}
{ // 404：文件还不存在，允许初始化
  const api = fakeApi(404);
  const list = await fav.commitOp({ type: 'add', item }, TOKEN, api.f, 1);
  assert.equal(list.length, 1); assert.equal(api.calls.filter(c => c.method === 'PUT').length, 1, '404 时应初始化');
}
{ // 正常文件：照常合并写入，原有条目保留
  const api = fakeApi(200, JSON.stringify({ version: 1, items: [{ url: '/a', title: 'A' }] }));
  const list = await fav.commitOp({ type: 'add', item }, TOKEN, api.f, 1);
  assert.deepEqual(list.map(x => x.url), ['/learning/x.html', '/a']);
}

// ---------- 2. build.mjs 入口校验 ----------
function snapshot(dir) {
  const out = {};
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { const st = fs.statSync(p); out[path.relative(dir, p)] = st.size + ':' + st.mtimeMs; } } })(dir);
  return out;
}
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-guard-'));
  fs.copyFileSync(path.join(ROOT, 'build.mjs'), path.join(dir, 'build.mjs'));
  fs.cpSync(path.join(ROOT, 'assets'), path.join(dir, 'assets'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'data'), path.join(dir, 'data'), { recursive: true });
  return dir;
}
const edit = (dir, f, fn) => { const p = path.join(dir, 'data', f); const j = JSON.parse(fs.readFileSync(p, 'utf8')); fn(j); fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n'); };
function expectFail(label, mutate, re) {
  const dir = sandbox();
  try {
    mutate(dir);
    const before = snapshot(dir);
    const r = spawnSync(process.execPath, ['build.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(r.status, 0, `${label}：应当非零退出`);
    assert.match(r.stderr, re, `${label}：错误信息应指出具体条目，实际：${r.stderr}`);
    assert.deepEqual(snapshot(dir), before, `${label}：失败时不应写任何文件`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
expectFail('概念卡引用不存在的条目', d => edit(d, 'concepts.json', j => { j[0].refs[0].item = 'no-such-item'; }),
  /data\/concepts\.json concepts\[0\] \(id=[^)]+\) refs\[0\]：item 引用了不存在的条目 "no-such-item"/);
expectFail('坏 JSON', d => fs.writeFileSync(path.join(d, 'data', 'concepts.json'), '[{"id":'), /数据文件解析失败：data\/concepts\.json/);
expectFail('ID 重复', d => edit(d, 'items.json', j => { j.items[1].id = j.items[0].id; }), /data\/items\.json items\[1\] \(id=[^)]+\)：id 重复/);
expectFail('javascript: 链接', d => edit(d, 'items.json', j => { j.items[0].href = 'javascript:alert(1)'; }), /data\/items\.json items\[0\] \(id=[^)]+\)：href 不是 http\/https/);
expectFail('不存在的日期', d => edit(d, 'review.json', j => { j.queue[0].learned = '2026-02-30'; }), /data\/review\.json queue\[0\] \(item=[^)]+\)：learned 不是合法日期/);
{ // 好数据：校验通过。没 joined 的自动复习清成空数组，条目和 learned 都留着，不把第 14 天标成 done
  const dir = sandbox();
  try {
    const before = JSON.parse(fs.readFileSync(path.join(dir, 'data/review.json'), 'utf8'));
    const r = spawnSync(process.execPath, ['build.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'data/review.json'), 'utf8'));
    assert.ok(after.queue.length >= before.queue.length, '不能删队列条目，否则学完写不上去');
    for (const q of before.queue) {
      const n = after.queue.find((x) => x.item === q.item);
      assert.ok(n, '丢失条目 ' + q.item);
      assert.equal(n.learned ?? undefined, q.learned ?? undefined, '丢掉了 learned ' + q.item);
      if (!q.joined) {
        assert.deepEqual(n.reviews, [], q.item + ' 没加入复习却还留着 reviews');
        assert.equal(Object.prototype.hasOwnProperty.call(n, 'joined'), false);
      }
    }
    const l01 = after.queue.find((q) => q.item === 'cs146s-L01');
    assert.equal(l01.learned, before.queue.find((q) => q.item === 'cs146s-L01').learned);
    assert.equal(l01.reviews.some((row) => row.done), false, '清积压不能把旧复习标成 done');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
{ // 用户已经加入的复习：构建保留 done，并补齐 1/3/7/14/30，不把没做的标成完成
  const dir = sandbox();
  try {
    edit(dir, 'review.json', (j) => {
      const q = j.queue.find((x) => x.item === 'cs146s-L01');
      q.joined = '2026-11-01';
      q.joinAt = '2026-11-01T00:00:00.000Z';
      q.reviews = [{ day: 14, date: '2026-11-15', done: true, doneOn: '2026-11-15', at: '2026-11-15T00:00:00.000Z' }];
    });
    const r = spawnSync(process.execPath, ['build.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'data/review.json'), 'utf8'));
    const l01 = after.queue.find((q) => q.item === 'cs146s-L01');
    assert.equal(l01.joined, '2026-11-01');
    assert.equal(l01.learned, JSON.parse(fs.readFileSync(path.join(ROOT, 'data/review.json'), 'utf8')).queue.find((q) => q.item === 'cs146s-L01').learned);
    assert.deepEqual(l01.reviews.map((row) => row.day), [1, 3, 7, 14, 30]);
    const d14 = l01.reviews.find((row) => row.day === 14);
    assert.equal(d14.done, true);
    assert.equal(d14.doneOn, '2026-11-15');
    assert.ok(l01.reviews.filter((row) => row.day !== 14).every((row) => row.done === false));
    const other = after.queue.find((q) => q.item !== 'cs146s-L01' && !q.joined);
    assert.deepEqual(other.reviews, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
console.log('ok');
