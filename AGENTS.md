# AGENTS.md · 给改这个仓库的 agent

Codex、Cursor、Claude Code、其他 Grok Bot 改这个仓库前先读这一页。样式规范看 [`DESIGN.md`](DESIGN.md)，内容怎么加、每日汇总怎么对日期看 [`README.md`](README.md)。这里只写「怎样改才不会和自动任务打架」。

## 1. 这是什么

- 王玮的学习站，纯静态 HTML。GitHub Pages 直接发布 `main`：https://ww880412.github.io/learning/ 。推到 `main` 大约 1 分钟后上线，没有 CI。
- 大部分页面由 `node build.mjs` 从 `data/*.json` 生成。没有 npm 依赖，只要 node。
- **所有日期都按北京时间（Asia/Shanghai）显示。** 唯一例外是 X 简报文件名：`x-brief/YYYY-MM-DD.html` 用美东日期，北京时间 09:00 发布时美东还是前一天，所以页面上按 +1 天显示。**定时任务一律按北京时间触发**（2026-10-26 定，cron 用 `CRON_TZ=Asia/Shanghai`），不随美东夏令时变；各 bot 的 routine 改好之前，实际仍是美东时间触发，11/1 冬令时后会晚一小时。海报目录 `x-posters/YYYY-MM-DD/` 已经是北京日期。详细规则见 README「每日汇总」。

## 2. 目录：哪些能手改

| 路径 | 来源 | 能不能手改 |
|---|---|---|
| `build.mjs`、`assets/`（`site.css`、`vp-head.js`、`gh.js`、`favorites.js`、`progress.js`、`icons.json`）、`scripts/` | 源码 | 能。改完要重建，见第 6 节 |
| `data/columns.json`、`items.json`、`concepts.json`、`inbox.json`、`ph-inspo.json`、`dsh-plugins.json` | 数据源 | 能，改完 `node build.mjs` |
| `data/review.json` | 数据源，但构建会补排期，浏览器也会写 | 能，只改自己的条目，见第 4 节 |
| `data/radar.json` | `scripts/sync-radar.mjs` 生成 | 不要手改，重跑同步脚本 |
| `data/radar-weekly/*.md` | `scripts/sync-radar.mjs` 从 `/workspace/agent-workbench/weekly/` 原样复制（雷达周报原文，文件名是北京日期） | 不要手改，改雷达目录里的源文件再同步 |
| `favorites.json` | 浏览器经 GitHub API 写 | 不要手改 |
| `index.html`、各栏目 `*/index.html`（`courses/`、`x-posts/`、`research/`、`wechat/`、`video/`、`ph-inspo/`、`dsh-plugins/`、`radar/`、`favorites/`）、课程主题页（如 `courses/cs146s/index.html`）、`glossary.html`、`concepts/*.html`、`digest/*.html`、`data/digest/*.json`、`review.md` | `build.mjs` 生成 | **不要手改**，改模板或数据后重建 |
| `x-brief/**` | X Brief bot 的 `/workspace/x-brief/site/build.py` 生成 | 不要手改，下次发布会整目录重写 |
| `x-posters/**` | X海报日报 bot 的 `/workspace/daily-x-tech-posters/scripts/publish_gallery.py` 生成 | 不要手改，下次发布会重写所有日期页 |
| 学习页本身（如 `courses/cs146s/L01-agent-loop.html`、`x-posts/<slug>/<slug>.html`） | `/workspace/skills-src/xuexi-template/build.sh` 做好后放进来 | 可以小修。`build.mjs` 不生成它们 |
| `*-close.html`（精读版） | staticrypt 加密（盐在 `.staticrypt.json`） | 不要改，改了会坏 |
| `cs146s/`、`x-articles/` | 指向新位置的相对软链接 | 不要改 |
| `_private/` | 不发布（`.gitignore`） | 不要碰 |

## 3. 谁在自动写，什么时候写

定时任务是服务器上的 Grok Bot routine，**不在这个仓库里**，这里看不到 cron。下面的提交信息前缀可以在 `git log` 里对上。所有自动提交的作者都是 `ww880412`，只能靠前缀分辨。

| 写入方 | 时间 | 写哪些路径 | 提交信息 |
|---|---|---|---|
| X Brief（`/workspace/x-brief/site/publish.sh`，工作区 `/workspace/learning`，detached HEAD，推 `HEAD:main`） | 每天北京 09:00 | `x-brief/`（含 `weekly/`）、`index.html`、`digest/`、`data/digest/` | `x-brief: update <日期>` |
| X海报日报（`publish_gallery.py`，工作区 `/workspace/learning-main` 的 `main`） | 每天北京 08:15 起，约 25 分钟 | `x-posters/`、`index.html`、`digest/`、`data/digest/` | `x-posters: update <日期>` |
| PH灵感箱 | 约北京 20:00 | `data/ph-inspo.json`、`ph-inspo/index.html`、`index.html`、`digest/`、`data/digest/` | `ph-inspo: …` |
| Agent工作台雷达（指挥家代为发布，步骤见 `/workspace/agent-workbench/SYNC.md`） | 每周一（北京 09:00 周报），平时随时补录 | 先 `node scripts/sync-radar.mjs`（读 `/workspace/agent-workbench`）写 `data/radar.json` 和 `data/radar-weekly/`，再 `node build.mjs` 写 `radar/index.html`、`radar/weekly/<日期>.html` 等 | `radar: …` |
| 学习搭子 | 不定时 | 学习页（`courses/…`、`x-posts/…`、`research/…`、`wechat/…`、`video/…`）、`data/items.json`、`data/concepts.json`、`data/review.json`，以及构建后的全部生成页 | `courses: …`、`x-posts: …`、`review.json：…` |
| 浏览器（王玮点收藏、学完了、今日勾选） | 随时 | `favorites.json`、`data/review.json`（GitHub Contents API 直接提交） | `fav: + / - …`、`learn: …`、`review: …` |

两个发布脚本都会调 `scripts/rebuild-home.sh`（内部就是 `node build.mjs`；**构建失败就停发**，2026-10-26 起它和两个发布脚本都非零退出、丢掉半成品、不提交不推送，并打印原因），提交自己的目录、`index.html` 和 `digest/`、`data/digest/`（首页链到当天的汇总页，必须一起推；2026-10-25 起）。发布前它们会丢掉工作区里上次没提交的生成文件，对齐最新 `origin/main`；推送被拒就回到最新 `origin/main` 重新生成再推（不管 rebase 能不能成功，免得首页嵌着旧数据）。脚本在仓库外：`/workspace/x-brief/site/publish.sh`、`/workspace/daily-x-tech-posters/scripts/publish_gallery.py`。

## 4. 数据和同步

- **`data/review.json`**：复习队列，跨设备以它为准。每条 `{item, learned?, start, reviews:[{day, date, done, doneOn?, at?}]}`，间隔 1/3/7/14/30 天。`learned` 是「学完了」的北京日期；`reviews[].done` 是这一次复习做没做，`doneOn` 是完成日。构建会给新学习页补排期，但保留已有的 `learned`、`done`、`doneOn`，丢了会直接报错。浏览器从不删 `learned`（只补、取更早的日期）。复习勾选和取消以最后一次操作为准：`at` 是那次操作的时刻（ISO 时间），浏览器只在自己的操作比云端 `at` 新时才改那一天；规则写在 `assets/progress.js` 的 `effReview` / `applyOps`，首页内联脚本注入的是同一份源码。手改 `review.json` 的某次复习时，把它的 `at` 写成当前 UTC 时间，否则浏览器里更早的记录可能盖过你。「已学完」只看「学完了」按钮（`learned` 或本机 `done:`），不看 `quiz`、`retell`。
- 首页「今日」打开时会重新读仓库里的 `data/review.json`（有令牌走 API，没令牌读 Pages 副本），所以浏览器提交的勾选不用等 bot 重建就能在别的设备上生效（Pages 副本最多有约 10 分钟缓存）。
- **`data/radar.json`**：只由 `scripts/sync-radar.mjs` 生成。周报原文放在雷达目录 `weekly/YYYY-MM-DD.md`（北京日期，第一行是标题，`**结论先说**` 后的编号列表进页头），同步到 `data/radar-weekly/`，`build.mjs` 生成 `radar/weekly/YYYY-MM-DD.html` 并在雷达页列出。
- **收藏**：存仓库根目录的 `favorites.json`（公开，只存标题、链接、标签）。
- **一枚令牌，三处共用**：每个浏览器在收藏页「同步设置」填一次 GitHub fine-grained token，存在 localStorage `fav:token`。`assets/gh.js` 负责读写仓库文件（sha 冲突会重读重试）；`assets/favorites.js` 用它写 `favorites.json`；`assets/progress.js` 用它写 `data/review.json`。没令牌时只记在本机，提示指向「同步设置」。不再有「同步链接」或 `#sync=`。
- **`favorites.js` 必须能单独引用。** X 简报、海报页只带 `<script src=".../assets/favorites.js">` 这一个脚本，缺 `gh.js` 时它自己补载 `gh.js`，再补 `progress.js`。不要改成依赖页面先引 `gh.js`（PR #7 这样改过，简报、海报页的收藏按钮全丢了，PR #9 修回）。
- 学习页的「学完了」要同步到云端，页面末尾需要 `<script src="…/assets/gh.js" defer></script><script src="…/assets/progress.js" defer></script>`。现有学习页都有；xuexi-template 的 `build.sh`（`/workspace/skills-src/xuexi-template/`）从 2026-10-25 起会在输出位于本仓库时按相对路径自动加上（精读版不加），输出在仓库外时只告警。

## 5. 规矩

1. **不手改生成文件。** 改 `build.mjs`、`assets/` 或 `data/`，然后 `node build.mjs`。
2. **模板改动要扛得住 bot 重写。** 简报、海报 bot 每次发布都会实时读 `assets/vp-head.js` 和 `assets/site.css`，内联进页面，再加一个 `favorites.js`。要让这两类页面变样，改 `assets/` 里这几个文件，不要只改 `x-brief/`、`x-posters/` 里的 HTML，下次发布就被冲掉。
3. **推之前先拉。** bot 和浏览器随时往 `main` 推。先 `git pull --rebase`（或 `git fetch && git rebase origin/main`），生成文件冲突就以 `origin/main` 为准、重跑 `node build.mjs` 再提交。避开北京 08:15–09:30 和北京 20:00 前后推大改动。
4. **不要弄乱两个 bot 的工作区。** `/workspace/learning-main` 必须停在 `main` 且干净，海报 bot 直接在这里 `git add x-posters index.html && commit && push`；`/workspace/learning` 是 X Brief 的工作区（detached HEAD 跟随 `origin/main`），不要在里面做事；`publish.sh` 发布前会清掉里面没提交的生成文件。自己做事另开 worktree，例如 `git worktree add /workspace/learning-<任务> -b <分支> origin/main`。
5. **分支 + PR，squash 合并，合并后删分支**（`git push origin --delete <分支>`）。只有 bot 的日常发布直接推 `main`。
6. **合并前跑测试**（见第 6 节）。
7. **大的样式改动、新栏目，先给王玮看截图，他同意再上。** 他要求的 bug 修复和日常内容更新可以直接上线。
8. **永远不要提交令牌**（`github_pat_…`、`ghp_…`）。测试用假令牌和假的 GitHub API。
9. 只写查得到的事实，查不到写「未获取」（JSON 里用 null）。不在页面里编数字。

## 6. 构建、测试、上线

```bash
git fetch origin && git worktree add /workspace/learning-<任务> -b <分支> origin/main
cd /workspace/learning-<任务>
# 改源码 / 数据
node build.mjs                      # 重建所有生成页，并补排 data/review.json
node scripts/test-progress.mjs      # 纯逻辑测试，打印 ok
node scripts/test-guards.mjs        # 坏数据拦截：坏 JSON 不写、build.mjs 入口校验，打印 ok
node scripts/test-publish.mjs       # 构建失败就停发：rebuild-home.sh 和 box 上两个发布脚本，坏数据时非零退出、不推送，打印 ok
NODE_PATH=<装了 puppeteer-core 的 node_modules> SHOTS=/workspace/<截图目录> \
  node scripts/browser-progress-check.mjs   # 无头 Chrome（/usr/bin/google-chrome）+ 假 GitHub API，11 项应全部 PASS，并截首页 A/B/C 和一课
git add -A && git commit -m "…" && git push -u origin <分支>
# 开 PR → squash 合并 → git push origin --delete <分支>
```

- 没装 puppeteer-core：`mkdir -p /workspace/pptr && cd /workspace/pptr && npm i puppeteer-core@23`，然后 `NODE_PATH=/workspace/pptr/node_modules`。
- 生成的 HTML 很多，PR 合不上时：把源码改动（`build.mjs`、`assets/`、`data/`、`scripts/`、文档）放到最新 `main` 上，重跑 `node build.mjs` 再推。
- 上线后验证：等 1–2 分钟，`curl -s "https://ww880412.github.io/learning/<路径>?t=$RANDOM" | grep <新内容>`；涉及脚本的，用无头浏览器打开线上页看 console 有没有报错。

## 7. 其他约定（原有）

- **改样式或模板前先读 `DESIGN.md`**：令牌、组件、只用 Lucide 图标、动效规则、布局要紧凑。
- 新增界面图标：先把名字加进 `scripts/vendor-icons.mjs` 的 `NAMES`，运行后再用 `ic('name')`。不要写 emoji 图标。
- 产品灵感（PH灵感箱）：数据在 `data/ph-inspo.json`，每天在 `days` 最前面追加一天 `{date, source, fetched, note, items}`；改状态改 `item.status`（新发现/在跟进/已试用/归档），跟进写进 `item.followups`（`{date, type: 新版本|融资|定价|开源替代|其他, text, url}`）。改完 `node build.mjs`，生成 `ph-inspo/index.html` 和首页入口。
- DSH 插件市场盘点：数据在 `data/dsh-plugins.json`，苏茶原文归档在 `sources/suercha-50-plugins.md`（只作引用）。改完 `node build.mjs`，生成 `dsh-plugins/index.html`、顶栏和首页入口。只写盘点里已核实的事实，不补数字或仓库。
