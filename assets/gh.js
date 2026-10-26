/* 仓库写入：收藏和学习进度共用。令牌在 localStorage fav:token，走 GitHub Contents API。
   sha 冲突（409/422）会重读重试。页面先加载本文件，再加载 favorites.js / progress.js。 */
(function (root) {
  var REPO = 'ww880412/learning', BRANCH = 'main', TK = 'fav:token';
  function api(file) { return 'https://api.github.com/repos/' + REPO + '/contents/' + file; }
  function b64enc(s) { return typeof Buffer !== 'undefined' && typeof btoa === 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s))); }
  function b64dec(s) { s = String(s == null ? '' : s).replace(/\s/g, ''); return typeof Buffer !== 'undefined' && typeof atob === 'undefined' ? Buffer.from(s, 'base64').toString('utf8') : decodeURIComponent(escape(atob(s))); }
  function headers(token) { return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; }
  var chains = {};
  // mutate(doc, {missing, sha}) → {doc, message}，或 null 表示不写。
  // 同一文件的提交串行执行，避免两笔同时拿旧 sha。
  function commitJson(file, token, mutate, f, tries) {
    f = f || fetch; tries = tries || 4;
    var run = async function () {
      var url = api(file), h = headers(token);
      for (var i = 0; i < tries; i++) {
        var r = await f(url + '?ref=' + BRANCH + '&t=' + Date.now(), { headers: h, cache: 'no-store' });
        var sha = null, doc = null, missing = false;
        if (r.status === 200) {
          var j = await r.json(); sha = j.sha;
          // 文件存在但读不懂（坏 JSON、内容为空）就报错、不写：不能拿空列表把整个文件覆盖掉。只有 404 才允许从空白初始化。
          try { doc = JSON.parse(b64dec(j.content)); } catch (e) { throw new Error(file + ' 内容损坏，没有写入（请先修好仓库里的这个文件）'); }
        } else if (r.status === 404) missing = true;
        else throw new Error(r.status === 401 ? '令牌无效或已过期' : r.status === 403 ? '令牌没有写权限（需要 Contents: Read and write）' : '读取失败 ' + r.status);
        var out = mutate(doc, { missing: missing, sha: sha });
        if (!out) return { doc: doc, skipped: true };
        var body = { message: String(out.message || ('update ' + file)).slice(0, 72), branch: BRANCH, content: b64enc(JSON.stringify(out.doc, null, 2) + '\n') };
        if (sha) body.sha = sha;
        var p = await f(url, { method: 'PUT', headers: h, body: JSON.stringify(body) });
        if (p.status === 200 || p.status === 201) return { doc: out.doc, skipped: false };
        if (p.status === 409 || p.status === 422) continue;
        throw new Error(p.status === 401 ? '令牌无效或已过期' : p.status === 403 || p.status === 404 ? '令牌没有这个仓库的写权限' : '保存失败 ' + p.status);
      }
      throw new Error('多次冲突，稍后再试');
    };
    var tail = chains[file] || Promise.resolve();
    var next = tail.then(run, run);
    chains[file] = next.then(function () {}, function () {});
    return next;
  }
  function token() { try { return localStorage.getItem(TK) || ''; } catch (e) { return ''; } }
  function toast(html, ms) {
    if (typeof document === 'undefined') return;
    var css = document.getElementById('gh-toast-css');
    if (!css) {
      css = document.createElement('style'); css.id = 'gh-toast-css';
      css.textContent = '.fav-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink,#16202c);color:var(--paper,#fff);padding:8px 16px;border-radius:8px;font-size:14px;z-index:99;max-width:90vw}.fav-toast a{color:inherit;text-decoration:underline}body:has(.fin-btn) .fav-toast{bottom:96px}';
      document.head.appendChild(css);
    }
    var t = document.createElement('div'); t.className = 'fav-toast'; t.innerHTML = html;
    (document.body || document.documentElement).appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, ms || 3200);
  }
  var core = { REPO: REPO, BRANCH: BRANCH, TK: TK, api: api, b64enc: b64enc, b64dec: b64dec, headers: headers, commitJson: commitJson, token: token, toast: toast };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  root.GH = core;
})(typeof window !== 'undefined' ? window : globalThis);
