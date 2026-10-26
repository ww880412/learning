# 王玮的学习知识库

静态网站，中文界面。本地直接用浏览器打开 `index.html`（file:// 可用），也能整体放到 GitHub Pages 子路径（如 `/learning/`）下，所有内部链接都是相对路径。已发布：https://ww880412.github.io/learning/（仓库 ww880412/learning，推到 main 即更新）。

> 设计规范：改样式、模板、图标之前先看 [`DESIGN.md`](DESIGN.md)（令牌、组件、只用 Lucide 图标、动效、紧凑布局）；外部 agent（Codex、Cursor、Claude Code、其他 bot）改仓库前先读 [`AGENTS.md`](AGENTS.md)：哪些文件是生成的、哪些 bot 什么时候推 `main`、怎么测试和发布。

## 路径速查（给学习搭子 / 记忆用）
- 根目录：`/workspace/learning/`
- 公开课：`courses/<课程>/`，例如 `courses/cs146s/`（L01：`courses/cs146s/L01-agent-loop.html`，进度 `progress.md`，索引 `INDEX.md`）
- X 好文：`x-posts/<作者-主题>/`，例如 `x-posts/huangtongxueh-ai-dev/huangtongxueh-ai-dev.html`
- 技术研究：`research/`；微信公众号：`wechat/`
- 概念卡：`concepts/<id>.html`，总表 `glossary.html`
- 数据：`data/columns.json`（栏目）、`data/items.json`（主题和学习页）、`data/concepts.json`（概念卡）、`data/review.json`（复习队列）、`data/inbox.json`（收件箱）
- 不发布的私有文件：`_private/`（学习搭子设定草稿、奥义文章、模板样例、CS146S 原始课件 `_private/cs146s/sources/`、文章原文 `_private/x-articles/`）
- 旧路径仍可用（相对软链接）：`cs146s/` → `courses/cs146s/`，`x-articles/*` → 新位置，根目录 `aoyi-article.md` 等 → `_private/`

## 重新生成
```
node build.mjs
```
生成：`index.html`、各栏目 `*/index.html`、主题页（如 `courses/cs146s/index.html`）、`glossary.html`、`concepts/*.html`、`review.md`；并为新学习页自动补排复习日期（写回 `data/review.json`）。学习页本身（如 `L01-agent-loop.html`）不由它生成，仍用 xuexi-template 的 `build.sh` 制作。同时重写 `digest/YYYY-MM-DD.html` 和 `data/digest/`。

## 每日汇总

北京时间每天 9:00 的推送和 `digest/YYYY-MM-DD.html` 是同一天的内容，机器可读版是 `data/digest/YYYY-MM-DD.json`。日期 D 都是北京时间：

- **X 简报**：文件名是美东日期，固定美东 21:00 发布。美东时间随夏令时变化：夏令时（3 月到 11 月初）等于北京时间次日 09:00，冬令时（2026-11-01 起到次年 3 月）等于北京时间次日 10:00。不论哪种，都是北京的第二天，所以 D 一般对应 `x-brief/(D−1).html`。页面 `<head>` 或刊头里若有带时区的发布时间（ISO 时区，或写明 ET / PT），改用该时间换算成 `Asia/Shanghai` 的日期。只有日期、没有钟点的刊头不算。文件名和链接不改。
- **X 海报**：目录已是北京日期，用 `x-posters/D/`。
- **产品灵感**：Product Hunt 榜单日是太平洋时间，这份榜要到北京时间次日晚上才入库。D 日早上 09:00 能对上的，是最新一份榜单日 ≤ D−2 的那组。页面写实际榜单日（例如「榜单 10/22」），不把榜单日写成「更新」。
- **雷达**：每周一北京时间 09:00 一份周报，平时随时补录，不是每天刷新。

某一来源这天没有，汇总里就是空，不拿别的天硬凑。简报或海报只要有一边先到，就生成这一天的 `digest/D.html`。最新一天缺的来源写「今天的还没出」；更早的日期写「这天还没有简报 / 海报 / 产品灵感」。海报晚到后再跑 `node build.mjs`，仍更新同一天的页面和首页那一行。产品灵感按 ≤ D−2 取当时已经入库的最新一份，并标出那份榜的真实日期。首页新闻卡的「更新」同样是北京日期。

首页「今日」的每日汇总行（A/B/C 同一行）始终显示最新一天。标「今天」只在这一天等于浏览者的北京时间今天时出现（`?today=YYYY-MM-DD` 可自查）；否则只标日期，例如「10/24」。

## 加一篇学习页
1. 用 `/workspace/skills-src/xuexi-template/build.sh` 做好学习页，放到对应栏目目录（公开课放 `courses/<课程>/`，其他一篇一个目录）。
2. 在 `data/items.json` 的 `items` 里加一条：`id, column, group(公开课填课程 id), order, label, title, href, preview, status(进行中/已学/待小测), start(YYYY-MM-DD), cards, note, source`。新课程还要在 `groups` 里加一条。
3. 涉及的概念：在 `data/concepts.json` 给已有概念的 `refs` 加 `{"item":"…","card":卡片号,"note":"…"}`，或新增概念（定义只写学习页/原文里有的内容）。
4. `node build.mjs`。复习日期按开始日期第 1、3、7、14、30 天自动排好。

## 加一个栏目
建目录（如 `podcasts/`），在 `data/columns.json` 加一条 `{"id","dir","title","icon","desc"}`，`node build.mjs`。首页会多一张卡片，空栏目显示「还没有内容」。

## 复习打卡
在首页「今日」勾上一条到期复习，就把这篇当前已经到期、还没完成的复习全部记成完成。记录在这台浏览器的 localStorage（`rev-done:<条目 id>`，第几天对应完成日期）。同一天取消勾选会撤销。勾完的行当天仍显示为已看，第二天消失；下一次复习按原定日期出现。

也可以把 `data/review.json` 里对应的 `"done": false` 改成 `true`，再 `node build.mjs`。两边任一处记成完成都算数。首页按浏览器当天日期计算（`?today=YYYY-MM-DD` 可自查）。

本机若在收藏页「同步设置」保存了和收藏相同的 GitHub 令牌，「今日」勾选还会把 `data/review.json` 里对应的 `done` 写成 `true`（可带 `doneOn` 完成日）。取消勾选写回 `false`，不删除 `learned`。课程页「学完了」会把北京时间的日期写入 `learned`，已有更早的日期则保留更早的。没有令牌时只写本机。

## 发布
`.gitignore` 已排除 `_private/` 和指向它的快捷方式；`.nojekyll` 已放好。改完后 `node build.mjs`，再 `git push` 到 main。L01 的 lesson.html 源文件在 `_private/cs146s/L01-lesson/`（不发布）。

## 学习状态体系

由 `build.mjs` 的 `stateOf()` 按 `data/items.json` 和 `data/review.json` 自动算出，不要手写状态标签。

| 状态 | 颜色 | 规则 |
|---|---|---|
| 未开始 | 灰 | 条目 `status: "未开始"`，还没有学习页（只列官方资料） |
| 进行中 | 蓝 | 学习页已上线，但小测或复述还没过 |
| 已学完 | 绿 | 小测答对 ≥ 5/6（`quiz: {"correct": 5, "total": 6}`）**且** 复述通过（`retell: true`） |
| 已掌握 | 紫 | 已学完，**且** `review.json` 里第 14 天复习 `done: true`，期间没有因答错重置（`reset` 为空或 0） |

- 学完小测：在 items.json 对应条目写 `quiz`；复述通过写 `retell: true`；运行 `node build.mjs`。
- 复习答错重置时：把 `reset` 加 1，并重排 review.json 里该条目的日期。
- 首页显示四种状态的计数；课程主题页和课程卡显示进度条（例：已学完 3/11）。
- 旧的「已学」统一改叫「已学完」。
