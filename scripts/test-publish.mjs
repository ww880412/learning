// node scripts/test-publish.mjs —— 「构建失败就停发」的反向测试，全部通过打印 ok。不联网，不碰真仓库：
// 在临时目录建一个假的 origin（bare 仓库）和工作区，故意弄坏数据，确认：非零退出、报出原因、origin/main 一个提交都没多、工作区没留半成品。
// 1. scripts/rebuild-home.sh：build.mjs 失败、缺 build.mjs 时非零退出（以前只告警、退出 0）。
// 2. 仓库外的两个发布脚本（box 上存在时才测）：X 简报 /workspace/x-brief/site/publish.sh、X 海报 publish_gallery.py。
//    坏数据 → 不推送；数据修好 → 正常推送一次。
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const git = (cwd, ...a) => { const r = run('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...a], { cwd }); if (r.status) throw new Error('git ' + a.join(' ') + '\n' + r.stderr); return r.stdout.trim(); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-publish-'));
function seed(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'build.mjs'), path.join(dir, 'build.mjs'));
  for (const d of ['assets', 'data', 'scripts']) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
}
const breakData = dir => fs.writeFileSync(path.join(dir, 'data', 'concepts.json'), '[{"id":');
try {
  // ---------- 1. rebuild-home.sh ----------
  {
    const dir = path.join(tmp, 'rh'); seed(dir); breakData(dir);
    const r = run('bash', [path.join(dir, 'scripts/rebuild-home.sh')], { env: { ...process.env, LEARNING_ROOT: dir } });
    assert.notEqual(r.status, 0, 'build.mjs 失败时 rebuild-home.sh 应非零退出');
    assert.match(r.stderr, /数据文件解析失败：data\/concepts\.json/, '应转出 build.mjs 的原因');
    assert.match(r.stderr, /停止发布/);
    fs.rmSync(path.join(dir, 'build.mjs'));
    const r2 = run('bash', [path.join(dir, 'scripts/rebuild-home.sh')], { env: { ...process.env, LEARNING_ROOT: dir } });
    assert.notEqual(r2.status, 0, '缺 build.mjs 时应非零退出'); assert.match(r2.stderr, /没有 build\.mjs/);
    const ok = path.join(tmp, 'rh-ok'); seed(ok);
    const r3 = run('bash', [path.join(ok, 'scripts/rebuild-home.sh')], { env: { ...process.env, LEARNING_ROOT: ok } });
    assert.equal(r3.status, 0, r3.stderr); assert.match(r3.stdout, /rebuilt learning homepage/);
  }
  // ---------- 2. 仓库外的发布脚本 ----------
  function fakeRemote(name) {
    const origin = path.join(tmp, name + '.git'), work = path.join(tmp, name);
    git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
    seed(work); git(work, 'init', '-q', '-b', 'main'); git(work, 'remote', 'add', 'origin', origin);
    git(work, 'add', '-A'); git(work, 'commit', '-qm', 'seed'); git(work, 'push', '-q', 'origin', 'main');
    return { origin, work, head: () => git(origin, 'rev-parse', 'main') };
  }
  // 往 origin 推一笔「别人」的提交：坏数据或修好数据
  function pushFromOther(o, label, mutate) {
    const other = path.join(tmp, path.basename(o.work) + '-other-' + label);
    git(tmp, 'clone', '-q', o.origin, other); mutate(other); git(other, 'add', '-A'); git(other, 'commit', '-qm', label); git(other, 'push', '-q', 'origin', 'main');
  }
  const PATHS = ['index.html', 'digest', 'data/digest'];
  const dirty = (work, extra) => git(work, 'status', '--porcelain', '--', ...PATHS, ...extra);
  const XB = '/workspace/x-brief/site/publish.sh';
  if (fs.existsSync(XB)) {
    const o = fakeRemote('xb');
    git(o.work, 'checkout', '-q', '--detach');
    pushFromOther(o, 'break', breakData);
    const before = o.head();
    const r = run('bash', [XB], { env: { ...process.env, XB_REPO: o.work } });
    assert.notEqual(r.status, 0, 'X 简报：构建失败应非零退出\n' + r.stdout + r.stderr);
    assert.match(r.stderr, /停止发布/); assert.match(r.stdout + r.stderr, /data\/concepts\.json/, '应报出坏的是哪个文件');
    assert.equal(o.head(), before, 'X 简报：构建失败时 origin/main 不应有新提交');
    assert.equal(dirty(o.work, ['x-brief']), '', 'X 简报：失败后不应留下半成品');
    pushFromOther(o, 'fix', d => fs.copyFileSync(path.join(ROOT, 'data/concepts.json'), path.join(d, 'data/concepts.json')));
    const fixed = o.head();
    const r2 = run('bash', [XB], { env: { ...process.env, XB_REPO: o.work } });
    assert.equal(r2.status, 0, 'X 简报：数据修好后应能发布\n' + r2.stdout + r2.stderr);
    assert.notEqual(o.head(), fixed, 'X 简报：应推上一笔提交');
    assert.match(git(o.origin, 'log', '-1', '--format=%s', 'main'), /^x-brief: update /);
    console.log('X 简报 publish.sh：坏数据停发、修好后发布 ok');
  } else console.log('跳过 X 简报 publish.sh（box 上没有）');
  const XP = '/workspace/daily-x-tech-posters/scripts/publish_gallery.py';
  if (fs.existsSync(XP)) {
    const o = fakeRemote('xp');
    pushFromOther(o, 'break', breakData);
    git(o.work, 'fetch', '-q', 'origin'); 
    const before = o.head();
    const r = run('python3', [XP], { env: { ...process.env, LEARNING_ROOT: o.work } });
    assert.notEqual(r.status, 0, 'X 海报：构建失败应非零退出\n' + r.stdout + r.stderr);
    assert.match(r.stderr, /停止发布/); assert.match(r.stdout + r.stderr, /data\/concepts\.json/, '应报出坏的是哪个文件');
    assert.equal(o.head(), before, 'X 海报：构建失败时 origin/main 不应有新提交');
    assert.equal(dirty(o.work, ['x-posters']), '', 'X 海报：失败后不应留下半成品');
    console.log('X 海报 publish_gallery.py：坏数据停发 ok');
  } else console.log('跳过 X 海报 publish_gallery.py（box 上没有）');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log('ok');
