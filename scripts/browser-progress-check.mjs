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
const SEARCH_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/search-index.json'), 'utf8'));
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
const pickEntry = (f) => SEARCH_JSON.entries.find(f);
const pickKeyword = (entry, fallback) => {
  if (!entry) return fallback;
  const t = String(entry.title || '');
  const en = t.match(/[A-Za-z][A-Za-z0-9-]{3,}/);
  if (en) return en[0].toLowerCase();
  return t.slice(0, 4) || fallback;
};
const SAMPLES = {
  langchain: pickEntry((x) => /langchain-agents-async/.test(x.href)),
  poster: pickEntry((x) => x.type === 'X 海报' && /#/.test(x.href)),
  ph: pickEntry((x) => x.type === '产品灵感' && /#/.test(x.href)),
  dsh: pickEntry((x) => x.type === 'DSH 插件' && /#dsh-v\d+$/.test(x.href)),
};
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

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name) });
}
async function scrollTo(page, sel) {
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center', inline: 'nearest' }), sel);
  await new Promise((r) => setTimeout(r, 150));
}
function installStoragePatch(mode) {
  const P = Storage.prototype;
  if (!window.__fiOrig) window.__fiOrig = { set: P.setItem, get: P.getItem, remove: P.removeItem };
  const orig = window.__fiOrig;
  const learn = (k) => /^(done:|rev-done:|rev-op:)/.test(k);
  const fi = window.__fi = { sets: 0, removes: 0, gets: 0, throws: 0, learnSets: 0, firstAfter: null, setKeys: [], sawPlant: 0 };
  P.getItem = function (k) {
    fi.gets++;
    if (mode === 'disabled') { fi.throws++; throw new DOMException('storage disabled', 'SecurityError'); }
    const v = orig.get.call(this, k);
    if (mode === 'concurrent' && k === window.__fiNext && v === window.__fiNextVal) fi.sawPlant++;
    return v;
  };
  P.setItem = function (k, v) {
    fi.sets++;
    if (learn(k)) {
      fi.learnSets++;
      if (mode === 'first' && fi.learnSets === 1) { fi.throws++; throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }
      if ((mode === 'middle' || mode === 'restore') && fi.learnSets === 2) { fi.throws++; throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }
      if (mode === 'restore' && fi.learnSets > 2) { fi.throws++; throw new DOMException('restore blocked', 'QuotaExceededError'); }
    }
    const r = orig.set.call(this, k, v);
    fi.setKeys.push(k);
    if (learn(k) && fi.learnSets === 1) fi.firstAfter = orig.get.call(this, k);
    if (mode === 'concurrent' && learn(k) && fi.learnSets === 1) {
      orig.set.call(this, 'fav:cache', 'example-other-tab');
      if (window.__fiNext) orig.set.call(this, window.__fiNext, window.__fiNextVal);
    }
    return r;
  };
  P.removeItem = function (k) {
    fi.removes++;
    if (mode === 'restore' && learn(k)) { fi.throws++; throw new DOMException('remove blocked', 'SecurityError'); }
    return orig.remove.call(this, k);
  };
}
async function patchStorage(page, mode) {
  await page.evaluate(installStoragePatch, mode);
}
async function unpatchStorage(page) {
  await page.evaluate(() => {
    const o = window.__fiOrig;
    if (!o) return;
    Storage.prototype.setItem = o.set;
    Storage.prototype.getItem = o.get;
    Storage.prototype.removeItem = o.remove;
  });
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
      await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => { d.open = true; })); // 简报栏目默认收起（2026-10-26 jobs-fix1），展开后再数
      const n = await page.$$eval('.fav-b', (bs) => bs.filter((b) => b.getBoundingClientRect().width > 0).length);
      if (n < 2) throw new Error(u + ' 收藏按钮只有 ' + n + ' 个');
      await page.click('main .fav-b');
      await page.waitForFunction(() => window.__gh.some((c) => c.method === 'PUT' && c.path === 'favorites.json'));
      if (!(await page.evaluate(() => !!window.PROG && !!window.PROG.onReview))) throw new Error(u + ' 没补载 progress.js');
      if (page._errors.length) throw new Error(u + ' ' + page._errors.join('\n'));
      await page._ctx.close();
    }
  });

  await check('导出/导入本地学习状态：版本校验、合并恢复、无令牌泄漏', async () => {
    const page = await boot(browser, origin);
    await page.goto(origin + '/courses/cs146s/L02-harness-anatomy.html', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__progReady === 1 && document.querySelector('.fin-btn'));
    await page.click('.fin-btn');
    await page.waitForFunction(() => !!localStorage.getItem('done:' + location.pathname));
    await page.goto(origin + HOME, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__progReady === 1 && document.querySelector('[data-id="rev:cs146s-L01"]'));
    await page.click('[data-id="rev:cs146s-L01"]');
    await new Promise((r) => setTimeout(r, 200));
    await page.goto(origin + '/favorites/index.html#settings', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.PROG && typeof PROG.exportLocalBackup === 'function');
    await page.evaluate(() => { document.getElementById('settings').open = true; document.getElementById('bk').open = true; });
    await page.evaluate(() => localStorage.setItem('fav:cache', 'example-keep'));
    const dlDir = path.join(SHOTS, 'download');
    fs.rmSync(dlDir, { recursive: true, force: true });
    fs.mkdirSync(dlDir, { recursive: true });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir });
    await page.$eval('#bkexp', (b) => b.click());
    await page.waitForFunction(() => document.querySelector('#bkjson').value.length > 20);
    let downloaded = null;
    for (let i = 0; i < 40 && !downloaded; i++) {
      const names = fs.readdirSync(dlDir).filter((n) => n.endsWith('.json') && !n.endsWith('.crdownload'));
      if (names.length) downloaded = path.join(dlDir, names[0]);
      else await new Promise((r) => setTimeout(r, 200));
    }
    if (!downloaded) throw new Error('点击导出后没有下载到文件：' + fs.readdirSync(dlDir).join(','));
    const bk = JSON.parse(fs.readFileSync(downloaded, 'utf8'));
    const shown = await page.evaluate(() => JSON.parse(document.querySelector('#bkjson').value));
    if (JSON.stringify(bk.done) !== JSON.stringify(shown.done) || JSON.stringify(bk.rev) !== JSON.stringify(shown.rev)) throw new Error('下载文件和页面上的导出不一致');
    if (bk.kind !== 'learning-progress-local' || bk.version !== 1) throw new Error('备份格式不对');
    if (JSON.stringify(bk).includes('github_pat_') || JSON.stringify(bk).includes('fav:token') || JSON.stringify(bk).includes('example-keep')) throw new Error('备份不应包含令牌或无关键');
    if (!bk.done['/courses/cs146s/L02-harness-anatomy.html'] || !bk.rev['cs146s-L01']) throw new Error('导出的学习状态不完整');
    fs.writeFileSync(path.join(SHOTS, 'backup-valid.json'), JSON.stringify(bk, null, 2) + '\n');
    await page.$eval('#bkjson', (el) => { el.value = ''; });
    const input = await page.$('#bkfile');
    await input.uploadFile(downloaded);
    await page.$eval('#bkfile', (el) => el.dispatchEvent(new Event('change', { bubbles: true })));
    await page.waitForFunction(() => document.querySelector('#bkjson').value.includes('learning-progress-local'));
    const before = await page.evaluate(() => ({ done: localStorage.getItem('done:/courses/cs146s/L02-harness-anatomy.html'), rev: localStorage.getItem('rev-done:cs146s-L01') }));
    if (!before.done || !before.rev) throw new Error('准备数据失败');
    await page.evaluate(() => {
      localStorage.removeItem('done:/courses/cs146s/L02-harness-anatomy.html');
      localStorage.removeItem('rev-done:cs146s-L01');
    });
    await page.click('#bkpreview');
    await page.waitForFunction(() => {
      const m = document.querySelector('#bkmsg');
      return m.dataset.state === 'preview' && /实际要改 [1-9]/.test(m.textContent);
    });
    await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
    await scrollTo(page, '#bkmsg');
    await shot(page, 'backup-preview-desktop.png');
    await shot(page, 'backup-desktop.png');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await scrollTo(page, '#bk');
    await shot(page, 'backup-preview-mobile.png');
    await shot(page, 'backup-mobile.png');
    await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
    await page.click('#bkimp');
    await page.waitForFunction(() => document.querySelector('#bkmsg').textContent.includes('导入完成'));
    const imported = await page.evaluate(() => ({
      done: localStorage.getItem('done:/courses/cs146s/L02-harness-anatomy.html'),
      rev: localStorage.getItem('rev-done:cs146s-L01'),
      other: localStorage.getItem('fav:cache'),
      dl: document.getElementById('bkdl').hidden,
    }));
    if (imported.done !== before.done || imported.rev !== before.rev) throw new Error('导入后本地学习状态没恢复');
    if (imported.other !== 'example-keep') throw new Error('导入改动了无关键 fav:cache');
    if (imported.dl) throw new Error('导入后应能下载导入前备份');
    await page.$eval('#bkjson', (el) => { el.value = '{"version":1,"kind":"learning-progress-local","done":{"/bad":"2026-99-99"}}'; });
    await page.click('#bkpreview');
    await page.waitForFunction(() => document.querySelector('#bkmsg').dataset.state === 'err' && document.querySelector('#bkmsg').textContent.includes('预览失败'));
    await scrollTo(page, '#bkmsg');
    await shot(page, 'backup-error-desktop.png');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await scrollTo(page, '#bkmsg');
    await shot(page, 'backup-error-mobile.png');
    await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
    const diverge = () => page.evaluate(() => {
      localStorage.setItem('done:/courses/cs146s/L02-harness-anatomy.html', '2099-01-01');
      const rev = JSON.parse(localStorage.getItem('rev-done:cs146s-L01') || '{}');
      const later = {};
      Object.keys(rev).forEach((k) => { later[k] = '2099-01-02'; });
      if (!Object.keys(later).length) later['1'] = '2099-01-02';
      localStorage.setItem('rev-done:cs146s-L01', JSON.stringify(later));
      localStorage.setItem('fav:cache', 'example-unrelated');
      return { later };
    });
    const reloadBackup = async () => {
      await page.$eval('#bkjson', (el, text) => { el.value = text; }, JSON.stringify(bk));
      await page.click('#bkpreview');
      await page.waitForFunction(() => /实际要改 [1-9]/.test(document.querySelector('#bkmsg').textContent));
    };
    await diverge();
    await reloadBackup();
    await page.evaluate(() => { window.confirm = () => false; });
    const putsBeforeCancel = (await puts(page, 'data/review.json')).length;
    await page.click('#bkimp');
    await page.waitForFunction(() => document.querySelector('#bkmsg').textContent.includes('已取消导入，没有改动'));
    const afterCancel = await page.evaluate(() => localStorage.getItem('done:/courses/cs146s/L02-harness-anatomy.html'));
    if (afterCancel !== '2099-01-01') throw new Error('取消导入仍改了学习状态');
    if ((await puts(page, 'data/review.json')).length !== putsBeforeCancel) throw new Error('取消导入不应同步');
    const runFail = async (mode, expect) => {
      await unpatchStorage(page);
      await diverge();
      await reloadBackup();
      if (mode === 'concurrent') await page.evaluate(() => { window.__fiNext = 'rev-done:cs146s-L01'; window.__fiNextVal = '{"1":"2098-06-01"}'; });
      await patchStorage(page, mode);
      await page.evaluate(() => { window.confirm = () => true; });
      const ghBefore = await page.evaluate(() => window.__gh.length);
      await page.click('#bkimp');
      await page.waitForFunction((part) => document.querySelector('#bkmsg').dataset.state === 'err' && document.querySelector('#bkmsg').textContent.includes(part), {}, expect.part);
      const got = await page.evaluate(() => {
        const get = window.__fiOrig ? (k) => window.__fiOrig.get.call(localStorage, k) : (k) => localStorage.getItem(k);
        return {
          fi: window.__fi,
          msg: document.querySelector('#bkmsg').textContent,
          phase: document.querySelector('#bkmsg').dataset.phase,
          done: get('done:/courses/cs146s/L02-harness-anatomy.html'),
          rev: get('rev-done:cs146s-L01'),
          cache: get('fav:cache'),
          gh: window.__gh.length,
        };
      });
      await unpatchStorage(page);
      if (got.msg.includes('已回滚原状态')) throw new Error(mode + ' 不应谎称已回滚：' + got.msg);
      if (!got.fi || got.fi.throws < expect.throws) throw new Error(mode + ' 拦截没有触发 ' + JSON.stringify(got.fi));
      if (got.fi.learnSets !== expect.learnSets) throw new Error(mode + ' 学习键写入次数不对 ' + JSON.stringify(got.fi));
      if (got.gh !== ghBefore) throw new Error(mode + ' 失败后请求了 GitHub');
      expect.check(got);
    };
    await runFail('disabled', {
      part: '本机存储不可用', throws: 1, learnSets: 0,
      check(got) {
        if (got.done !== '2099-01-01' || got.cache !== 'example-unrelated') throw new Error('存储不可用时改了数据 ' + JSON.stringify(got));
        if (got.fi.sets !== 0) throw new Error('存储不可用时仍有 setItem ' + got.fi.sets);
      },
    });
    await runFail('first', {
      part: '第一步写入就失败', throws: 1, learnSets: 1,
      check(got) {
        if (got.done !== '2099-01-01') throw new Error('首次失败后 done 变了 ' + got.done);
        if (got.cache !== 'example-unrelated') throw new Error('首次失败碰了无关键');
        if (got.fi.setKeys.some((k) => k.startsWith('done:') || k.startsWith('rev-'))) throw new Error('首次失败仍写入了学习键 ' + got.fi.setKeys.join(','));
      },
    });
    await runFail('middle', {
      part: '导入中途失败', throws: 1, learnSets: 3,
      check(got) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(got.fi.firstAfter || '') || got.fi.firstAfter === '2099-01-01') throw new Error('中途失败前没有写成不同的新值 ' + got.fi.firstAfter);
        if (!got.msg.includes('恢复成导入前的值')) throw new Error('中途失败应说明已恢复：' + got.msg);
        if (got.done !== '2099-01-01') throw new Error('中途失败后没有恢复 done ' + got.done);
        if (got.cache !== 'example-unrelated') throw new Error('中途失败碰了无关键');
      },
    });
    await runFail('concurrent', {
      part: '被别的标签页改了', throws: 0, learnSets: 2,
      check(got) {
        if (got.fi.sawPlant < 1) throw new Error('没有观察到别的标签页写入');
        if (got.fi.firstAfter === '2099-01-01') throw new Error('并发场景没有先写成不同的值');
        if (got.done !== '2099-01-01') throw new Error('自己写过的键没有恢复 ' + got.done);
        if (got.rev !== '{"1":"2098-06-01"}') throw new Error('盖过了别的标签页的学习键 ' + got.rev);
        if (got.cache !== 'example-other-tab') throw new Error('盖过了别的标签页的无关键 ' + got.cache);
        if (!got.msg.includes('已停止导入')) throw new Error(got.msg);
      },
    });
    await runFail('restore', {
      part: '恢复也失败', throws: 3, learnSets: 3,
      check(got) {
        if (got.phase !== 'restore-failed') throw new Error('阶段应是 restore-failed，实际 ' + got.phase);
        if (!got.msg.includes('仍是导入的新值') || !got.msg.includes('已暂停自动同步')) throw new Error(got.msg);
        if (got.done === '2099-01-01') throw new Error('恢复失败却回到了旧值');
        if (got.fi.firstAfter === '2099-01-01') throw new Error('恢复失败前没有写成不同的新值');
        if (got.cache !== 'example-unrelated') throw new Error('恢复失败碰了无关键');
      },
    });
    const held = await page.evaluate(() => window.PROG.importHold());
    if (!held || !held.length) throw new Error('恢复失败后应暂停同步');
    const ghAtHold = await page.evaluate(() => window.__gh.length);
    await page.evaluate((tok) => window.FAV.setToken(tok), TOKEN);
    await new Promise((r) => setTimeout(r, 400));
    const holdSync = await page.evaluate(() => ({
      gh: window.__gh.filter((c) => c.method === 'PUT').length,
      toast: (document.querySelector('.fav-toast') || {}).textContent || '',
    }));
    if (holdSync.gh !== 0) throw new Error('暂停同步后仍 PUT');
    if (!holdSync.toast.includes('暂停自动同步')) throw new Error('没有说明暂停同步：' + holdSync.toast);
    if ((await page.evaluate(() => window.__gh.length)) < ghAtHold) throw new Error('计数异常');
    await page.evaluate(() => { window.FAV.setToken(''); localStorage.removeItem('prog-import-hold'); sessionStorage.removeItem('prog-import-hold'); window.__progImportHold = null; });
    // 导入旧 rev-done + 云端更新的取消。有令牌时会真的跑同步，取消不能被旧记录改回完成。
    const cloud = JSON.parse(REVIEW);
    const q = cloud.queue.find((x) => x.item === 'cs146s-L01');
    const at = new Date(Date.now() - 1000).toISOString();
    for (const r of q.reviews) if (DUE.includes(r.day)) { r.done = false; delete r.doneOn; r.at = at; }
    await page.goto(origin + '/favorites/index.html', { waitUntil: 'networkidle0' });
    await page.evaluate((c, stale, tok) => {
      localStorage.setItem('fav:token', tok);
      localStorage.setItem('__test:cloud-review', JSON.stringify(c, null, 2));
      localStorage.setItem('rev-done:cs146s-L01', JSON.stringify(stale));
      const drop = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('done:') === 0) drop.push(k); }
      drop.forEach((k) => localStorage.removeItem(k));
    }, cloud, Object.fromEntries(DUE.map((d) => [d, TODAY])), TOKEN);
    await page.goto(origin + HOME, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__cloudReady === 1 && window.__progReady === 1 && !window.__progPending);
    const calls = await page.evaluate(() => window.__gh.map((c) => c.method + ' ' + c.path));
    if (!calls.some((c) => c === 'GET data/review.json')) throw new Error('有令牌时同步没有读云端：' + calls.join(','));
    for (const p of await puts(page, 'data/review.json')) {
      const doc = decode(p.body, gh);
      const item = doc.queue.find((x) => x.item === 'cs146s-L01');
      for (const day of DUE) {
        const row = item && item.reviews.find((r) => r.day === day);
        if (row && row.done) throw new Error('旧 rev-done 把第 ' + day + ' 天复活成了完成');
      }
    }
    if (page._errors.length) throw new Error(page._errors.join('\n'));
    await page._ctx.close();
  });

  await check('跨内容检索页：多类型关键词、锚点命中、300+结果可达', async () => {
    const page = await boot(browser, origin);
    await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
    await page.goto(origin + '/search/index.html', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('#slist .row').length > 10 && document.querySelector('#smoreb'));
    await page.evaluate(() => window.scrollTo(0, 0));
    const topOk = await page.evaluate(() => {
      const inView = (s) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= -1 && r.bottom <= window.innerHeight + 1; };
      return { top: inView('header.top'), sq: inView('#sq'), st: inView('#st'), sc: inView('#scount') };
    });
    if (!topOk.top || !topOk.sq || !topOk.st || !topOk.sc) throw new Error('桌面首屏没有同时露出顶栏、筛选和计数 ' + JSON.stringify(topOk));
    await shot(page, 'search-desktop.png');
    await scrollTo(page, '#smoreb');
    const moreOk = await page.evaluate(() => { const r = document.querySelector('#smoreb').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0; });
    if (!moreOk) throw new Error('桌面没有把「加载更多」放进画面');
    await shot(page, 'search-more-desktop.png');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'search-mobile.png');
    await scrollTo(page, '#scount');
    await shot(page, 'search-count-mobile.png');
    await scrollTo(page, '#smoreb');
    const moreMobile = await page.evaluate(() => { const r = document.querySelector('#smoreb').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
    if (!moreMobile) throw new Error('手机画面没有「加载更多」');
    await shot(page, 'search-more-mobile.png');
    await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
    const cases = [
      { key: 'langchain', entry: SAMPLES.langchain },
      { key: pickKeyword(SAMPLES.poster, 'poster'), entry: SAMPLES.poster },
      { key: pickKeyword(SAMPLES.ph, 'product'), entry: SAMPLES.ph },
      { key: pickKeyword(SAMPLES.dsh, 'dsh'), entry: SAMPLES.dsh },
    ];
    for (const c of cases) {
      if (!c.entry) throw new Error('缺少样本 ' + c.key);
      await page.goto(origin + '/search/index.html', { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => !!window.__searchData);
      await page.$eval('#sq', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, c.key);
      await new Promise((r) => setTimeout(r, 250));
      const target = await page.evaluate((href) => {
        const a = [...document.querySelectorAll('#slist .row .t a')].find((x) => x.getAttribute('href') === '../' + href);
        if (!a) return null;
        a.click();
        return true;
      }, c.entry.href);
      if (!target) throw new Error('关键词未命中目标：' + c.key + ' -> ' + c.entry.href);
      await new Promise((r) => setTimeout(r, 250));
      const hit = await page.evaluate(() => {
        const h = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
        return { path: location.pathname, hash: h, has: h ? !!document.getElementById(h) : true };
      });
      if (!hit.path.endsWith(c.entry.href.split('#')[0])) throw new Error('未跳到目标页 ' + c.entry.href + ' actual=' + hit.path);
      if (c.entry.href.includes('#') && (!hit.hash || !hit.has)) throw new Error('锚点未命中 ' + c.entry.href + ' actualHash=' + hit.hash);
      if (/#dsh-v\d+$/.test(c.entry.href)) {
        const id = c.entry.href.split('#')[1];
        await page.waitForFunction((anchor) => {
          const el = document.getElementById(anchor);
          const d = el && el.closest('details');
          return !!(el && el.tagName === 'TR' && d && d.id === 'verify' && d.open);
        }, {}, id);
      }
    }
    // 300+ 结果可达：加载更多直到末尾，并命中最后一条
    await page.goto(origin + '/search/index.html', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !!window.__searchData && document.querySelector('#scount').textContent.includes('/'));
    let guard = 0;
    while (guard++ < 20) {
      const hasMore = await page.$('#smoreb');
      if (!hasMore) break;
      await page.click('#smoreb');
      await new Promise((r) => setTimeout(r, 150));
    }
    const reach = await page.evaluate(() => {
      const data = window.__searchData || [];
      const last = data[data.length - 1];
      const shown = document.querySelector('#scount').textContent || '';
      const links = [...document.querySelectorAll('#slist .row .t a')].map((a) => a.getAttribute('href'));
      return { shown, last: last && ('../' + last.href), hasLast: !!(last && links.includes('../' + last.href)) };
    });
    if (!reach.hasLast) throw new Error('加载更多后仍无法访问末尾条目: ' + JSON.stringify(reach));
    const total = await page.evaluate(() => (window.__searchData || []).length);
    if (!reach.shown.includes(total + '/' + total)) throw new Error('没有显示到最后一条: ' + reach.shown);
    const lastHref = reach.last.slice(3);
    await page.evaluate((href) => {
      const a = [...document.querySelectorAll('#slist .row .t a')].find((x) => x.getAttribute('href') === '../' + href);
      a.scrollIntoView({ block: 'center' });
      a.click();
    }, lastHref);
    await page.waitForFunction((href) => {
      const base = href.split('#')[0];
      const id = href.includes('#') ? decodeURIComponent(href.split('#')[1]) : '';
      if (!location.pathname.endsWith(base)) return false;
      if (!id) return true;
      const el = document.getElementById(id);
      if (!el) return false;
      const d = el.closest('details');
      return !d || d.open;
    }, { timeout: 15000 }, lastHref);
    if (page._errors.length) throw new Error(page._errors.join('\n'));
    await page._ctx.close();
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
