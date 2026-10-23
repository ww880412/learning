// 从 lucide-static 抽取本站用到的图标，写入 assets/icons.json（构建时内联 SVG），并把运行时要用的几枚写进 vp-head.js 的 ICONS 块。
// 用法：npm i lucide-static（任意目录）后  LUCIDE_DIR=<.../lucide-static/icons> node scripts/vendor-icons.mjs
import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = process.env.LUCIDE_DIR || '/tmp/pp/node_modules/lucide-static/icons';
const NAMES = ['graduation-cap','file-text','flask-conical','message-circle','circle-play','puzzle','newspaper','image','book-open','sun-moon','menu','x','star','lightbulb','party-popper','settings','circle-check','inbox','folder','chevron-right','chevron-down','arrow-right','rocket','external-link','tag','funnel','trending-up','message-square','calendar','git-fork','history','boxes'];
const RUNTIME = ['menu','x','star','party-popper'];
const out = {};
for (const n of NAMES) { const s = fs.readFileSync(path.join(DIR, n + '.svg'), 'utf8'); out[n] = s.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s*\n\s*/g, '').replace(/\s*\/>/g, '/>').trim(); }
const ver = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(ROOT, 'assets/icons.json'), JSON.stringify({ _: `lucide-static v${ver} · ISC · https://lucide.dev`, ...out }, null, 0) + '\n');
const vp = path.join(ROOT, 'assets/vp-head.js'); let js = fs.readFileSync(vp, 'utf8');
const blk = `/*ICONS lucide v${ver} ISC*/window.__IC=${JSON.stringify(Object.fromEntries(RUNTIME.map(n => [n, out[n]])))};window.__ic=function(n,s,c){return '<svg class="i i-'+n+(c?' '+c:'')+'" width="'+(s||16)+'" height="'+(s||16)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(window.__IC[n]||'')+'</svg>'};/*END ICONS*/\n`;
js = /\/\*ICONS[\s\S]*?\/\*END ICONS\*\/\n?/.test(js) ? js.replace(/\/\*ICONS[\s\S]*?\/\*END ICONS\*\/\n?/, blk) : blk + js;
fs.writeFileSync(vp, js); console.log('icons:', NAMES.length, 'runtime:', RUNTIME.length);
