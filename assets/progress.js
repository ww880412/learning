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
  // 写入 learned。已有更早的日期就留下。从不删除 learned，也不删队列条目：
  // 学完记在这条上，没加入复习只是 reviews 为空，条目还在，否则学完写不进云端。
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
  // 间隔仍是 1/3/7/14/30。起算日是用户点「加入复习」的北京日期，不是学完日。
  var INTERVALS = [1, 3, 7, 14, 30];
  function addDays(d, n) {
    if (!isDate(d)) return '';
    var p = d.split('-'), t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    t.setUTCDate(t.getUTCDate() + n);
    var y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, day = t.getUTCDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  // 是否已加入复习。local 是本机 rev-join（{joined, at}），比云端 joinAt 新才算。
  // joined 为空表示取消。首页内联脚本注入的是这份源码，必须自包含。
  function effectiveJoin(q, local) {
    var D = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
    var T = function (v) { var n = typeof v === 'number' ? v : (typeof v === 'string' ? Date.parse(v) : NaN); return isFinite(n) && n > 0 ? n : 0; };
    var ca = T(q && q.joinAt);
    if (local && typeof local === 'object' && T(local.at) > ca) return D(local.joined);
    return D(q && q.joined);
  }
  function readJoinOp(op) {
    if (!op || typeof op !== 'object' || Array.isArray(op)) return null;
    var at = atMs(op.at); if (!at) return null;
    if (op.joined && !isDate(op.joined)) return null;
    return { joined: isDate(op.joined) ? op.joined : '', at: at };
  }
  // 加入或取消复习。op.joined 是北京日期表示加入，空字符串表示取消。比云端 joinAt 旧的操作丢掉。
  // 加入会按当天重排 1/3/7/14/30，不沿用学完日，也不保留加入之前的 done（避免旧的自动复习被勾回来）。
  // 同一天重复加入、进度还在，就不重排。取消清掉 joined 和 reviews，留下 joinAt，learned 不动。
  function applyEnroll(doc, itemId, op) {
    op = readJoinOp(op);
    if (!okId(itemId) || !op) return null;
    var hit = findQueue(doc, itemId); if (!hit) return null;
    if (op.at <= atMs(hit.q.joinAt)) return null;
    var q = hit.q, isoAt = new Date(op.at).toISOString();
    if (op.joined) {
      if (q.joined === op.joined && Array.isArray(q.reviews) && q.reviews.length) return null;
      q.joined = op.joined;
      q.joinAt = isoAt;
      q.reviews = INTERVALS.map(function (n) { return { day: n, date: addDays(op.joined, n), done: false, at: isoAt }; });
      return { doc: doc, message: ('review: join ' + itemId + ' ' + op.joined).slice(0, 72) };
    }
    if (!isDate(q.joined) && !(Array.isArray(q.reviews) && q.reviews.length) && q.joinAt === isoAt) return null;
    if (Object.prototype.hasOwnProperty.call(q, 'joined')) delete q.joined;
    q.joinAt = isoAt;
    q.reviews = [];
    return { doc: doc, message: ('review: unjoin ' + itemId).slice(0, 72) };
  }
  function pruneJoin(doc, itemId, op) {
    op = readJoinOp(op);
    if (!op) return null;
    var hit = findQueue(doc, itemId);
    if (!hit) return op;
    return op.at > atMs(hit.q.joinAt) ? op : null;
  }
  function enrolledQueue(doc, itemId) {
    var hit = findQueue(doc, itemId);
    return !!(hit && isDate(hit.q.joined));
  }
  // 本机记录并进 review.json。
  // 1. 「学完了」（done:）只补 learned，不排复习。
  // 2. 「加入复习 / 取消」（rev-join）按最后一次操作为准，写入 joined / joinAt / reviews。
  // 3. 复习勾选（rev-op、rev-done）只作用在已经加入的条目上。没加入的，旧操作直接丢掉，不能把自动复习写回来。
  // 4. 没有操作时间的旧 rev-done 只补「已加入、且这一天还没有 at」的行。新排出来的每一天都带 at，旧记录补不进去。
  function mergeLocal(doc, local, items, site) {
    if (!doc || !Array.isArray(doc.queue)) return null;
    var copy = JSON.parse(JSON.stringify(doc));
    var learned = {}, done = (local && local.done) || {}, rev = (local && local.rev) || {}, ops = (local && local.ops) || {}, joins = (local && local.joins) || {}, n = 0;
    Object.keys(done).forEach(function (path) {
      if (!okPath(path) || !isDate(done[path])) return;
      var id = matchItem(path, items, site); if (!id) return;
      learned[id] = earlier(learned[id], done[path]);
    });
    Object.keys(learned).forEach(function (id) { if (applyLearned(copy, id, learned[id])) n++; });
    Object.keys(joins).forEach(function (id) { if (okId(id) && applyEnroll(copy, id, joins[id])) n++; });
    Object.keys(ops).forEach(function (id) { if (okId(id) && enrolledQueue(copy, id) && applyOps(copy, id, ops[id])) n++; });
    Object.keys(rev).forEach(function (id) {
      if (!okId(id) || !rev[id] || typeof rev[id] !== 'object' || !enrolledQueue(copy, id)) return;
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
  // 首页「继续学」只留还没点「学完了」的一篇。list 按开始日从新到旧。
  // 学完 = 队列里有 learned，或 doneOf(href) 非空（本机 done:<路径>，路径展开由调用方的 doneOf 负责）。
  // 不看复习勾选，不改排期。源码会注入首页脚本，必须自包含。
  function nextContinue(list, queue, items, doneOf) {
    var i, c, q, j, id, k, local;
    list = list || [];
    queue = queue || [];
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (!c) continue;
      q = null;
      id = c.id || '';
      if (!id && c.href && items) {
        for (k in items) if (items[k] && items[k].href === c.href) { id = k; break; }
      }
      if (id) for (j = 0; j < queue.length; j++) if (queue[j] && queue[j].item === id) { q = queue[j]; break; }
      local = (c.href && typeof doneOf === 'function') ? doneOf(c.href) : '';
      if (local) continue;
      if (q && q.learned) continue;
      return c;
    }
    return null;
  }
  var api = { isDate: isDate, earlier: earlier, beijingToday: beijingToday, okPath: okPath, okId: okId, okDay: okDay, doneExpand: doneExpand, pathsMatch: pathsMatch, matchItem: matchItem, applyLearned: applyLearned, applyReviews: applyReviews, diffRev: diffRev, mergeLocal: mergeLocal, atMs: atMs, effReview: effReview, applyOps: applyOps, pruneOps: pruneOps, nextContinue: nextContinue, INTERVALS: INTERVALS, addDays: addDays, effectiveJoin: effectiveJoin, readJoinOp: readJoinOp, applyEnroll: applyEnroll, pruneJoin: pruneJoin };
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
    el.innerHTML = '学完、加入复习和复习勾选先记在这台设备。到 <a href="' + settingsHref() + '">收藏页「同步设置」</a> 填一次令牌，就能在各台电脑间同步。';
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
  function readJoin(id) {
    var o = null;
    try { o = JSON.parse(localStorage.getItem('rev-join:' + id) || 'null'); } catch (e) { o = null; }
    return readJoinOp(o);
  }
  function writeJoin(id, op) {
    try {
      if (!op) localStorage.removeItem('rev-join:' + id);
      else localStorage.setItem('rev-join:' + id, JSON.stringify({ joined: op.joined || '', at: op.at }));
    } catch (e) {}
  }
  function collectLocal() {
    var done = {}, rev = {}, ops = {}, joins = {}, i, k, v, o, day, m, jn;
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
        else if (k.indexOf('rev-join:') === 0) { if (okId(k.slice(9))) { jn = readJoin(k.slice(9)); if (jn) joins[k.slice(9)] = jn; } }
      }
    } catch (e) {}
    return { done: done, rev: rev, ops: ops, joins: joins };
  }
  // 没加入复习的条目：丢掉本机还没传上去的 rev-done / rev-op，避免以后一加入就把旧的自动复习勾回来。
  function scrubDoc(doc) {
    if (!doc || !Array.isArray(doc.queue)) return;
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i); if (!k) continue;
        var id = '';
        if (k.indexOf('rev-done:') === 0) id = k.slice(9);
        else if (k.indexOf('rev-op:') === 0) id = k.slice(7);
        else continue;
        if (!okId(id)) continue;
        var hit = findQueue(doc, id);
        if (!effectiveJoin(hit && hit.q, readJoin(id))) localStorage.removeItem(k);
      }
    } catch (e) {}
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
  var reviewDoc = null;
  function settle(res) {
    var doc = res && res.doc;
    if (!doc || !Array.isArray(doc.queue)) return res;
    reviewDoc = doc;
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i); if (!k) continue;
        if (k.indexOf('rev-op:') === 0) {
          var id = k.slice(7); if (!okId(id)) continue;
          writeOps(id, pruneOps(doc, id, readOps(id)));
        } else if (k.indexOf('rev-join:') === 0) {
          var id2 = k.slice(9); if (!okId(id2)) continue;
          writeJoin(id2, pruneJoin(doc, id2, readJoin(id2)));
        }
      }
    } catch (e) {}
    paintJoins();
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
      return commitReview(function (doc) { scrubDoc(doc); return mergeLocal(doc, collectLocal(), items, SITE); });
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
  function joinedNow(id) {
    var hit = reviewDoc && findQueue(reviewDoc, id);
    return !!effectiveJoin(hit && hit.q, readJoin(id));
  }
  function paintJoin(b) {
    if (!b) return;
    var on = joinedNow(b.getAttribute('data-item'));
    b.classList.toggle('on', on);
    b.textContent = on ? '取消复习' : '加入复习';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? '已加入复习，点此取消。已排的日期会清掉' : '按第 1、3、7、14、30 天排复习，从今天算起';
  }
  function paintJoins() { var list = document.querySelectorAll('button.rev-join'); for (var i = 0; i < list.length; i++) paintJoin(list[i]); }
  function setJoin(id, on) {
    var op = { joined: on ? beijingToday() : '', at: Date.now() };
    if (on && !isDate(op.joined)) { GH.toast('没有取到今天的日期，没有加入复习'); return; }
    writeJoin(id, op);
    try { localStorage.removeItem('rev-done:' + id); localStorage.removeItem('rev-op:' + id); } catch (e) {}
    paintJoins();
    if (!GH.token()) {
      hintLearn();
      try { root.dispatchEvent(new CustomEvent('prog-doc', { detail: reviewDoc })); } catch (e) {}
      return Promise.resolve(null);
    }
    return track(commitReview(function (doc) { scrubDoc(doc); return applyEnroll(doc, id, op); }).then(settle).then(function (res) {
      if (!res) return res;
      if (res.skipped) {
        var hit = findQueue(res.doc, id);
        GH.toast(!hit ? '复习队列里没有这篇，没有写入仓库' : (on ? '已经在复习里' : '已经取消过了'), 5000);
      } else GH.toast(on ? '已加入复习，从今天起按 1/3/7/14/30 天' : '已取消这篇的复习');
      return res;
    })).catch(function (e) { GH.toast('没保存成功：' + e.message, 5000); });
  }
  function bindJoin(b) {
    if (!b || b.dataset.bound) return;
    b.dataset.bound = '1';
    b.type = 'button';
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var id = b.getAttribute('data-item'); if (!okId(id) || b.classList.contains('busy')) return;
      var on = joinedNow(id);
      if (on && !confirm('取消这篇的复习？已排的日期会清掉。')) return;
      b.classList.add('busy');
      Promise.resolve(setJoin(id, !on)).then(function () { b.classList.remove('busy'); paintJoin(b); }, function () { b.classList.remove('busy'); });
    });
    paintJoin(b);
  }
  function mountJoin() {
    var css = document.getElementById('rev-join-css');
    if (!css) {
      css = document.createElement('style'); css.id = 'rev-join-css';
      css.textContent = '.rev-join{display:inline-flex;align-items:center;justify-content:center;min-height:36px;margin:0 0 0 8px;padding:4px 12px;border-radius:999px;border:1px solid var(--hair,#e5e7eb);background:var(--sheet,#fff);color:var(--ink,#111);font:600 13px/1.2 var(--font,system-ui);cursor:pointer;vertical-align:middle}.rev-join:hover{border-color:var(--blue,#2563eb);color:var(--blue,#2563eb)}.rev-join.on{background:var(--blue-soft,#eff4ff);color:var(--blue,#2563eb);border-color:transparent}.rev-join.busy{opacity:.45;pointer-events:none}.hero .links .rev-join{margin:0}';
      document.head.appendChild(css);
    }
    var preset = document.querySelectorAll('button.rev-join[data-item]');
    for (var i = 0; i < preset.length; i++) bindJoin(preset[i]);
    if (document.querySelector('button.rev-join[data-self]')) return;
    catalog().then(function (items) {
      var id = matchItem(location.pathname, items, SITE); if (!id) return;
      var host = document.querySelector('.hero .links') || document.querySelector('main .deck') || document.querySelector('main');
      if (!host || host.querySelector('button.rev-join')) return;
      var b = document.createElement('button');
      b.className = 'rev-join'; b.dataset.item = id; b.dataset.self = '1';
      if (host.classList.contains('links')) host.appendChild(b);
      else { b.style.margin = '12px 0'; host.insertBefore(b, host.firstChild); }
      bindJoin(b);
    });
  }
  function loadReview() {
    var tk = ''; try { tk = GH.token(); } catch (e) {}
    var pub = function () { return fetch(BASE + 'data/review.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }); };
    var dec = function (j) { try { return j && j.content ? JSON.parse(decodeURIComponent(escape(atob(String(j.content).replace(/\s/g, ''))))) : null; } catch (e) { return null; } };
    var p = tk ? fetch('https://api.github.com/repos/ww880412/learning/contents/data/review.json?ref=main&t=' + Date.now(), { headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json' }, cache: 'no-store' }).then(function (r) { return r.ok ? r.json().then(dec) : pub(); }).catch(pub) : pub();
    return p.then(function (doc) {
      if (doc && Array.isArray(doc.queue)) { reviewDoc = doc; scrubDoc(doc); paintJoins(); }
      return doc;
    }).catch(function () { return null; });
  }
  function boot() {
    hookFinish(); mountJoin(); paintHint();
    loadReview();
    syncLocal().then(function () { root.__progReady = 1; }, function () { root.__progReady = 1; });
  }
  root.addEventListener('gh-token', function () { paintHint(); loadReview(); if (GH.token()) syncLocal(); });
  root.PROG = Object.assign(api, { onReview: onReview, syncLocal: syncLocal, settingsHref: settingsHref, hookFinish: hookFinish });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
