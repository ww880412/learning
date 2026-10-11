# 王玮的学习知识库

静态网站，中文界面。本地直接用浏览器打开 `index.html`（file:// 可用），也能整体放到 GitHub Pages 子路径（如 `/learning/`）下，所有内部链接都是相对路径。**目前只在本地构建，尚未发布。**

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
生成：`index.html`、各栏目 `*/index.html`、主题页（如 `courses/cs146s/index.html`）、`glossary.html`、`concepts/*.html`、`review.md`；并为新学习页自动补排复习日期（写回 `data/review.json`）。学习页本身（如 `L01-agent-loop.html`）不由它生成，仍用 xuexi-template 的 `build.sh` 制作。

## 加一篇学习页
1. 用 `/workspace/skills-src/xuexi-template/build.sh` 做好学习页，放到对应栏目目录（公开课放 `courses/<课程>/`，其他一篇一个目录）。
2. 在 `data/items.json` 的 `items` 里加一条：`id, column, group(公开课填课程 id), order, label, title, href, preview, status(进行中/已学/待小测), start(YYYY-MM-DD), cards, note, source`。新课程还要在 `groups` 里加一条。
3. 涉及的概念：在 `data/concepts.json` 给已有概念的 `refs` 加 `{"item":"…","card":卡片号,"note":"…"}`，或新增概念（定义只写学习页/原文里有的内容）。
4. `node build.mjs`。复习日期按开始日期第 1、3、7、14、30 天自动排好。

## 加一个栏目
建目录（如 `podcasts/`），在 `data/columns.json` 加一条 `{"id","dir","title","icon","desc"}`，`node build.mjs`。首页会多一张卡片，空栏目显示「还没有内容」。

## 复习打卡
把 `data/review.json` 里对应的 `"done": false` 改成 `true`，再 `node build.mjs`。首页「今天该复习」按浏览器当天日期计算：今天到期标黄，逾期标红。

## 发布（尚未进行）
`.gitignore` 已排除 `_private/` 和指向它的快捷方式；`.nojekyll` 已放好。发布到 GitHub Pages 需要用户在私聊里登录 GitHub 后再做。
