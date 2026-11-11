// node scripts/test-progress.mjs
import { createRequire } from 'node:module';
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
assert.equal(earlier.doc.queue.length, 2, '学完不删队列条目，否则写不上云');
assert.equal(earlier.doc.queue[0].joined, undefined, '学完不表示加入复习');
assert.equal(set.doc.queue[1].reviews[0].done, false, '学完不把复习标成 done');

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
assert.equal(merged.doc.queue.length, 2, '同步学完不删队列条目');
assert.equal(merged.doc.queue[1].learned, '2026-10-18');
assert.equal(merged.doc.queue[0].learned, '2026-10-12', '本机更晚的 done 不覆盖更早的 learned');
assert.equal(merged.doc.queue[1].joined, undefined, '学完不同时加入复习');
assert.equal(merged.doc.queue[1].reviews[0].done, false, '没加入时，旧 rev-done 不能把复习标成 done');
assert.equal(merged.doc.queue[0].reviews[0].done, false, '没加入时，旧 rev-done 不复活第 1 天');
assert.equal(merged.doc.queue[0].reviews[2].done, true, '云端原来的 done 还在，这一步不负责清积压');
assert.equal(merged.doc.queue[0].reviews[2].doneOn, '2026-10-20');

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
  // 下面这几条测的是「已经加入复习」之后的勾选冲突。没 joined 的旧自动复习不在这里测。
  cloud.queue[0].joined = '2026-10-11';
  cloud.queue[0].joinAt = '2026-10-11T00:00:00.000Z';
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
  // 没加入复习：旧 rev-done / rev-op 不写回，也不把任何一天标成 done（避免第 14 天被标完成、文章变成已掌握）
  const stale = prog.mergeLocal(reviewDoc(), {
    done: {},
    rev: { 'cs146s-L01': { 1: '2026-10-13', 14: '2026-10-25' } },
    ops: { 'cs146s-L01': { 14: { done: true, on: '2026-10-25', at: T3 } } },
  }, items, '/');
  assert.equal(stale, null, '没加入复习时，旧操作不产生提交');
  const untouched = reviewDoc();
  assert.equal(untouched.queue[0].reviews.some((r) => r.day === 14 && r.done), false);
  // 已加入、但这一天带了 at：旧 rev-done 补不进去
  const enrolled = reviewDoc();
  enrolled.queue[0].joined = '2026-10-11';
  enrolled.queue[0].joinAt = '2026-10-11T00:00:00.000Z';
  enrolled.queue[0].reviews[0].at = '2026-10-11T00:00:00.000Z';
  assert.equal(prog.mergeLocal(enrolled, { done: {}, rev: { 'cs146s-L01': { 1: '2026-10-13' } }, ops: {} }, items, '/'), null, '带 at 的新排期不被旧 rev-done 勾上');
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

// ---------- 加入复习和学完分开存；排期从加入日算，不把旧复习标成 done ----------
{
  const items = [{ id: 'cs146s-L01', href: 'courses/cs146s/L01-agent-loop.html' }, { id: 'cs146s-L02', href: 'courses/cs146s/L02-harness-anatomy.html' }];
  const T0 = Date.parse('2026-11-10T02:00:00Z');
  const base = reviewDoc();
  const joined = prog.applyEnroll(base, 'cs146s-L01', { joined: '2026-11-10', at: T0 });
  assert.equal(joined.doc.queue.length, 2, '加入复习不删其他条目');
  assert.equal(joined.doc.queue[0].learned, '2026-10-12', '加入复习不动 learned');
  assert.equal(joined.doc.queue[0].joined, '2026-11-10');
  assert.deepEqual(joined.doc.queue[0].reviews.map((r) => r.day), [1, 3, 7, 14, 30]);
  assert.deepEqual(joined.doc.queue[0].reviews.map((r) => r.date), ['2026-11-11', '2026-11-13', '2026-11-17', '2026-11-24', '2026-12-10']);
  assert.ok(joined.doc.queue[0].reviews.every((r) => r.done === false), '新排期全部未完成，不会凭空已掌握');
  assert.equal(joined.doc.queue[1].learned, undefined);
  assert.equal(prog.applyEnroll(joined.doc, 'cs146s-L01', { joined: '2026-11-10', at: T0 + 1000 }), null, '同一天再加入不重排、不抹掉进度');
  const day14 = joined.doc.queue[0].reviews.find((r) => r.day === 14);
  day14.done = true; day14.doneOn = '2026-11-24';
  assert.equal(prog.applyEnroll(joined.doc, 'cs146s-L01', { joined: '2026-11-10', at: T0 + 2000 }), null);
  assert.equal(day14.done, true, '重复加入保留已经做过的第 14 天');
  const cancelled = prog.applyEnroll(joined.doc, 'cs146s-L01', { joined: '', at: T0 + 5000 });
  assert.equal(cancelled.doc.queue[0].learned, '2026-10-12', '取消复习不删 learned');
  assert.equal(cancelled.doc.queue[0].joined, undefined);
  assert.deepEqual(cancelled.doc.queue[0].reviews, []);
  assert.equal(cancelled.doc.queue.length, 2, '取消复习不删条目');
  assert.ok(cancelled.doc.queue[0].joinAt);
  assert.equal(prog.applyEnroll(cancelled.doc, 'cs146s-L01', { joined: '2026-11-10', at: T0 }), null, '更早的加入压不过取消');
  const again = prog.applyEnroll(cancelled.doc, 'cs146s-L01', { joined: '2026-11-12', at: T0 + 9000 });
  assert.ok(again.doc.queue[0].reviews.every((r) => r.done === false), '重新加入是新排期，不把旧的第 14 天带回来');
  assert.equal(again.doc.queue[0].learned, '2026-10-12');
  // 本机旧操作 + 新的加入：旧 rev-done 不能把新的第 14 天勾上
  const fresh = reviewDoc();
  const synced = prog.mergeLocal(fresh, {
    done: { '/courses/cs146s/L02-harness-anatomy.html': '2026-11-10' },
    rev: { 'cs146s-L01': { 14: '2026-10-25' }, 'cs146s-L02': { 1: '2026-11-11' } },
    ops: { 'cs146s-L01': { 14: { done: true, on: '2026-10-25', at: T0 - 1000 } } },
    joins: { 'cs146s-L01': { joined: '2026-11-10', at: T0 } },
  }, items, '/');
  const l01 = synced.doc.queue.find((q) => q.item === 'cs146s-L01');
  const l02 = synced.doc.queue.find((q) => q.item === 'cs146s-L02');
  assert.equal(l02.learned, '2026-11-10', '学完照常写入，且条目还在');
  assert.equal(l02.joined, undefined);
  assert.equal(l02.reviews[0].done, false, '只学完的篇不排进完成');
  assert.equal(l01.learned, '2026-10-12');
  assert.equal(l01.joined, '2026-11-10');
  assert.equal(l01.reviews.find((r) => r.day === 14).done, false, '加入之前的旧勾选不复活');
  assert.equal(prog.effectiveJoin(l01, null), '2026-11-10');
  assert.equal(prog.effectiveJoin(l01, { joined: '', at: T0 + 1 }), '', '更新的取消优先');
  assert.equal(prog.effectiveJoin({ joined: '2026-11-01', joinAt: new Date(T0).toISOString() }, { joined: '2026-11-02', at: T0 - 1 }), '2026-11-01', '更早的本机加入不盖过云端');
  const injectedJoin = new Function('return (' + prog.effectiveJoin.toString() + ')')();
  assert.equal(injectedJoin(l01, null), '2026-11-10');
}

// ---------- 首页继续学：learned 或本机 done 都跳过，没学完的留下 ----------
{
  const list = [
    { id: 'huangtongxueh-ai-dev', href: 'x-posts/huangtongxueh-ai-dev/huangtongxueh-ai-dev.html', title: '已有 learned' },
    { id: 'langchain-managed-deep-agents', href: 'x-posts/langchain-managed-deep-agents/langchain-managed-deep-agents.html', title: '本机学完' },
    { id: 'addy-agents-manager', href: 'x-posts/addy-agents-manager/addy-agents-manager.html', title: '还在进行中' },
  ];
  const queue = [
    { item: 'huangtongxueh-ai-dev', learned: '2026-10-23', reviews: [{ day: 1, done: true }] },
    { item: 'langchain-managed-deep-agents', start: '2026-11-09', reviews: [{ day: 1, done: false }] },
    { item: 'addy-agents-manager', start: '2026-11-08', reviews: [{ day: 1, done: true }] },
  ];
  const doneOf = (href) => href.indexOf('langchain-managed-deep-agents') >= 0 ? '2026-11-10' : '';
  assert.equal(prog.nextContinue(list, queue, {}, doneOf).id, 'addy-agents-manager', 'learned 和本机 done 都排除，未学完的留下');
  assert.equal(prog.nextContinue([list[0]], queue, {}, () => ''), null, '只有 learned 的不推荐');
  assert.equal(prog.nextContinue([list[2]], queue, {}, () => '').id, 'addy-agents-manager', '复习勾选不算学完');
  assert.equal(prog.nextContinue(list.slice(1), queue, {}, () => '').id, 'langchain-managed-deep-agents', '没有 learned、没有本机 done 的留下');
  assert.equal(prog.nextContinue([{ href: 'x-posts/huangtongxueh-ai-dev/huangtongxueh-ai-dev.html' }], queue, { 'huangtongxueh-ai-dev': { href: 'x-posts/huangtongxueh-ai-dev/huangtongxueh-ai-dev.html' } }, () => ''), null, '没有 id 时按 href 对上 learned');
  const doneOfPath = (href) => prog.pathsMatch('/learning/cs146s/L02-harness-anatomy.html', href, '/learning/') ? '2026-11-10' : '';
  assert.equal(prog.nextContinue([{ id: 'cs146s-L02', href: 'courses/cs146s/L02-harness-anatomy.html' }], [{ item: 'cs146s-L02' }], {}, doneOfPath), null, '课程软链路径上的 done 也算学完');
  assert.equal(prog.nextContinue([], queue, {}, doneOf), null);
  const injectedNext = new Function('return (' + prog.nextContinue.toString() + ')')();
  assert.equal(injectedNext(list, queue, {}, doneOf).id, 'addy-agents-manager', '注入首页的源码与导出版一致');
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

console.log('ok');
