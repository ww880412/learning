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
  // 本机记录并进 review.json：只补、取更早的日期，不把云端 done 改回 false，不删 learned。
  function mergeLocal(doc, local, items, site) {
    if (!doc || !Array.isArray(doc.queue)) return null;
    var copy = JSON.parse(JSON.stringify(doc));
    var learned = {}, done = (local && local.done) || {}, rev = (local && local.rev) || {}, n = 0;
    Object.keys(done).forEach(function (path) {
      if (!okPath(path) || !isDate(done[path])) return;
      var id = matchItem(path, items, site); if (!id) return;
      learned[id] = earlier(learned[id], done[path]);
    });
    Object.keys(learned).forEach(function (id) { if (applyLearned(copy, id, learned[id])) n++; });
    Object.keys(rev).forEach(function (id) {
      if (!okId(id) || !rev[id] || typeof rev[id] !== 'object') return;
      var changes = [];
      Object.keys(rev[id]).forEach(function (day) { if (okDay(day) && isDate(rev[id][day])) changes.push({ day: +day, done: true, doneOn: rev[id][day] }); });
      if (changes.length && applyReviews(copy, id, changes)) n++;
    });
    if (!n) return null;
    return { doc: copy, message: 'learn: sync local' };
  }
  var api = { isDate: isDate, earlier: earlier, beijingToday: beijingToday, okPath: okPath, okId: okId, okDay: okDay, doneExpand: doneExpand, pathsMatch: pathsMatch, matchItem: matchItem, applyLearned: applyLearned, applyReviews: applyReviews, diffRev: diffRev, mergeLocal: mergeLocal };
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
    var done = {}, rev = {}, i, k, v, o, day, m;
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
      }
    } catch (e) {}
    return { done: done, rev: rev };
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
  function onReview(id, before, after) {
    var changes = diffRev(before, after);
    if (!changes.length) return;
    if (!GH.token()) { if (changes.some(function (c) { return c.done; })) hintLearn(); return; }
    track(commitReview(function (doc) { return applyReviews(doc, id, changes); }).then(function (res) {
      if (!res || res.skipped) return res;
      GH.toast(changes.every(function (c) { return c.done === false; }) ? '已取消这次复习的云端记录' : '已同步复习进度');
      return res;
    })).catch(function (e) { GH.toast('没保存成功：' + e.message, 5000); });
  }
  function syncLocal() {
    if (!GH.token()) return Promise.resolve(null);
    return track(catalog().then(function (items) {
      return commitReview(function (doc) { return mergeLocal(doc, collectLocal(), items, SITE); });
    })).then(function (res) {
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
