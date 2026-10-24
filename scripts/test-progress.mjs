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
