/* 收藏：全站共享脚本。列表存在仓库 favorites.json（公开，只存标题/链接/标签）。
   写入用浏览器 localStorage 里的 fine-grained token 调 GitHub Contents API。 */
(function (root) {
  var REPO = 'ww880412/learning', BRANCH = 'main', FILE = 'favorites.json', TK = 'fav:token', CK = 'fav:cache';
  var API = 'https://api.github.com/repos/' + REPO + '/contents/' + FILE;
  // ---------- 纯逻辑（可在 node 里测试） ----------
  function norm(list) { return Array.isArray(list) ? list.filter(function (x) { return x && x.url; }) : []; }
  function applyOp(list, op) {
    list = norm(list).filter(function (x) { return x.url !== op.item.url; });
    if (op.type === 'add') list.unshift(op.item);
    return list;
  }
  function b64enc(s) { return typeof Buffer !== 'undefined' && typeof btoa === 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s))); }
  function b64dec(s) { s = s.replace(/\s/g, ''); return typeof Buffer !== 'undefined' && typeof atob === 'undefined' ? Buffer.from(s, 'base64').toString('utf8') : decodeURIComponent(escape(atob(s))); }
  // 读最新 → 合并 → PUT（带 sha）；sha 冲突（409/422）就重读重试
  async function commitOp(op, token, f, tries) {
    f = f || fetch; tries = tries || 4;
    var h = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    for (var i = 0; i < tries; i++) {
      var r = await f(API + '?ref=' + BRANCH + '&t=' + Date.now(), { headers: h, cache: 'no-store' });
      var sha = null, list = [];
      if (r.status === 200) { var j = await r.json(); sha = j.sha; try { list = JSON.parse(b64dec(j.content)).items; } catch (e) { list = []; } }
      else if (r.status !== 404) throw new Error(r.status === 401 ? '令牌无效或已过期' : r.status === 403 ? '令牌没有写权限（需要 Contents: Read and write）' : '读取失败 ' + r.status);
      list = applyOp(list, op);
      var body = { message: (op.type === 'add' ? 'fav: + ' : 'fav: - ') + (op.item.title || op.item.url).slice(0, 60), branch: BRANCH,
        content: b64enc(JSON.stringify({ version: 1, items: list }, null, 2) + '\n') };
      if (sha) body.sha = sha;
      var p = await f(API, { method: 'PUT', headers: h, body: JSON.stringify(body) });
      if (p.status === 200 || p.status === 201) return list;
      if (p.status === 409 || p.status === 422) continue;
      throw new Error(p.status === 401 ? '令牌无效或已过期' : p.status === 403 || p.status === 404 ? '令牌没有这个仓库的写权限' : '保存失败 ' + p.status);
    }
    throw new Error('多次冲突，稍后再试');
  }
  var core = { applyOp: applyOp, commitOp: commitOp, b64enc: b64enc, b64dec: b64dec, API: API };
  if (typeof module !== 'undefined') { module.exports = core; return; }

  // ---------- 浏览器 ----------
  var me = document.currentScript && document.currentScript.src;
  var BASE = me ? me.replace(/assets\/favorites\.js.*$/, '') : location.origin + '/learning/';
  var SITE = new URL(BASE).pathname; // /learning/
  var token = function () { try { return localStorage.getItem(TK) || ''; } catch (e) { return ''; } };
  var list = []; try { list = JSON.parse(localStorage.getItem(CK) || '[]'); } catch (e) {}
  var has = function (u) { return list.some(function (x) { return x.url === u; }); };
  var css = '.fav-b{background:none;border:none;cursor:pointer;font-size:17px;line-height:1;padding:2px 4px;color:var(--ink2);opacity:.55;vertical-align:middle}.fav-b:hover{opacity:1}.fav-b.on{color:#e0a100;opacity:1}.fav-b svg{display:block}.fav-b .fill{fill:currentColor}' +
    '.fav-b.busy{opacity:.3;pointer-events:none}.card .fav-b{position:absolute;right:12px;bottom:10px;z-index:2}.pc .fav-b{float:right}' +
    '.fav-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:var(--paper);padding:8px 16px;border-radius:8px;font-size:14px;z-index:99;max-width:90vw}' +
    '.fav-toast a{color:inherit;text-decoration:underline}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  function toast(html, ms) { var t = document.createElement('div'); t.className = 'fav-toast'; t.innerHTML = html; document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 3200); }
  function absUrl(u) { var x = new URL(u, location.href); return x.origin === location.origin ? x.pathname + x.hash : x.href; }
  var buttons = [];
  function paint() { buttons.forEach(function (b) { var on = has(b._item.url); b.classList.toggle('on', on); b.innerHTML = root.__ic ? root.__ic('star', 18, on ? 'fill' : '') : (on ? '★' : '☆'); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? '取消收藏' : '收藏'); b.title = on ? '已收藏，点一下取消' : '收藏'; }); if (root.__favRender) root.__favRender(list); }
  function setList(l) { list = l; try { localStorage.setItem(CK, JSON.stringify(l)); } catch (e) {} paint(); }
  async function load() {
    try {
      if (token()) { var r = await fetch(API + '?ref=' + BRANCH + '&t=' + Date.now(), { headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json' }, cache: 'no-store' });
        if (r.ok) { var j = await r.json(); return setList(JSON.parse(b64dec(j.content)).items || []); } }
      var p = await fetch(BASE + FILE + '?t=' + Date.now(), { cache: 'no-store' });
      if (p.ok) setList((await p.json()).items || []); else if (p.status === 404) setList([]);
    } catch (e) { paint(); }
  }
  async function toggle(b) {
    var it = b._item;
    if (!token()) { toast('收藏需要先在本浏览器设置一次 GitHub 令牌 · <a href="' + BASE + 'favorites/#settings">去设置</a>', 5000); return; }
    var add = !has(it.url), item = Object.assign({}, it);
    if (add) {
      var tg = prompt('收藏「' + it.title.slice(0, 40) + '」\n可加标签（逗号分隔，可留空）：', (it.tags || []).join(', '));
      if (tg === null) return;
      item.tags = tg.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean); item.added_at = new Date().toISOString(); item.note = item.note || '';
    }
    b.classList.add('busy');
    try { setList(await commitOp({ type: add ? 'add' : 'remove', item: item }, token())); toast(add ? '已收藏' : '已取消收藏'); }
    catch (e) { toast('没保存成功：' + e.message, 5000); }
    b.classList.remove('busy');
  }
  function star(item, host, before) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'fav-b'; b._item = item;
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggle(b); });
    before ? host.insertBefore(b, before) : host.appendChild(b); buttons.push(b); return b;
  }
  var clean = function (s) { return (s || '').replace(/\s+/g, ' ').trim(); };
  function typeOf(p) { p = p.slice(SITE.length); return /^x-brief\//.test(p) ? 'x-brief' : /^x-posters\//.test(p) ? 'poster' : /^concepts\//.test(p) || p === 'glossary.html' ? 'concept' : /^courses\//.test(p) ? 'course' : 'page'; }
  function init() {
    if (location.pathname.indexOf(SITE + 'favorites') === 0) { /* 收藏页本身不加页面星 */ }
    else {
      var dm = document.querySelector('.top .dm'), h1 = document.querySelector('main h1');
      var title = clean((h1 && h1.textContent) || document.title.split(' · ')[0]);
      var pth = location.pathname; var tp = typeOf(pth);
      if (dm) star({ url: pth, title: title, type: tp, tags: [] }, dm.parentNode, dm);
    }
    // X 简报：每条带 X 原帖链接的 li
    document.querySelectorAll('main li').forEach(function (li) {
      var a = li.querySelector('a[href*="x.com/"],a[href*="twitter.com/"]'); if (!a || li.closest('.quick')) return;
      var sec = li.closest('section') ; var h = null, n = li; while (n && !h) { n = n.previousElementSibling || (n.parentNode && n.parentNode !== sec ? n.parentNode : null); if (n && /^H[23]$/.test(n.tagName)) h = n; }
      var who = clean(li.querySelector('b') ? li.querySelector('b').textContent : '');
      var txt = clean(li.textContent.replace(/（原帖）|原帖/g, '')); var t = (h && h.tagName === 'H3' ? clean(h.textContent) + ' · ' : '') + txt.slice(0, 70) + (txt.length > 70 ? '…' : '');
      var h2 = li.closest('section') && Array.prototype.filter.call(li.closest('section').querySelectorAll('h2'), function (x) { return x.compareDocumentPosition(li) & 4; }).pop();
      star({ url: a.href, title: t, type: 'x-brief', tags: [who, h2 ? clean(h2.textContent).replace(/^\d+\.\s*/, '') : ''].filter(Boolean), note: '' , page: absUrl(location.href.split('#')[0] + (h2 && h2.id ? '#' + h2.id : '')) }, li);
    });
    // 海报卡
    document.querySelectorAll('section.pc').forEach(function (s) {
      var h3 = s.querySelector('h3'), xa = s.querySelector('.xi a[href*="x.com/"]'), img = s.querySelector('img'), who = s.querySelector('.xi .h');
      var it = { url: absUrl(location.pathname + '#' + s.id), title: clean(h3 && h3.textContent), type: 'poster', tags: [who ? clean(who.textContent) : ''].filter(Boolean), x: xa ? xa.href : '', img: img ? absUrl(img.getAttribute('src')) : '' };
      if (h3) star(it, h3.parentNode, h3);
    });
    // 卡片（概念卡、学习页卡片）
    document.querySelectorAll('main a.card[href]').forEach(function (c) {
      var h3 = c.querySelector('h3'); if (!h3) return; var u = absUrl(c.getAttribute('href'));
      star({ url: u, title: clean(h3.textContent), type: typeOf(new URL(c.href).pathname), tags: [] }, c);
    });
    paint(); load();
  }
  root.FAV = Object.assign(core, { base: BASE, token: token, list: function () { return list; }, setToken: function (t) { t ? localStorage.setItem(TK, t.trim()) : localStorage.removeItem(TK); load(); }, reload: load, toast: toast, toggleItem: async function (item) { setList(await commitOp({ type: 'remove', item: item }, token())); } });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})(typeof window !== 'undefined' ? window : globalThis);
