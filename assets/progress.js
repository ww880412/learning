/* 学习进度：本机 done: / rev-done: 照旧马上写入。有 fav:token 时，用 gh.js 把
   learned / reviews[].done（以及可选的 doneOn）提交到 data/review.json。
   没有令牌时只留在本机，并指向收藏页「同步设置」。不另要一枚令牌。 */
(function (root) {
  var GH = root.GH;
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-'), y = +p[0], m = +p[1], d = +p[2], t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  function earlier(a, b) {
    var A = isDate(a) ? a : '', B = isDate(b) ? b : '';
    if (!A) return B; if (!B) return A; return A < B ? A : B;
  }
  function beijingToday(date) {
    var dt = date instanceof Date ? date : new Date();
    try {
      var s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
      return isDate(s) ? s : '';
    } catch (e) { return ''; }
  }
  function okPath(p) { return typeof p === 'string' && p.charAt(0) === '/' && p.length <= 400 && p.indexOf('..') < 0 && !/[\u0000-\u001f\\]/.test(p); }
  function okId(id) { return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(id); }
  function okDay(day) { return /^[1-9]\d{0,2}$/.test(String(day)); }
  function doneExpand(u) {
    var out = [], vs = [u], seen = {}, i, x, m, m2, d;
    if (u.endsWith('/index.html')) { d = u.slice(0, -10); vs.push(d); vs.push(d.replace(/\/$/, '') || '/'); }
    else if (u.endsWith('/')) { vs.push(u + 'index.html'); vs.push(u.replace(/\/$/, '') || '/'); }
    else if (!/\.[a-z0-9]+$/i.test(u)) { vs.push(u + '/'); vs.push(u + '/index.html'); }
    for (i = 0; i < vs.length; i++) {
      x = vs[i]; if (seen[x]) continue; seen[x] = 1; out.push(x);
      m = x.match(/^(.*)\/courses\/(.+)$/); if (m) { var alt = m[1] + '/' + m[2]; if (!seen[alt]) { seen[alt] = 1; out.push(alt); } }
      m2 = x.match(/^(.*)\/(cs146s)\/(.+)$/); if (m2 && x.indexOf('/courses/') < 0) { var alt2 = m2[1] + '/courses/' + m2[2] + '/' + m2[3]; if (!seen[alt2]) { seen[alt2] = 1; out.push(alt2); } }
    }
    return out;
  }
  function siteJoin(href, site) {
    var base = site || '/';
    if (base.charAt(base.length - 1) !== '/') base += '/';
    if (base === '/') return '/' + String(href || '').replace(/^\//, '');
    return base.replace(/\/$/, '') + '/' + String(href || '').replace(/^\//, '');
  }
  function pathsMatch(pathname, href, site) {
    if (!pathname || !href || /^https?:/.test(href)) return false;
    var A = doneExpand(pathname), B = doneExpand(siteJoin(href, site)), i, j;
    for (i = 0; i < A.length; i++) for (j = 0; j < B.length; j++) if (A[i] === B[j]) return true;
    return false;
  }
  function matchItem(pathname, items, site) {
    if (!pathname || !items) return '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it && it.id && it.href && pathsMatch(pathname, it.href, site)) return it.id;
    }
    return '';
  }
  function findQueue(doc, itemId) {
    if (!doc || !Array.isArray(doc.queue)) return null;
    for (var i = 0; i < doc.queue.length; i++) if (doc.queue[i] && doc.queue[i].item === itemId) return { i: i, q: doc.queue[i] };
    return null;
  }
  // 写入 learned。已有更早的日期就留下。从不删除 learned。
  function applyLearned(doc, itemId, date) {
    if (!itemId || !isDate(date)) return null;
    var hit = findQueue(doc, itemId); if (!hit) return null;
    var cur = isDate(hit.q.learned) ? hit.q.learned : '';
    var next = earlier(cur, date);
    if (!next || next === cur) return null;
    var rebuilt = { item: hit.q.item, learned: next };
    Object.keys(hit.q).forEach(function (k) { if (k !== 'item' && k !== 'learned') rebuilt[k] = hit.q[k]; });
    doc.queue[hit.i] = rebuilt;
    return { doc: doc, message: 'learn: ' + itemId + ' ' + next };
  }
  // changes: [{day, done, doneOn}]。done false 只改这一次复习，不动 learned。
  function applyReviews(doc, itemId, changes) {
    if (!itemId || !changes || !changes.length) return null;
    var hit = findQueue(doc, itemId); if (!hit || !Array.isArray(hit.q.reviews)) return null;
    var changed = false;
    changes.forEach(function (c) {
      var day = +c.day; if (!okDay(day)) return;
      var r = null;
      for (var i = 0; i < hit.q.reviews.length; i++) if (hit.q.reviews[i] && +hit.q.reviews[i].day === day) { r = hit.q.reviews[i]; break; }
      if (!r) return;
      if (c.done) {
        if (r.done !== true) { r.done = true; changed = true; }
        if (isDate(c.doneOn)) {
          var have = isDate(r.doneOn) ? r.doneOn : '';
          var next = earlier(have, c.doneOn);
          if (next && next !== have) { r.doneOn = next; changed = true; }
        }
      } else if (c.done === false) {
        if (r.done !== false) { r.done = false; changed = true; }
        if (Object.prototype.hasOwnProperty.call(r, 'doneOn')) { delete r.doneOn; changed = true; }
      }
    });
    if (!changed) return null;
    var days = changes.map(function (c) { return c.day; }).join(',');
    var undo = changes.every(function (c) { return c.done === false; });
    return { doc: doc, message: ('review: ' + itemId + ' ' + days + (undo ? ' undo' : ' done')).slice(0, 72) };
  }
  function diffRev(before, after) {
    before = before && typeof before === 'object' ? before : {};
    after = after && typeof after === 'object' ? after : {};
    var days = {}, changes = [];
    Object.keys(before).forEach(function (d) { days[d] = 1; });
    Object.keys(after).forEach(function (d) { days[d] = 1; });
    Object.keys(days).forEach(function (d) {
      if (!okDay(d)) return;
      var b = isDate(before[d]) ? before[d] : '', a = isDate(after[d]) ? after[d] : '';
      if (a && a !== b) changes.push({ day: +d, done: true, doneOn: a });
      else if (b && !a) changes.push({ day: +d, done: false });
    });
    changes.sort(function (x, y) { return x.day - y.day; });
    return changes;
  }
  // ---- 跨设备冲突：以最后一次操作为准（2026-10-26 王玮定）----
  // 每次在首页勾选或取消，本机记一条待上传操作 rev-op:<itemId> = {第几天: {done, on?, at}}，at 是操作时刻（毫秒）。
  // 云端 reviews[] 每条可带 at（ISO 时间），表示最后一次写入它的操作时刻。谁的 at 新听谁的：
  // 晚于云端的取消会留住，早于云端的旧记录不会把云端改回去。没有 at 的旧记录（本功能上线前）一律算更早。
  function atMs(v) { var n = typeof v === 'number' ? v : (typeof v === 'string' ? Date.parse(v) : NaN); return isFinite(n) && n > 0 ? n : 0; }
  function okOp(op) { return !!op && typeof op === 'object' && typeof op.done === 'boolean' && atMs(op.at) > 0; }
  // 一次复习的实际状态。r：云端那一行；local：本机 rev-done 里这一天的完成日期；op：本机待上传操作。
  // 首页内联脚本直接用这个函数的源码（build.mjs 注入），两边是同一份逻辑。
  function effReview(r, local, op) {
    var D = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
    var T = function (v) { var n = typeof v === 'number' ? v : (typeof v === 'string' ? Date.parse(v) : NaN); return isFinite(n) && n > 0 ? n : 0; };
    var ca = T(r && r.at);
    if (op && typeof op === 'object' && T(op.at) > ca) return op.done ? { done: true, on: D(op.on) } : { done: false, on: '' };
    if (ca) return r.done ? { done: true, on: D(r.doneOn) } : { done: false, on: '' };
    var l = D(local), c = r && r.done ? D(r.doneOn) : '';
    if (r && r.done) return { done: true, on: c && l ? (c < l ? c : l) : (c || l) };
    return l ? { done: true, on: l } : { done: false, on: '' };
  }
  // 把待上传操作写进 doc：只有比云端那一行更新的操作才生效。
  function applyOps(doc, itemId, ops) {
    if (!itemId || !ops || typeof ops !== 'object') return null;
    var hit = findQueue(doc, itemId); if (!hit || !Array.isArray(hit.q.reviews)) return null;
    var days = [], undo = true;
    Object.keys(ops).forEach(function (day) {
      var op = ops[day]; if (!okDay(day) || !okOp(op)) return;
      var r = null;
      for (var i = 0; i < hit.q.reviews.length; i++) if (hit.q.reviews[i] && +hit.q.reviews[i].day === +day) { r = hit.q.reviews[i]; break; }
      if (!r || atMs(op.at) <= atMs(r.at)) return;
      r.done = op.done;
      if (op.done) { if (isDate(op.on)) r.doneOn = op.on; }
      else if (Object.prototype.hasOwnProperty.call(r, 'doneOn')) delete r.doneOn;
      r.at = new Date(atMs(op.at)).toISOString();
      days.push(+day); if (op.done) undo = false;
    });
    if (!days.length) return null;
    days.sort(function (a, b) { return a - b; });
    return { doc: doc, message: ('review: ' + itemId + ' ' + days.join(',') + (undo ? ' undo' : ' done')).slice(0, 72) };
  }
  // 云端已经有同样新或更新的记录，本机操作就不用再传了；返回还要保留的操作。
  function pruneOps(doc, itemId, ops) {
    var hit = findQueue(doc, itemId), keep = {};
    Object.keys(ops || {}).forEach(function (day) {
      var op = ops[day]; if (!okDay(day) || !okOp(op)) return;
      var r = null;
      if (hit && Array.isArray(hit.q.reviews)) for (var i = 0; i < hit.q.reviews.length; i++) if (hit.q.reviews[i] && +hit.q.reviews[i].day === +day) { r = hit.q.reviews[i]; break; }
      if (!hit || !r) return; // 云端已没有这一次复习，丢掉
      if (atMs(op.at) > atMs(r.at)) keep[day] = op;
    });
    return keep;
  }
  // 本机记录并进 review.json。
  // 1. 待上传操作（rev-op）按「最后一次操作为准」写入，可以把 done 改回 false。
  // 2. 没有操作时间的旧本机记录（rev-done，上线前留下的）只补云端还没有 at 的那几天：只补 true、取更早的日期，不删 learned。
  //    云端那一天一旦有 at，说明之后有人明确操作过，旧记录一律更早，不再上传（取消不会被旧设备「复活」）。
  function mergeLocal(doc, local, items, site) {
    if (!doc || !Array.isArray(doc.queue)) return null;
    var copy = JSON.parse(JSON.stringify(doc));
    var learned = {}, done = (local && local.done) || {}, rev = (local && local.rev) || {}, ops = (local && local.ops) || {}, n = 0;
    Object.keys(done).forEach(function (path) {
      if (!okPath(path) || !isDate(done[path])) return;
      var id = matchItem(path, items, site); if (!id) return;
      learned[id] = earlier(learned[id], done[path]);
    });
    Object.keys(learned).forEach(function (id) { if (applyLearned(copy, id, learned[id])) n++; });
    Object.keys(ops).forEach(function (id) { if (okId(id) && applyOps(copy, id, ops[id])) n++; });
    Object.keys(rev).forEach(function (id) {
      if (!okId(id) || !rev[id] || typeof rev[id] !== 'object') return;
      var hit = findQueue(copy, id), changes = [];
      Object.keys(rev[id]).forEach(function (day) {
        if (!okDay(day) || !isDate(rev[id][day])) return;
        if (ops[id] && ops[id][day]) return;
        var r = null;
        if (hit && Array.isArray(hit.q.reviews)) for (var i = 0; i < hit.q.reviews.length; i++) if (hit.q.reviews[i] && +hit.q.reviews[i].day === +day) { r = hit.q.reviews[i]; break; }
        if (r && atMs(r.at)) return;
        changes.push({ day: +day, done: true, doneOn: rev[id][day] });
      });
      if (changes.length && applyReviews(copy, id, changes)) n++;
    });
    if (!n) return null;
    return { doc: copy, message: 'learn: sync local' };
  }
  var api = { isDate: isDate, earlier: earlier, beijingToday: beijingToday, okPath: okPath, okId: okId, okDay: okDay, doneExpand: doneExpand, pathsMatch: pathsMatch, matchItem: matchItem, applyLearned: applyLearned, applyReviews: applyReviews, diffRev: diffRev, mergeLocal: mergeLocal, atMs: atMs, effReview: effReview, applyOps: applyOps, pruneOps: pruneOps };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PROG = api;
  if (typeof document === 'undefined' || !GH) return;

  var me = document.currentScript && document.currentScript.src;
  var BASE = me ? me.replace(/assets\/progress\.js.*$/, '') : (location.origin + '/learning/');
  var SITE = '/';
  try { SITE = new URL(BASE, location.href).pathname || '/'; } catch (e) { SITE = '/'; }
  var pending = 0;
  function track(p) {
    pending++; root.__progPending = pending;
    return Promise.resolve(p).then(function (v) { pending--; root.__progPending = pending; return v; }, function (e) { pending--; root.__progPending = pending; throw e; });
  }
  function settingsHref() { return BASE + 'favorites/#settings'; }
  function paintHint() {
    var el = document.getElementById('prog-hint'); if (!el) return;
    if (GH.token()) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.innerHTML = '学完和复习先记在这台设备。到 <a href="' + settingsHref() + '">收藏页「同步设置」</a> 填一次令牌，收藏、学完和复习就能在各台电脑间同步。';
  }
  function hintLearn() {
    if (document.getElementById('prog-hint') && !document.getElementById('prog-hint').hidden) return;
    GH.toast('已记在这台设备。在收藏页「同步设置」填一次令牌，各台电脑就能同步 · <a href="' + settingsHref() + '">去设置</a>', 5000);
  }
  function doneKeys(seed) {
    return doneExpand(seed || location.pathname);
  }
  function currentDoneDate(seed) {
    var keys = doneKeys(seed);
    for (var i = 0; i < keys.length; i++) { var d = localStorage.getItem('done:' + keys[i]); if (d) return d; }
    return null;
  }
  var catalogP = null;
  function catalog() {
    if (!catalogP) catalogP = fetch(BASE + 'data/items.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : { items: [] }; }).then(function (j) {
      return (j.items || []).filter(function (it) { return it && it.id && it.href && !/^https?:/.test(it.href); }).map(function (it) { return { id: it.id, href: it.href }; });
    }).catch(function () { return []; });
    return catalogP;
  }
  function collectLocal() {
    var done = {}, rev = {}, ops = {}, i, k, v, o, day, m;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i); if (!k) continue;
        if (k.indexOf('done:') === 0) { v = localStorage.getItem(k); if (okPath(k.slice(5)) && isDate(v)) done[k.slice(5)] = v; }
        else if (k.indexOf('rev-done:') === 0) {
          if (!okId(k.slice(9))) continue;
          try { o = JSON.parse(localStorage.getItem(k) || ''); } catch (e) { o = null; }
          if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
          m = {}; for (day in o) if (okDay(day) && isDate(o[day])) m[day] = o[day];
          if (Object.keys(m).length) rev[k.slice(9)] = m;
        }
        else if (k.indexOf('rev-op:') === 0) { if (okId(k.slice(7))) { o = readOps(k.slice(7)); if (Object.keys(o).length) ops[k.slice(7)] = o; } }
      }
    } catch (e) {}
    return { done: done, rev: rev, ops: ops };
  }
  function readOps(id) {
    var o = null, out = {};
    try { o = JSON.parse(localStorage.getItem('rev-op:' + id) || '{}'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    for (var day in o) if (okDay(day) && okOp(o[day])) out[day] = o[day];
    return out;
  }
  function writeOps(id, o) { try { if (!o || !Object.keys(o).length) localStorage.removeItem('rev-op:' + id); else localStorage.setItem('rev-op:' + id, JSON.stringify(o)); } catch (e) {} }
  // 提交（或发现云端更新）之后：按云端结果清掉已经落地或已经过时的本机操作，再把最新的 review.json 交给首页重画。
  function settle(res) {
    var doc = res && res.doc;
    if (!doc || !Array.isArray(doc.queue)) return res;
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i); if (!k || k.indexOf('rev-op:') !== 0) continue;
        var id = k.slice(7); if (!okId(id)) continue;
        writeOps(id, pruneOps(doc, id, readOps(id)));
      }
    } catch (e) {}
    try { root.dispatchEvent(new CustomEvent('prog-doc', { detail: doc })); } catch (e) {}
    return res;
  }
  function commitReview(mutate) {
    return GH.commitJson('data/review.json', GH.token(), function (doc, ctx) {
      if (ctx.missing || !doc || !Array.isArray(doc.queue)) throw new Error('读不到 data/review.json');
      return mutate(doc);
    });
  }
  function pushLearned() {
    var date = beijingToday();
    return track(catalog().then(function (items) {
      var id = matchItem(location.pathname, items, SITE);
      if (!id) { GH.toast('已记在本机。复习队列里没有这个地址，没有写入仓库', 5000); return null; }
      return commitReview(function (doc) { return applyLearned(doc, id, date); }).then(function (res) {
        GH.toast(!res || res.skipped ? '云端已有更早的学完日期，未改动' : '已同步学完日期');
        return res;
      });
    })).catch(function (e) { GH.toast('没保存成功：' + e.message, 5000); });
  }
  // 首页勾选或取消后调用。首页先把操作写进 rev-op:<id>，这里把它传上去；旧页面没写操作时退回按 rev-done 前后差异提交。
  function onReview(id, before, after) {
    var ops = okId(id) ? readOps(id) : {};
    var useOps = Object.keys(ops).length > 0;
    var changes = useOps ? Object.keys(ops).map(function (d) { return { day: +d, done: ops[d].done }; }) : diffRev(before, after);
    if (!changes.length) return;
    if (!GH.token()) { if (changes.some(function (c) { return c.done; })) hintLearn(); return; }
    track(commitReview(function (doc) { return useOps ? applyOps(doc, id, ops) : applyReviews(doc, id, changes); }).then(settle).then(function (res) {
      if (!res || res.skipped) return res;
      GH.toast(changes.every(function (c) { return c.done === false; }) ? '已取消这次复习的云端记录' : '已同步复习进度');
      return res;
    })).catch(function (e) { GH.toast('没保存成功：' + e.message, 5000); });
  }
  function syncLocal() {
    if (!GH.token()) return Promise.resolve(null);
    return track(catalog().then(function (items) {
      return commitReview(function (doc) { return mergeLocal(doc, collectLocal(), items, SITE); });
    })).then(settle).then(function (res) {
      if (res && !res.skipped) GH.toast('已把本机进度补写到仓库');
      return res;
    }).catch(function (e) { GH.toast('进度没同步上：' + e.message, 5000); return null; });
  }
  function noteBtn(b) {
    if (!b || GH.token() || currentDoneDate()) return;
    b.title = '先记在这台设备。到收藏页「同步设置」可写入仓库';
  }
  function hookFinish() {
    var b = document.querySelector('.fin-btn');
    if (!b || b.dataset.prog) return;
    b.dataset.prog = '1';
    var orig = b.onclick;
    b.onclick = function () {
      var before = currentDoneDate();
      if (typeof orig === 'function') orig.call(b);
      var after = currentDoneDate();
      noteBtn(b);
      if (after && after !== before) { if (!GH.token()) hintLearn(); else pushLearned(); }
      else if (before && !after && GH.token()) GH.toast('本机已取消。云端的学完日期会保留');
    };
    noteBtn(b);
  }
  function boot() {
    hookFinish(); paintHint();
    syncLocal().then(function () { root.__progReady = 1; }, function () { root.__progReady = 1; });
  }
  root.addEventListener('gh-token', function () { paintHint(); if (GH.token()) syncLocal(); });
  root.PROG = Object.assign(api, { onReview: onReview, syncLocal: syncLocal, settingsHref: settingsHref, hookFinish: hookFinish });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
