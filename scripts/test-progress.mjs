// node scripts/test-progress.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const gh = require('../assets/gh.js');
const fav = require('../assets/favorites.js');
const prog = require('../assets/progress.js');

function reviewDoc() {
  return {
    intervals: [1, 3, 7, 14, 30],
    queue: [
      { item: 'cs146s-L01', learned: '2026-10-12', start: '2026-10-11', reviews: [
        { day: 1, date: '2026-10-12', done: false },
        { day: 3, date: '2026-10-14', done: false },
        { day: 7, date: '2026-10-18', done: true, doneOn: '2026-10-20' },
      ] },
      { item: 'cs146s-L02', start: '2026-10-17', reviews: [
        { day: 1, date: '2026-10-18', done: false },
      ] },
    ],
  };
}

const later = prog.applyLearned(reviewDoc(), 'cs146s-L01', '2026-10-24');
assert.equal(later, null, '已有更早 learned 时不改');

const set = prog.applyLearned(reviewDoc(), 'cs146s-L02', '2026-10-24');
assert.equal(set.doc.queue[1].learned, '2026-10-24');
assert.equal(set.doc.queue[1].start, '2026-10-17');
assert.equal(set.doc.queue[0].learned, '2026-10-12');
assert.equal(Object.keys(set.doc.queue[1])[0], 'item');
assert.equal(Object.keys(set.doc.queue[1])[1], 'learned');

const earlier = prog.applyLearned(reviewDoc(), 'cs146s-L01', '2026-10-01');
assert.equal(earlier.doc.queue[0].learned, '2026-10-01');
assert.ok(earlier.doc.queue[0].reviews.length === 3, '不删 reviews');

const doc = reviewDoc();
prog.applyLearned(doc, 'cs146s-L02', '2026-10-24');
const tick = prog.applyReviews(doc, 'cs146s-L02', [{ day: 1, done: true, doneOn: '2026-10-24' }]);
assert.equal(tick.doc.queue[1].reviews[0].done, true);
assert.equal(tick.doc.queue[1].reviews[0].doneOn, '2026-10-24');
assert.equal(tick.doc.queue[1].reviews[0].date, '2026-10-18');
assert.equal(tick.doc.queue[0].learned, '2026-10-12');
const keepEarlierOn = prog.applyReviews(tick.doc, 'cs146s-L02', [{ day: 1, done: true, doneOn: '2026-10-30' }]);
assert.equal(keepEarlierOn, null, 'doneOn 取更早的，不改成更晚');
const undo = prog.applyReviews(tick.doc, 'cs146s-L02', [{ day: 1, done: false }]);
assert.equal(undo.doc.queue[1].reviews[0].done, false);
assert.equal(Object.prototype.hasOwnProperty.call(undo.doc.queue[1].reviews[0], 'doneOn'), false);
assert.equal(undo.doc.queue[0].learned, '2026-10-12', '取消复习不删 learned');
assert.equal(undo.doc.queue[1].learned, '2026-10-24', '取消复习不删本条 learned');

const cloud = reviewDoc();
cloud.queue[1].learned = '2026-10-20';
const merged = prog.mergeLocal(cloud, {
  done: { '/courses/cs146s/L02-harness-anatomy.html': '2026-10-18', '/courses/cs146s/L01-agent-loop.html': '2026-10-20' },
  rev: { 'cs146s-L02': { '1': '2026-10-19' }, 'cs146s-L01': { '1': '2026-10-13' } },
}, [
  { id: 'cs146s-L01', href: 'courses/cs146s/L01-agent-loop.html' },
  { id: 'cs146s-L02', href: 'courses/cs146s/L02-harness-anatomy.html' },
], '/');
assert.equal(merged.doc.queue[1].learned, '2026-10-18');
assert.equal(merged.doc.queue[0].learned, '2026-10-12', '本机更晚的 done 不覆盖更早的 learned');
assert.equal(merged.doc.queue[1].reviews[0].done, true);
assert.equal(merged.doc.queue[1].reviews[0].doneOn, '2026-10-19');
assert.equal(merged.doc.queue[0].reviews[2].done, true, '云端已完成的复习还在');
assert.equal(merged.doc.queue[0].reviews[2].doneOn, '2026-10-20');
assert.equal(merged.doc.queue[0].reviews[0].done, true);
assert.equal(merged.doc.queue[0].reviews[0].doneOn, '2026-10-13');

const noDelete = prog.mergeLocal(reviewDoc(), { done: {}, rev: {} }, [], '/');
assert.equal(noDelete, null);

const diff = prog.diffRev({ 1: '2026-10-24', 3: '2026-10-24' }, {});
assert.deepEqual(diff, [{ day: 1, done: false }, { day: 3, done: false }]);
assert.equal(prog.beijingToday(new Date('2026-10-24T16:00:00Z')), '2026-10-25');
assert.equal(prog.beijingToday(new Date('2026-10-24T02:00:00Z')), '2026-10-24');
assert.equal(prog.pathsMatch('/learning/cs146s/L02-harness-anatomy.html', 'courses/cs146s/L02-harness-anatomy.html', '/learning/'), true);


// ---------- 跨设备冲突：以最后一次操作为准 ----------
{
  const T1 = Date.parse('2026-10-26T01:00:00Z'), T2 = Date.parse('2026-10-26T02:00:00Z'), T3 = Date.parse('2026-10-26T03:00:00Z');
  const items = [{ id: 'cs146s-L01', href: 'courses/cs146s/L01-agent-loop.html' }, { id: 'cs146s-L02', href: 'courses/cs146s/L02-harness-anatomy.html' }];
  // 设备 A 勾第 3 天（T1）→ 云端 done + at
  let cloud = reviewDoc();
  const a = prog.applyOps(cloud, 'cs146s-L01', { 3: { done: true, on: '2026-10-26', at: T1 } });
  assert.equal(a.doc.queue[0].reviews[1].done, true); assert.equal(a.doc.queue[0].reviews[1].doneOn, '2026-10-26');
  assert.equal(a.doc.queue[0].reviews[1].at, new Date(T1).toISOString()); assert.match(a.message, /^review: cs146s-L01 3 done$/);
  cloud = a.doc;
  // 设备 B 在 T2 取消 → 云端 done:false、去掉 doneOn、at=T2
  const b = prog.applyOps(JSON.parse(JSON.stringify(cloud)), 'cs146s-L01', { 3: { done: false, at: T2 } });
  assert.equal(b.doc.queue[0].reviews[1].done, false); assert.equal('doneOn' in b.doc.queue[0].reviews[1], false);
  assert.match(b.message, / undo$/); cloud = b.doc;
  // 设备 A 重新打开：本机还留着第 3 天的 rev-done（操作已传过、没有待上传操作）→ 不再把取消改回去
  assert.equal(prog.mergeLocal(cloud, { done: {}, rev: { 'cs146s-L01': { 3: '2026-10-26' } }, ops: {} }, items, '/'), null, '取消不能被旧设备复活');
  // 设备 A 断网时在 T1 勾的操作（比云端 T2 的取消早）→ 不改云端，并且这条操作被清掉
  assert.equal(prog.applyOps(JSON.parse(JSON.stringify(cloud)), 'cs146s-L01', { 3: { done: true, on: '2026-10-26', at: T1 } }), null, '更早的操作不改云端');
  assert.deepEqual(prog.pruneOps(cloud, 'cs146s-L01', { 3: { done: true, on: '2026-10-26', at: T1 } }), {}, '过时的操作要清掉');
  // 设备 A 在 T3 又勾上（比取消新）→ 生效；没传上去之前保留
  assert.deepEqual(Object.keys(prog.pruneOps(cloud, 'cs146s-L01', { 3: { done: true, on: '2026-10-26', at: T3 } })), ['3'], '更新的操作没传上去前要保留');
  const m = prog.mergeLocal(cloud, { done: {}, rev: { 'cs146s-L01': { 3: '2026-10-26' } }, ops: { 'cs146s-L01': { 3: { done: true, on: '2026-10-26', at: T3 } } } }, items, '/');
  assert.equal(m.doc.queue[0].reviews[1].done, true); assert.equal(m.doc.queue[0].reviews[1].at, new Date(T3).toISOString());
  assert.deepEqual(prog.pruneOps(m.doc, 'cs146s-L01', { 3: { done: true, on: '2026-10-26', at: T3 } }), {}, '传上去之后清掉');
  // 取消比勾选新：留住（T3 取消压过 T2 的勾选）
  const c2 = prog.applyOps(prog.applyOps(reviewDoc(), 'cs146s-L02', { 1: { done: true, on: '2026-10-26', at: T2 } }).doc, 'cs146s-L02', { 1: { done: false, at: T3 } });
  assert.equal(c2.doc.queue[1].reviews[0].done, false, '更新的取消要留住');
  // 同一时刻不重复写（幂等）
  assert.equal(prog.applyOps(c2.doc, 'cs146s-L02', { 1: { done: false, at: T3 } }), null);
  // 没有 at 的旧数据：旧本机记录照旧补上（向后兼容），云端已有 at 的那天不补
  const legacy = prog.mergeLocal(reviewDoc(), { done: {}, rev: { 'cs146s-L01': { 1: '2026-10-13' } } }, items, '/');
  assert.equal(legacy.doc.queue[0].reviews[0].done, true);
  // 坏操作被忽略
  assert.equal(prog.applyOps(reviewDoc(), 'cs146s-L01', { 1: { done: 'yes', at: T1 }, 2: { done: true, at: 0 }, x: { done: true, at: T1 } }), null);
  // 首页显示：effReview
  const E = prog.effReview;
  assert.deepEqual(E({ done: true, doneOn: '2026-10-26', at: new Date(T1).toISOString() }, '', undefined), { done: true, on: '2026-10-26' }, '(a)5：云端今天勾的，这台设备也算今天已看');
  assert.deepEqual(E({ done: false, at: new Date(T2).toISOString() }, '2026-10-26', undefined), { done: false, on: '' }, '云端更新的取消压过本机旧记录');
  assert.deepEqual(E({ done: false, at: new Date(T2).toISOString() }, '', { done: true, on: '2026-10-26', at: T3 }), { done: true, on: '2026-10-26' }, '本机更新的操作优先');
  assert.deepEqual(E({ done: true, doneOn: '2026-10-20', at: new Date(T2).toISOString() }, '', { done: false, at: T3 }), { done: false, on: '' }, '本机更新的取消优先');
  assert.deepEqual(E({ done: true, doneOn: '2026-10-20' }, '2026-10-18', undefined), { done: true, on: '2026-10-18' }, '旧数据：两边都完成取更早的日期');
  assert.deepEqual(E({ done: false }, '2026-10-18', undefined), { done: true, on: '2026-10-18' }, '旧数据：本机完成也算');
  // effReview 的源码会注入首页内联脚本，必须自包含
  const injected = new Function('return (' + E.toString() + ')')();
  assert.deepEqual(injected({ done: true, doneOn: '2026-10-26', at: new Date(T1).toISOString() }, '', undefined), { done: true, on: '2026-10-26' });
}

// ---------- 本地备份导出/导入（不含令牌） ----------
{
  const base = {
    done: { '/courses/cs146s/L01-agent-loop.html': '2026-10-20' },
    rev: { 'cs146s-L01': { 1: '2026-10-20' } },
    ops: { 'cs146s-L01': { 3: { done: false, at: Date.parse('2026-10-26T02:00:00Z') } } },
  };
  const bk = prog.exportBackup(base);
  assert.equal(bk.version, 1);
  assert.equal(bk.kind, 'learning-progress-local');
  assert.deepEqual(Object.keys(bk).sort(), ['done', 'exportedAt', 'kind', 'ops', 'rev', 'scope', 'version'].sort());
  const parsed = prog.parseBackup(JSON.stringify(bk));
  assert.equal(parsed.ok, true);
  assert.equal(prog.parseBackup('{"version":2}').ok, false, '版本不对时应拒绝');
  assert.equal(prog.parseBackup(JSON.stringify({ version: 1, kind: 'learning-progress-local', done: { '/bad': '2026-13-40' } })).ok, false, '内容坏时也应拒绝');
  const pv = prog.previewBackupMerge({ done: {}, rev: {}, ops: {} }, JSON.stringify(bk));
  assert.equal(pv.ok, true);
  assert.equal(pv.preview.counts.done, 1);
  const merged = prog.mergeBackup({
    done: { '/courses/cs146s/L01-agent-loop.html': '2026-10-19' }, // 本机更早
    rev: { 'cs146s-L01': { 1: '2026-10-19' } }, // 本机更早
    ops: { 'cs146s-L01': { 3: { done: true, on: '2026-10-26', at: Date.parse('2026-10-26T03:00:00Z') } } }, // 本机更新
  }, parsed.data);
  assert.equal(merged.state.done['/courses/cs146s/L01-agent-loop.html'], '2026-10-19');
  assert.equal(merged.state.rev['cs146s-L01'][1], '2026-10-19');
  assert.equal(merged.state.ops['cs146s-L01'][3].done, true);
  assert.ok(merged.report.conflicts.length >= 1, '冲突应在报告里可见');
  assert.ok(merged.report.decisions.localWins >= 1, '应统计本机优先');
  const merged2 = prog.mergeBackup({ done: { '/courses/cs146s/L01-agent-loop.html': '2026-10-20' }, rev: {}, ops: {} }, { done: { '/courses/cs146s/L01-agent-loop.html': '2026-10-19' }, rev: {}, ops: {} });
  assert.equal(merged2.state.done['/courses/cs146s/L01-agent-loop.html'], '2026-10-19');
  assert.ok(merged2.report.decisions.importWins >= 1, '应统计导入优先');
}

// 导入写入：假存储逐次计数，故障按调用序号注入，断言注入确实触发。
{
  class FakeStorage {
    constructor(init) { this.m = new Map(Object.entries(init)); this.calls = { get: 0, set: 0, remove: 0 }; this.setLog = []; this.removeLog = []; this.failGet = null; this.failSet = null; this.failRemove = null; this.afterSet = null; this.fired = 0; }
    getItem(k) { this.calls.get++; if (this.failGet && this.failGet(k)) { this.fired++; throw new Error('SecurityError: storage disabled'); } return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k, v) { this.calls.set++; this.setLog.push(k); if (this.failSet && this.failSet(k, this.calls.set)) { this.fired++; throw new Error('QuotaExceededError'); } this.m.set(k, String(v)); if (this.afterSet) this.afterSet(k, this); }
    removeItem(k) { this.calls.remove++; this.removeLog.push(k); if (this.failRemove && this.failRemove(k)) { this.fired++; throw new Error('remove blocked'); } this.m.delete(k); }
    snap() { return Object.fromEntries(this.m); }
  }
  const A = '/courses/cs146s/L01-agent-loop.html', B = '/courses/cs146s/L02-context.html';
  const INIT = {
    ['done:' + A]: '2026-10-20',
    'rev-done:cs146s-L01': JSON.stringify({ 1: '2026-10-21' }),
    'fav:token': 'example-not-a-token',
    'fav:cache': '[{"url":"/example"}]',
    'site-theme': 'example-light',
  };
  const local = { done: { [A]: '2026-10-20' }, rev: { 'cs146s-L01': { 1: '2026-10-21' } }, ops: {} };
  const backup = prog.parseBackup(JSON.stringify(prog.exportBackup({ done: { [A]: '2026-10-18', [B]: '2026-10-19' }, rev: { 'cs146s-L01': { 1: '2026-10-18', 3: '2026-10-22' } }, ops: {} }))).data;
  const merged = prog.mergeBackup(local, backup).state;
  const mkPlan = st => prog.planImport(k => st.getItem(k), merged);
  const isLearn = k => /^(done:|rev-done:|rev-op:)/.test(k);
  const others = snap => Object.fromEntries(Object.entries(snap).filter(([k]) => !isLearn(k)));

  {
    const st = new FakeStorage(INIT);
    const plan = mkPlan(st);
    assert.deepEqual(plan.map(p => p.key), ['done:' + A, 'done:' + B, 'rev-done:cs146s-L01'], '只计划要变的学习键');
    for (const p of plan) assert.notEqual(p.before, p.after, '计划里的每个键新旧值都不同：' + p.key);
    assert.equal(plan[1].before, null);
    const sameStore = new FakeStorage({ ...INIT, ['done:' + A]: '2026-10-18', ['done:' + B]: '2026-10-19', 'rev-done:cs146s-L01': JSON.stringify(merged.rev['cs146s-L01']) });
    assert.equal(mkPlan(sameStore).length, 0, '值相同就不写');
    const res = prog.writeLearningPlan(st, plan);
    assert.equal(res.ok, true); assert.equal(res.written, 3);
    assert.equal(st.calls.set, 3); assert.equal(st.calls.remove, 0);
    assert.ok(st.setLog.every(isLearn), '只写学习键');
    assert.deepEqual(others(st.snap()), others(INIT), '无关键原样');
    assert.equal(st.getItem('done:' + A), '2026-10-18');
  }
  { // 存储整个被禁用：读就抛错，一次写都不应发生
    const st = new FakeStorage(INIT); const plan = mkPlan(st); st.failGet = () => true;
    const res = prog.writeLearningPlan(st, plan);
    assert.equal(res.ok, false); assert.equal(res.phase, 'first'); assert.equal(res.written, 0); assert.equal(res.restored, true);
    assert.ok(st.fired >= 1, '读故障确实触发'); assert.equal(st.calls.set, 0);
    assert.deepEqual(st.snap(), INIT);
  }
  { // 配额一直满：第一次写就失败，只尝试一次，存储里的值不动
    const st = new FakeStorage(INIT); const plan = mkPlan(st); st.failSet = () => true;
    const res = prog.writeLearningPlan(st, plan);
    assert.equal(res.phase, 'first'); assert.equal(res.written, 0); assert.equal(res.restored, true);
    assert.equal(st.fired, 1); assert.equal(st.calls.set, 1);
    assert.deepEqual(st.snap(), INIT);
  }
  { // 第一次写先落盘再抛错：不能报「没改动」，要把已经不同的新值改回去
    const st = new FakeStorage(INIT); const plan = mkPlan(st);
    st.failSet = (k, n) => { if (n !== 1) return false; st.m.set(k, plan[0].after); return true; };
    const res = prog.writeLearningPlan(st, plan);
    assert.notEqual(plan[0].after, plan[0].before);
    assert.equal(res.phase, 'middle'); assert.equal(res.written, 1); assert.equal(res.restored, true);
    assert.equal(st.fired, 1); assert.equal(st.calls.set, 2, '1 次失败的写入 + 1 次恢复');
    assert.deepEqual(st.snap(), INIT);
  }
  { // 第二次写失败：第一键已经真的变成新值，再被恢复
    const st = new FakeStorage(INIT); const plan = mkPlan(st); let seen = null;
    st.failSet = (k, n) => n === 2;
    st.afterSet = (k, s) => { if (s.calls.set === 1) seen = s.m.get(k); };
    const res = prog.writeLearningPlan(st, plan);
    assert.equal(seen, '2026-10-18', '中途失败前第一键确实写成了不同的新值');
    assert.equal(res.phase, 'middle'); assert.equal(res.written, 1); assert.equal(res.restored, true); assert.deepEqual(res.residue, []);
    assert.equal(st.fired, 1); assert.equal(st.calls.set, 3, '2 次导入写 + 1 次恢复写');
    assert.deepEqual(st.snap(), INIT, '恢复后与导入前完全一致');
  }
  { // 第三次写失败：新增的键用 remove 恢复
    const st = new FakeStorage(INIT); const plan = mkPlan(st);
    st.failSet = (k, n) => n === 3;
    const res = prog.writeLearningPlan(st, plan);
    assert.equal(res.phase, 'middle'); assert.equal(res.written, 2); assert.equal(res.restored, true);
    assert.deepEqual(st.removeLog, ['done:' + B]); assert.equal(st.fired, 1);
    assert.deepEqual(st.snap(), INIT);
  }
  { // 恢复也失败：如实报告残留键，不谎称已回滚
    const st = new FakeStorage(INIT); const plan = mkPlan(st);
    st.failSet = (k, n) => n >= 2; st.failRemove = () => true;
    const res = prog.writeLearningPlan(st, plan);
    assert.equal(res.ok, false); assert.equal(res.phase, 'restore-failed'); assert.equal(res.restored, false);
    assert.deepEqual(res.residue, ['done:' + A]);
    assert.ok(st.fired >= 3, '写、恢复写、恢复删都确实失败过');
    assert.equal(st.getItem('done:' + A), '2026-10-18', '残留值如实存在');
    assert.deepEqual(others(st.snap()), others(INIT), '无关键原样');
  }
  { // 别的标签页在导入中途改了下一个目标键和无关键：停下，不覆盖它们
    const st = new FakeStorage(INIT); const plan = mkPlan(st);
    st.afterSet = (k, s) => { if (s.calls.set === 1) { s.m.set('done:' + B, '2026-10-25'); s.m.set('fav:cache', '[{"url":"/other-tab"}]'); } };
    const res = prog.writeLearningPlan(st, plan);
    assert.equal(res.phase, 'concurrent'); assert.equal(res.written, 1); assert.equal(res.restored, true);
    assert.equal(st.getItem('done:' + B), '2026-10-25', '别的标签页写的目标键保留');
    assert.equal(st.getItem('fav:cache'), '[{"url":"/other-tab"}]', '别的标签页写的无关键保留');
    assert.equal(st.getItem('done:' + A), '2026-10-20', '自己写过的键恢复');
    assert.equal(st.getItem('fav:token'), 'example-not-a-token');
  }
  { // 自己写过的键随后被别的标签页改了，再中途失败：恢复时不覆盖别人的值
    const st = new FakeStorage(INIT); const plan = mkPlan(st);
    st.failSet = (k, n) => { if (n !== 2) return false; st.m.set('done:' + A, '2026-10-01'); return true; };
    const res = prog.writeLearningPlan(st, plan);
    assert.equal(res.phase, 'middle'); assert.deepEqual(res.keptOther, ['done:' + A]); assert.equal(st.fired, 1);
    assert.equal(st.getItem('done:' + A), '2026-10-01');
    assert.equal(st.calls.set, 2, '没有恢复写');
  }
  { // 计划里混进非学习键：一个都不写
    const st = new FakeStorage(INIT);
    const res = prog.writeLearningPlan(st, [{ key: 'fav:token', before: 'example-not-a-token', after: 'x' }]);
    assert.equal(res.phase, 'refused'); assert.equal(st.calls.set, 0);
  }
}

function jsonResp(status, obj) { return { status, json: async () => obj }; }
async function fakeCommit() {
  let sha = 's0', puts = 0, stored = { version: 1, items: [] };
  const calls = [];
  const f = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    calls.push({ url, method, body: opts && opts.body, headers: opts && opts.headers });
    if (method === 'GET') return jsonResp(200, { sha, content: gh.b64enc(JSON.stringify(stored)) });
    puts++;
    const body = JSON.parse(opts.body);
    assert.equal(body.branch, 'main');
    assert.equal(body.sha, sha);
    if (puts === 1) return jsonResp(409, {});
    sha = 's1';
    stored = JSON.parse(gh.b64dec(body.content));
    return jsonResp(200, { content: { sha } });
  };
  const list = await fav.commitOp({ type: 'add', item: { url: '/a', title: '一页', tags: ['云同步'] } }, 'github_pat_x', f);
  assert.equal(list[0].url, '/a');
  assert.equal(list[0].tags[0], '云同步');
  assert.equal(puts, 2, '409 之后重试成功');
  const put = calls.filter(c => c.method === 'PUT')[1];
  const body = JSON.parse(put.body);
  assert.match(body.message, /^fav: \+ /);
  assert.equal(put.headers.Authorization, 'Bearer github_pat_x');
  assert.equal(JSON.parse(gh.b64dec(body.content)).items[0].title, '一页');
  const removed = await fav.commitOp({ type: 'remove', item: { url: '/a', title: '一页' } }, 'github_pat_x', async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method === 'GET') return jsonResp(200, { sha: 's1', content: gh.b64enc(JSON.stringify(stored)) });
    stored = JSON.parse(gh.b64dec(JSON.parse(opts.body).content));
    return jsonResp(200, {});
  });
  assert.deepEqual(removed, []);
}
await fakeCommit();

let learnedPuts = 0;
const base = reviewDoc();
await gh.commitJson('data/review.json', 'github_pat_x', (doc) => prog.applyLearned(doc, 'cs146s-L02', '2026-10-24'), async (url, opts) => {
  const method = (opts && opts.method) || 'GET';
  if (method === 'GET') return jsonResp(200, { sha: 'r', content: gh.b64enc(JSON.stringify(base)) });
  learnedPuts++;
  const text = gh.b64dec(JSON.parse(opts.body).content);
  assert.ok(text.endsWith('\n'));
  const next = JSON.parse(text);
  assert.equal(next.queue[1].learned, '2026-10-24');
  assert.equal(next.queue[0].learned, '2026-10-12');
  assert.equal(next.intervals.length, 5);
  return jsonResp(201, {});
});
assert.equal(learnedPuts, 1);

// 云写入口必须能列全，而且学习进度的提交只能从 commitReview 出去。hold 要挡在这个共享边界上。
{
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const progressSrc = fs.readFileSync(path.join(root, 'assets/progress.js'), 'utf8');
  const favSrc = fs.readFileSync(path.join(root, 'assets/favorites.js'), 'utf8');
  const buildSrc = fs.readFileSync(path.join(root, 'build.mjs'), 'utf8');
  const commitCalls = progressSrc.match(/GH\.commitJson\(/g) || [];
  assert.equal(commitCalls.length, 1, 'progress.js 里学习进度的云写只能有一处');
  const commitFn = progressSrc.slice(progressSrc.indexOf('function commitReview'), progressSrc.indexOf('function pushLearned'));
  assert.ok(commitFn.includes('denyHeld'), 'commitReview 必须先看 hold');
  assert.ok(commitFn.indexOf('denyHeld') < commitFn.indexOf('GH.commitJson'), 'hold 要在真正提交之前');
  const gate = progressSrc.slice(progressSrc.indexOf('function denyHeld'), progressSrc.indexOf('function commitReview'));
  assert.match(gate, /holdKeys\(\)/);
  for (const name of ['pushLearned', 'onReview', 'syncLocal']) {
    const start = progressSrc.indexOf('function ' + name);
    const next = progressSrc.indexOf('\n  function ', start + 10);
    const body = progressSrc.slice(start, next);
    assert.match(body, /commitReview\(/, name + ' 必须走 commitReview');
    assert.doesNotMatch(body, /GH\.commitJson/, name + ' 不能自己提交');
  }
  assert.match(progressSrc.slice(progressSrc.indexOf('function boot'), progressSrc.indexOf('root.addEventListener')), /syncLocal\(/);
  const tokenHook = progressSrc.slice(progressSrc.indexOf('gh-token'), progressSrc.indexOf('root.PROG = Object.assign'));
  assert.match(tokenHook, /syncLocal\(/);
  assert.match(buildSrc, /PROG\.onReview/);
  assert.match(buildSrc, /PROG\.syncLocal\(\)/);
  assert.equal((buildSrc.match(/GH\.commitJson\(/g) || []).length, 0);
  assert.match(favSrc, /FILE = 'favorites\.json'/);
  assert.match(favSrc, /GH\.commitJson\(FILE/);
  assert.doesNotMatch(favSrc, /data\/review\.json/);
}

function bootBrowser(init, hooks) {
  const m = new Map(Object.entries(init || {}));
  const sets = [];
  const toasts = [];
  let commits = 0;
  const store = {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i]; },
    getItem(k) { if (store.fail && store.fail(k)) throw new Error('collection read failed'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { sets.push([k, String(v)]); m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    fail: null,
  };
  const listeners = {};
  const root = {
    GH: {
      token: () => 'synthetic-noncredential',
      toast: (s) => { toasts.push(String(s)); },
      commitJson: () => { commits++; return Promise.resolve({ skipped: true }); },
    },
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    dispatchEvent: (ev) => { (listeners[ev.type] || []).forEach((fn) => fn(ev)); },
  };
  const document = {
    currentScript: { src: 'http://127.0.0.1/assets/progress.js' },
    readyState: 'loading',
    addEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
  };
  const context = {
    window: root, document, localStorage: store, sessionStorage: store,
    location: { origin: 'http://127.0.0.1', href: 'http://127.0.0.1/courses/example.html', pathname: '/courses/example.html' },
    URL, console, fetch: async () => ({ ok: true, json: async () => ({ items: [{ id: 'ex1', href: '/courses/example.html' }] }) }),
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../assets/progress.js', import.meta.url), 'utf8'), context);
  if (hooks && hooks.fail) store.fail = hooks.fail;
  return { root, m, store, sets, toasts, commits: () => commits, fire: (type) => root.dispatchEvent({ type }) };
}

const residual = JSON.stringify({ 1: { done: true, at: 100, on: '2026-11-06' } });
const otherBackup = { version: 1, kind: 'learning-progress-local', done: { '/courses/example.html': '2026-11-01' }, rev: {}, ops: {} };
{
  const app = bootBrowser({
    'prog-import-hold': JSON.stringify({ keys: ['rev-op:cs146s-L01', 'done:/courses/other.html'] }),
    'rev-op:cs146s-L01': residual,
    'done:/courses/other.html': '2026-08-02',
    unrelated: 'sentinel',
  });
  app.root.PROG.onReview('cs146s-L01', {}, { 1: '2026-11-06' });
  await app.root.PROG.pushLearned();
  await app.root.PROG.syncLocal();
  app.fire('gh-token');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(app.commits(), 0, 'hold 下今日勾选、学完了、打开页面补写、令牌事件都不应提交');
  assert.ok(app.toasts.filter((t) => t.includes('暂停')).length >= 4, '四条云写入口都应明确暂停：' + app.toasts.join(' | '));
  app.root.PROG.importLocalBackup(otherBackup, { confirm: true });
  const heldOf = () => JSON.parse(JSON.stringify(app.root.PROG.importHold()));
  assert.deepEqual(heldOf(), ['rev-op:cs146s-L01', 'done:/courses/other.html'], '无关导入不能解除别的残留键');
  assert.equal(app.m.get('rev-op:cs146s-L01'), residual);
  assert.equal(app.m.get('done:/courses/other.html'), '2026-08-02');
  assert.equal(app.m.get('unrelated'), 'sentinel');
  await app.root.PROG.syncLocal();
  assert.equal(app.commits(), 0, '残留还在时不能重新上传');
  app.root.PROG.importLocalBackup({ version: 1, kind: 'learning-progress-local', done: { '/courses/other.html': '2026-08-01' }, rev: {}, ops: {} }, { confirm: true });
  assert.deepEqual(heldOf(), ['rev-op:cs146s-L01'], '只放下已经写上并读回的键');
  assert.equal(app.m.get('done:/courses/other.html'), '2026-08-01');
  assert.equal(app.m.get('rev-op:cs146s-L01'), residual);
  const fixing = { version: 1, kind: 'learning-progress-local', done: {}, rev: {}, ops: { 'cs146s-L01': { 1: { done: true, on: '2026-11-07', at: 200 } } } };
  app.root.PROG.importLocalBackup(fixing, { confirm: true });
  assert.equal(app.root.PROG.importHold(), null, '这个键已经写上并读回，hold 可以放下');
  assert.notEqual(app.m.get('rev-op:cs146s-L01'), residual);
  await app.root.PROG.syncLocal();
  app.root.PROG.onReview('cs146s-L01', {}, { 1: '2026-11-07' });
  assert.ok(app.commits() >= 1, '残留解决后，原来的云写入口要能再次提交');
}
{
  const app = bootBrowser({ 'done:/courses/example.html': '2026-01-01', unrelated: 'sentinel' });
  app.store.fail = (k) => k === 'done:/courses/example.html';
  const preview = app.root.PROG.previewBackupMerge(otherBackup);
  assert.equal(preview.ok, false, '预览读失败不能当成空状态去合并');
  assert.equal(app.sets.length, 0);
  assert.equal(app.m.get('done:/courses/example.html'), '2026-01-01');
  await assert.rejects(() => Promise.resolve().then(() => app.root.PROG.importLocalBackup(otherBackup, { confirm: true })), /没有写入/);
  assert.equal(app.m.get('done:/courses/example.html'), '2026-01-01', '执行阶段读失败也不能把 1 月覆盖成 11 月');
  assert.equal(app.m.get('unrelated'), 'sentinel');
  assert.ok(app.sets.every(([k]) => k === 'prog-import-hold') || app.sets.length === 0);
}
{
  const early = { version: 1, kind: 'learning-progress-local', done: { '/courses/example.html': '2026-01-01' }, rev: {}, ops: {} };
  const app = bootBrowser({ 'done:/courses/example.html': '2026-11-01', unrelated: 'sentinel' });
  const preview = app.root.PROG.previewBackupMerge(early);
  assert.equal(preview.ok, true);
  assert.ok(preview.changes >= 1, '读得完整时，更早的导入日期应该排进计划');
  app.store.fail = (k) => k === 'done:/courses/example.html';
  await assert.rejects(() => Promise.resolve().then(() => app.root.PROG.importLocalBackup(early, { confirm: true, sig: preview.sig })), /没有写入/);
  assert.equal(app.m.get('done:/courses/example.html'), '2026-11-01');
  assert.equal(app.sets.filter(([k]) => k.startsWith('done:')).length, 0, '预览之后、执行时读失败，不能写入');
}
{
  const app = bootBrowser({ 'done:/courses/example.html': '2026-01-01', unrelated: 'sentinel' });
  const origKey = app.store.key.bind(app.store);
  app.store.key = (i) => { if (i === 0) throw new Error('enumeration failed'); return origKey(i); };
  const preview = app.root.PROG.previewBackupMerge(otherBackup);
  assert.equal(preview.ok, false);
  assert.match(preview.error, /枚举本机学习记录失败/);
  assert.equal(app.sets.length, 0);
  await assert.rejects(() => Promise.resolve().then(() => app.root.PROG.importLocalBackup(otherBackup, { confirm: true })), /枚举本机学习记录失败/);
  assert.equal(app.m.get('done:/courses/example.html'), '2026-01-01');
  assert.throws(() => app.root.PROG.exportLocalBackup(), /枚举本机学习记录失败/);
  assert.equal(app.sets.length, 0, '枚举失败时导出、预览、导入都不能写键');
}

console.log('ok');
