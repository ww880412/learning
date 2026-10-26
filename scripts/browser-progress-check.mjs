// 用无头 Chrome 和假的 GitHub API 检查：没令牌只写本机；有令牌时学完了 / 今日勾选 / 收藏打出正确的 PUT。
// 依赖：puppeteer-core（NODE_PATH）和本机 google-chrome。不使用真令牌。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const prog = require('../assets/progress.js');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REVIEW = fs.readFileSync(path.join(ROOT, 'data/review.json'), 'utf8');
const TOKEN = 'github_pat_testtoken1234';
const BJ = prog.beijingToday(new Date());
// 今日勾选的用例跟着 review.json 走：取 cs146s-L01 下一次没做的复习，用 ?today= 把那天调出来。
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const L01 = JSON.parse(REVIEW).queue.find((q) => q.item === 'cs146s-L01');
const L01_BASE = L01.learned || L01.start;
const L01_OPEN = L01.reviews.filter((r) => !r.done);
const TODAY = L01_OPEN.length ? [BJ, addDays(L01_BASE, L01_OPEN[0].day)].sort().pop() : BJ;
const DUE = L01_OPEN.filter((r) => addDays(L01_BASE, r.day) <= TODAY).map((r) => r.day);
const HOME = '/index.html?today=' + TODAY;
const SHOTS = process.env.SHOTS || '/workspace/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.md': 'text/plain' };

function startServer() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let u = decodeURIComponent((req.url || '/').split('?')[0]);
      if (u.endsWith('/')) u += 'index.html';
      const fp = path.normalize(path.join(ROOT, u));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(fp).pipe(res);
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

const mockSrc = `(() => {
  const REVIEW = ${JSON.stringify(REVIEW)};
  const state = { n: 1, files: {
    'favorites.json': { sha: 'fav1', text: JSON.stringify({ version: 1, items: [] }, null, 2) + '\\n' },
    'data/review.json': { sha: 'rev1', text: localStorage.getItem('__test:cloud-review') || REVIEW }
  }};
  window.__gh = [];
  function b64(s) { return btoa(unescape(encodeURIComponent(s))); }
  function unb64(s) { return decodeURIComponent(escape(atob(String(s).replace(/\\s/g, '')))); }
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('api.github.com') < 0) return orig(input, init);
    const method = (init && init.method) || 'GET';
    const headers = init && init.headers || {};
    const auth = headers.Authorization || headers.authorization || '';
    const path = decodeURIComponent(url.split('/contents/')[1].split('?')[0]);
    window.__gh.push({ url, path, method, body: init && init.body || null, auth });
    if (!auth.startsWith('Bearer ')) return { status: 401, ok: false, json: async () => ({}) };
    if (method === 'GET') {
      const cur = state.files[path];
      if (!cur) return { status: 404, ok: false, json: async () => ({}) };
      return { status: 200, ok: true, json: async () => ({ sha: cur.sha, content: b64(cur.text) }) };
    }
    if (method === 'PUT') {
      const body = JSON.parse(init.body);
      const cur = state.files[path];
      if (cur && body.sha && body.sha !== cur.sha) return { status: 409, ok: false, json: async () => ({}) };
      const text = unb64(body.content);
      state.files[path] = { sha: 'sha' + (++state.n), text };
      return { status: 201, ok: true, json: async () => ({ content: { sha: state.files[path].sha } }) };
    }
    return { status: 400, ok: false, json: async () => ({}) };
  };
})();`;

async function boot(browser, origin, { token } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    // Chrome 把网络失败再打一条不含地址的 console error。地址以 response 为准，站点本来就没有 favicon。
    if (/^Failed to load resource:/.test(t)) return;
    errors.push(t);
  });
  page.on('response', (res) => {
    if (res.status() < 400) return;
    const u = res.url();
    if (u.endsWith('/favicon.ico')) return;
    errors.push('HTTP ' + res.status() + ' ' + u);
  });
  const dialogs = [];
  let promptValue = '云同步';
  page.on('dialog', async (d) => { dialogs.push(d.type()); if (d.type() === 'prompt') await d.accept(promptValue); else await d.accept(); });
  await page.evaluateOnNewDocument((src, tok) => { if (tok) localStorage.setItem('fav:token', tok); eval(src); }, mockSrc, token || '');
  page._errors = errors; page._dialogs = dialogs; page._ctx = ctx;
  page._setPrompt = (v) => { promptValue = v; };
  return page;
}

async function puts(page, file) {
  return page.evaluate((file) => window.__gh.filter((c) => c.method === 'PUT' && (!file || c.path === file)).map((c) => ({ path: c.path, auth: c.auth, body: JSON.parse(c.body) })), file);
}
function decode(body, gh) {
  return JSON.parse(gh.b64dec(body.content));
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(name + ' PASS'); console.log('PASS', name); }
  catch (e) { results.push(name + ' FAIL\n' + e.stack); console.error('FAIL', name, e); }
}

const server = await startServer();
const origin = `http://127.0.0.1:${server.address().port}`;
const gh = require('../assets/gh.js');
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
});

try {
  await check('没令牌：学完了只写本机', async () => {
    const page = await boot(browser, origin);
    await page.goto(origin + '/courses/cs146s/L02-harness-anatomy.html', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__progReady === 1 && document.querySelector('.fin-btn'));
    const title = await page.$eval('.fin-btn', (b) => b.title);
    if (!title.includes('同步设置')) throw new Error('按钮提示不是同步设置：' + title);
    const callsBefore = await page.evaluate(() => window.__gh.length);
    if (callsBefore) throw new Error('没令牌却请求了 GitHub');
    await page.click('.fin-btn');
    await page.waitForFunction(() => document.querySelector('.fav-toast'));
    const toast = await page.$eval('.fav-toast', (el) => ({ text: el.textContent, href: el.querySelector('a') && el.querySelector('a').getAttribute('href') }));
    if (!toast.text.includes('已记在这台设备') || !toast.href.includes('favorites/#settings')) throw new Error('提示不对 ' + JSON.stringify(toast));
    const stored = await page.evaluate(() => localStorage.getItem('done:' + location.pathname));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stored || '')) throw new Error('本机没写下 done: ' + stored);
    const label = await page.$eval('.fin-btn', (b) => b.textContent);
    if (!label.includes('已学完')) throw new Error('按钮文案没变成已学完：' + label);
    if ((await page.evaluate(() => window.__gh.length)) !== 0) throw new Error('点击后仍请求了 GitHub');
    if (page._errors.length) throw new Error(page._errors.join('\n'));
    await page._ctx.close();
  });

  await check('有令牌：学完了 PUT learned，取消不删 learned', async () => {
    const page = await boot(browser, origin, { token: TOKEN });
    await page.goto(origin + '/courses/cs146s/L02-harness-anatomy.html', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__progReady === 1);
    const gets = await page.evaluate(() => window.__gh.filter((c) => c.method === 'PUT').length);
    if (gets) throw new Error('还没点击就 PUT 了');
    await page.click('.fin-btn');
    await page.waitForFunction(() => window.__gh.some((c) => c.method === 'PUT' && c.path === 'data/review.json'));
    await page.waitForFunction(() => !window.__progPending);
    const [put] = await puts(page, 'data/review.json');
    if (!put.auth.endsWith(TOKEN.slice(-8)) && put.auth !== 'Bearer ' + TOKEN) throw new Error('Authorization 不对 ' + put.auth);
    if (put.body.branch !== 'main' || put.body.sha !== 'rev1') throw new Error('PUT 缺少 branch/sha ' + JSON.stringify({ branch: put.body.branch, sha: put.body.sha }));
    if (!put.body.message.startsWith('learn: cs146s-L02')) throw new Error('提交说明不对 ' + put.body.message);
    const doc = decode(put.body, gh);
    const l02 = doc.queue.find((q) => q.item === 'cs146s-L02');
    const l01 = doc.queue.find((q) => q.item === 'cs146s-L01');
    const orig = JSON.parse(REVIEW);
    if (l02.learned !== BJ) throw new Error('learned 不是北京日期 ' + l02.learned + ' expected ' + BJ);
    if (l01.learned !== orig.queue.find((q) => q.item === 'cs146s-L01').learned) throw new Error('别的条目 learned 被改了');
    if (l02.reviews[0].done !== false) throw new Error('学完了不该改 reviews.done');
    await page.click('.fin-btn');
    await new Promise((r) => setTimeout(r, 600));
    const n = await page.evaluate(() => window.__gh.filter((c) => c.method === 'PUT').length);
    if (n !== 1) throw new Error('取消学完不应再 PUT，实际 ' + n);
    const still = await page.evaluate(() => localStorage.getItem('done:' + location.pathname));
    if (still) throw new Error('本机 done 没清掉');
    if (page._errors.length) throw new Error(page._errors.join('\n'));
    await page._ctx.close();
  });

  await check('没令牌：今日勾选只写本机，没有同步链接', async () => {
    const page = await boot(browser, origin);
    await page.goto(origin + HOME, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__progReady === 1 && document.querySelector('[data-id="rev:cs146s-L01"]'));
    const hint = await page.$eval('#prog-hint', (el) => ({ hidden: el.hidden, html: el.innerHTML }));
    if (hint.hidden || !hint.html.includes('favorites/#settings') || !hint.html.includes('同步设置')) throw new Error('首页提示不对 ' + JSON.stringify(hint));
    if (await page.$('#td-sync')) throw new Error('「同步到其他设备」应该去掉了');
    if ((await page.evaluate(() => document.body.innerText)).includes('同步到其他设备')) throw new Error('页面还有「同步到其他设备」');
    if (await page.evaluate(() => typeof window.__sync !== 'undefined')) throw new Error('#sync= 代码还在');
    await page.click('[data-id="rev:cs146s-L01"]');
    const rev = await page.evaluate(() => localStorage.getItem('rev-done:cs146s-L01'));
    const o = JSON.parse(rev || '{}');
    for (const day of DUE) if (!/^\d{4}-\d{2}-\d{2}$/.test(o[day] || '')) throw new Error('rev-done 缺少第 ' + day + ' 天 ' + rev);
    for (const r of L01_OPEN) if (!DUE.includes(r.day) && o[r.day]) throw new Error('不该勾还没到期的 ' + rev);
    if ((await page.evaluate(() => window.__gh.length)) !== 0) throw new Error('没令牌却请求了 GitHub');
    if (page._errors.length) throw new Error(page._errors.join('\n'));
    await page._ctx.close();
  });

  await check('有令牌：今日勾选和取消打出 done', async () => {
    const page = await boot(browser, origin, { token: TOKEN });
    await page.goto(origin + HOME, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__progReady === 1 && document.querySelector('[data-id="rev:cs146s-L01"]'));
    const hintHidden = await page.$eval('#prog-hint', (el) => el.hidden);
    if (!hintHidden) throw new Error('有令牌时不该显示去设置的提示');
    if ((await page.evaluate(() => window.__gh.some((c) => c.method === 'PUT')))) throw new Error('空的本机记录不应 PUT');
    await page.click('[data-id="rev:cs146s-L01"]');
    await page.waitForFunction(() => window.__gh.some((c) => c.method === 'PUT' && c.path === 'data/review.json'));
    await page.waitForFunction(() => !window.__progPending);
    const [put] = await puts(page, 'data/review.json');
    const doc = decode(put.body, gh);
    const orig = JSON.parse(REVIEW);
    const item = doc.queue.find((q) => q.item === 'cs146s-L01');
    const old = orig.queue.find((q) => q.item === 'cs146s-L01');
    const localToday = (await page.evaluate(() => JSON.parse(localStorage.getItem('rev-done:cs146s-L01'))))[DUE[0]];
    if (item.learned !== old.learned) throw new Error('勾选复习改了 learned');
    for (const r of item.reviews) {
      const was = old.reviews.find((x) => x.day === r.day);
      if (r.date !== was.date) throw new Error('排期 date 被改了 ' + r.day);
      if (DUE.includes(r.day)) {
        if (r.done !== true || r.doneOn !== localToday) throw new Error('第 ' + r.day + ' 天不对 ' + JSON.stringify(r));
      } else if (r.done !== was.done || r.doneOn !== was.doneOn) throw new Error('不该改第 ' + r.day + ' 天 ' + JSON.stringify(r));
    }
    for (const q of doc.queue) {
      if (q.item === 'cs146s-L01') continue;
      const was = orig.queue.find((x) => x.item === q.item);
      if (JSON.stringify(q) !== JSON.stringify(was)) throw new Error('别的条目被改了 ' + q.item);
    }
    if (!put.body.message.includes('cs146s-L01') || !put.body.message.includes('done')) throw new Error('提交说明 ' + put.body.message);
    await page.click('[data-id="rev:cs146s-L01"]');
    await page.waitForFunction(() => window.__gh.filter((c) => c.method === 'PUT' && c.path === 'data/review.json').length >= 2);
    await page.waitForFunction(() => !window.__progPending);
    const both = await puts(page, 'data/review.json');
    const undone = decode(both[1].body, gh).queue.find((q) => q.item === 'cs146s-L01');
    if (undone.learned !== old.learned) throw new Error('取消勾选删了 learned');
    for (const day of DUE) {
      const r = undone.reviews.find((x) => x.day === day);
      if (r.done !== false || Object.prototype.hasOwnProperty.call(r, 'doneOn')) throw new Error('取消后第 ' + day + ' 天还在 ' + JSON.stringify(r));
    }
    if (!both[1].body.message.includes('undo')) throw new Error('取消说明 ' + both[1].body.message);
    if (page._errors.length) throw new Error(page._errors.join('\n'));
    await page._ctx.close();
  });

  async function withCloud(cloud, local, url) {
    const page = await boot(browser, origin, { token: TOKEN });
    // 假 API 在页面加载时读 __test:cloud-review，先写进去再重开一次首页。
    await page.goto(origin + '/favorites/index.html', { waitUntil: 'networkidle0' });
    await page.evaluate((t, loc) => { localStorage.setItem('__test:cloud-review', t); for (const [k, v] of Object.entries(loc || {})) localStorage.setItem(k, v); }, JSON.stringify(cloud, null, 2), local || {});
    await page.goto(origin + (url || HOME), { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__cloudReady === 1 && window.__progReady === 1);
    await page.waitForFunction(() => !window.__progPending);
    return page;
  }
  await check('(a)5 别的设备今天勾完的复习：这台设备显示「已看」，可在同一行取消', async () => {
    const cloud = JSON.parse(REVIEW);
    const q = cloud.queue.find((x) => x.item === 'cs146s-L01');
    const at = new Date(Date.now() - 60000).toISOString();
    for (const r of q.reviews) if (DUE.includes(r.day)) { r.done = true; r.doneOn = TODAY; r.at = at; }
    const page = await withCloud(cloud);
    const pressed = await page.$eval('[data-id="rev:cs146s-L01"]', (b) => b.getAttribute('aria-pressed'));
    if (pressed !== 'true') throw new Error('云端今天已完成，应显示为已看，aria-pressed=' + pressed);
    if ((await puts(page, 'data/review.json')).length) throw new Error('打开页面不应 PUT');
    await page.click('[data-id="rev:cs146s-L01"]');
    await page.waitForFunction(() => window.__gh.some((c) => c.method === 'PUT' && c.path === 'data/review.json'));
    await page.waitForFunction(() => !window.__progPending);
    const [put] = await puts(page, 'data/review.json');
    const doc = decode(put.body, gh).queue.find((x) => x.item === 'cs146s-L01');
    for (const day of DUE) {
      const r = doc.reviews.find((x) => x.day === day);
      if (r.done !== false || 'doneOn' in r || !(Date.parse(r.at) > Date.parse(at))) throw new Error('取消没写对 ' + JSON.stringify(r));
    }
    const after = await page.$eval('[data-id="rev:cs146s-L01"]', (b) => b.getAttribute('aria-pressed'));
    if (after !== 'false') throw new Error('取消后应变回未看');
    const ops = await page.evaluate(() => localStorage.getItem('rev-op:cs146s-L01'));
    if (ops) throw new Error('传上去之后 rev-op 应清掉 ' + ops);
    if (page._errors.length) throw new Error(page._errors.join('\n'));
    await page._ctx.close();
  });

  await check('(b)2 别的设备更晚的取消不会被这台的旧记录勾回去', async () => {
    const cloud = JSON.parse(REVIEW);
    const q = cloud.queue.find((x) => x.item === 'cs146s-L01');
    const at = new Date(Date.now() - 60000).toISOString();
    for (const r of q.reviews) if (DUE.includes(r.day)) { r.done = false; delete r.doneOn; r.at = at; }
    const stale = Object.fromEntries(DUE.map((d) => [d, TODAY]));
    const page = await withCloud(cloud, { 'rev-done:cs146s-L01': JSON.stringify(stale) });
    if ((await puts(page, 'data/review.json')).length) throw new Error('旧本机记录把取消传回了云端');
    const pressed = await page.$eval('[data-id="rev:cs146s-L01"]', (b) => b.getAttribute('aria-pressed'));
    if (pressed !== 'false') throw new Error('云端更晚取消了，这台设备不应显示已看');
    const left = await page.evaluate(() => localStorage.getItem('rev-done:cs146s-L01'));
    if (left) throw new Error('本机旧记录应跟着云端清掉 ' + left);
    if (page._errors.length) throw new Error(page._errors.join('\n'));
    await page._ctx.close();
  });

  await check('(b)2 没传上去的更新操作：下次打开时补传，压过云端更早的记录', async () => {
    const cloud = JSON.parse(REVIEW);
    const q = cloud.queue.find((x) => x.item === 'cs146s-L01');
    const old = new Date(Date.now() - 3600000).toISOString();
    for (const r of q.reviews) if (DUE.includes(r.day)) { r.done = true; r.doneOn = TODAY; r.at = old; }
    const now = Date.now() - 1000;
    const ops = Object.fromEntries(DUE.map((d) => [d, { done: false, at: now }]));
    const page = await withCloud(cloud, { 'rev-op:cs146s-L01': JSON.stringify(ops) });
    const all = await puts(page, 'data/review.json');
    if (all.length !== 1) throw new Error('应补传一次，实际 ' + all.length);
    const doc = decode(all[0].body, gh).queue.find((x) => x.item === 'cs146s-L01');
    for (const day of DUE) { const r = doc.reviews.find((x) => x.day === day); if (r.done !== false || Date.parse(r.at) !== now) throw new Error('补传不对 ' + JSON.stringify(r)); }
    if (await page.evaluate(() => localStorage.getItem('rev-op:cs146s-L01'))) throw new Error('补传后 rev-op 应清掉');
    const pressed = await page.$eval('[data-id="rev:cs146s-L01"]', (b) => b.getAttribute('aria-pressed'));
    if (pressed !== 'false') throw new Error('取消应生效');
    if (page._errors.length) throw new Error(page._errors.join('\n'));
    await page._ctx.close();
  });

  await check('(b)4 已学完＝点过「学完了」：别的设备写的 learned，这台的栏目页也算已学完', async () => {
    const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/items.json'), 'utf8')).items;
    const rv = JSON.parse(REVIEW);
    const target = rv.queue.find((q) => !q.learned && items.find((i) => i.id === q.item && i.column === 'courses' && !/^https?:/.test(i.href)));
    if (!target) throw new Error('找不到没有 learned 的课程条目');
    const it = items.find((i) => i.id === target.item);
    const page = await boot(browser, origin);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (/\/data\/review\.json/.test(req.url())) { const j = JSON.parse(REVIEW); j.queue.find((q) => q.item === target.item).learned = BJ; req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); }
      else req.continue();
    });
    const dir = it.href.replace(/\/[^/]+$/, '/');
    const base = it.href.split('/').pop();
    const baked = await (async () => { const p2 = await boot(browser, origin); await p2.goto(origin + '/' + dir + 'index.html', { waitUntil: 'networkidle0' }); const n = await p2.$eval('[data-k="done"] b', (b) => +b.textContent); await p2._ctx.close(); return n; })();
    await page.goto(origin + '/' + dir + 'index.html', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 300));
    const tag = await page.evaluate((base) => { const a = [...document.querySelectorAll('a[href]')].find((x) => x.getAttribute('href') === base); const box = a && a.closest('.row,.card'); const t = box && box.querySelector('.tag.st'); return t ? t.textContent : null; }, base);
    if (tag !== '已学完') throw new Error(it.id + ' 应显示已学完，实际 ' + tag);
    const n = await page.$eval('[data-k="done"] b', (b) => +b.textContent);
    if (n !== baked + 1) throw new Error('「已学完」计数应从 ' + baked + ' 变成 ' + (baked + 1) + '，实际 ' + n);
    if (page._errors.length) throw new Error(page._errors.join('\n'));
    await page._ctx.close();
  });

  await check('收藏仍然可用', async () => {
    const page = await boot(browser, origin, { token: TOKEN });
    await page.goto(origin + '/index.html', { waitUntil: 'networkidle0' });
    await page.waitForSelector('main a.card .fav-b');
    await page.click('main a.card .fav-b');
    await page.waitForFunction(() => window.__gh.some((c) => c.method === 'PUT' && c.path === 'favorites.json'));
    const [put] = await puts(page, 'favorites.json');
    if (!put.body.message.startsWith('fav: + ')) throw new Error('收藏说明 ' + put.body.message);
    const doc = decode(put.body, gh);
    if (!doc.items[0] || !doc.items[0].url || !doc.items[0].tags.includes('云同步')) throw new Error('收藏内容不对 ' + JSON.stringify(doc.items[0]));
    if (doc.version !== 1) throw new Error('version');
    const bare = await boot(browser, origin);
    await bare.goto(origin + '/index.html', { waitUntil: 'networkidle0' });
    await bare.waitForSelector('main a.card .fav-b');
    await bare.click('main a.card .fav-b');
    await new Promise((r) => setTimeout(r, 400));
    const toast = await bare.$eval('.fav-toast', (el) => el.textContent);
    if (!toast.includes('令牌') || !toast.includes('同步设置')) throw new Error('没令牌的收藏提示不对 ' + toast);
    if ((await bare.evaluate(() => window.__gh.length)) !== 0) throw new Error('没令牌却写了收藏');
    if (bare._dialogs.length) throw new Error('没令牌不该弹出输入框');
    if (page._errors.length || bare._errors.length) throw new Error([].concat(page._errors, bare._errors).join('\n'));
    await page._ctx.close();
    await bare._ctx.close();
  });

  await check('只引 favorites.js 的简报、海报页也有收藏按钮', async () => {
    const brief = fs.readdirSync(path.join(ROOT, 'x-brief')).filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f)).sort().pop();
    const poster = fs.readdirSync(path.join(ROOT, 'x-posters')).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort().pop();
    for (const u of ['/x-brief/' + brief, '/x-posters/' + poster + '/index.html']) {
      const page = await boot(browser, origin, { token: TOKEN });
      await page.goto(origin + u, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.fav-b');
      const n = await page.$$eval('.fav-b', (bs) => bs.filter((b) => b.getBoundingClientRect().width > 0).length);
      if (n < 2) throw new Error(u + ' 收藏按钮只有 ' + n + ' 个');
      await page.click('main .fav-b');
      await page.waitForFunction(() => window.__gh.some((c) => c.method === 'PUT' && c.path === 'favorites.json'));
      if (!(await page.evaluate(() => !!window.PROG && !!window.PROG.onReview))) throw new Error(u + ' 没补载 progress.js');
      if (page._errors.length) throw new Error(u + ' ' + page._errors.join('\n'));
      await page._ctx.close();
    }
  });

  await check('截图：首页 A/B/C 和一课', async () => {
    const page = await boot(browser, origin);
    await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
    await page.goto(origin + '/index.html', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__progReady === 1 && document.querySelector('#prog-hint') && !document.querySelector('#prog-hint').hidden);
    for (const theme of ['A', 'B', 'C']) {
      await page.evaluate((t) => { localStorage.setItem('site-theme', t); document.documentElement.setAttribute('data-theme', t); }, theme);
      await new Promise((r) => setTimeout(r, 250));
      await page.screenshot({ path: path.join(SHOTS, `home-${theme}-desktop.png`) });
    }
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    for (const theme of ['A', 'B', 'C']) {
      await page.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); window.scrollTo(0, 0); }, theme);
      await new Promise((r) => setTimeout(r, 200));
      await page.screenshot({ path: path.join(SHOTS, `home-${theme}-mobile.png`) });
    }
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(origin + '/courses/cs146s/L02-harness-anatomy.html', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.fin-btn');
    await page.screenshot({ path: path.join(SHOTS, 'lesson-desktop.png') });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 200));
    await page.screenshot({ path: path.join(SHOTS, 'lesson-mobile.png') });
    await page._ctx.close();
  });
} finally {
  await browser.close();
  server.close();
}

console.log(results.join('\n'));
if (results.some((r) => r.includes(' FAIL'))) process.exit(1);
