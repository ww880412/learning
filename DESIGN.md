# DESIGN.md · 学习库设计规范（V4 · 活版书房）

所有生成或修改本站页面的人和 bot（学习搭子、X Brief、X 海报日报、PH 灵感箱等）都按这份规范来。令牌的实际值在 `assets/site.css`（及共享文章外壳 `assets/article.css`），这里是摘要。**改样式先改令牌，不要在页面里写零散的颜色、字号和间距。**

技术栈固定为：静态 HTML + `assets/site.css`（V4 活版书房令牌与组件）+ `assets/vp-head.js`（深浅色切换、全站目录抽屉、筛选、灯箱、折叠锚点、运行时图标）+ Lucide 图标（`assets/icons.json`）。零外部框架，零外链字体与 CDN。

## 1. 主题与令牌（单一 V4 · 浅/深双模式）

旧版 A/B/C 三套皮肤切换器（`site-theme` / `data-theme`）已退役，生产统一采用单一 **V4「活版书房（Living Monograph）」**视觉系统；遗留的 `site-theme` 键被静默忽略，不做迁移或清空。

浅色/深色模式保留，使用 `html.dark` 与 localStorage 键 **`theme`**（`dark` / `light`），由 `assets/vp-head.js` 的 `__tt()` 切换并在首屏绘制前同步。

| 令牌 | 浅色（棉纸） | 深色（墨夜） | 用途 |
|---|---|---|---|
| `--bg`（别名 `--paper`） | `#f6f3ec` | `#111211` | 页面纸面底色 |
| `--surface`（别名 `--sheet`/`--card`） | `#fcfbf8` | `#181a18` | 卡片、折叠面板、详情底色 |
| `--surface-soft`（别名 `--hair2`） | `#ede8de` | `#212421` | 次级底色、行内代码底、进度条底轨 |
| `--obsidian` / `--obsidian-2` | `#151917` / `#1f2522` | `#1d2420` / `#252e29` | 砚墨焦点块（首页「继续学」案头、海报暗房、雷达本周首选） |
| `--ink` / `--ink-2` / `--ink-3` | `#171614` / `#4b4740` / `#78736a` | `#eeeae1` / `#b6b0a4` / `#8a8478` | 正文、次级文字、元信息 |
| `--rule` / `--rule-strong` | `rgba(23,22,20,.12)` / `.78` | `rgba(238,234,225,.12)` / `.72` | 极克制分隔线与刊头底线 |
| `--cinnabar`（别名 `--red`） | `#b83b24` | `#e86c53` | 绛赭：眉标、主导航激活线、重要信号、逾期警示 |
| `--indigo`（别名 `--blue`） | `#1d4b6e` | `#7db5dc` | 苍蓝：正文链接、进行中状态、架构借鉴边线 |
| `--ok`（别名 `--green`） | `#1d6b4a` | `#59c890` | 松绿：已学完、今日已读勾选、无到期复习 |
| `--warn`（别名 `--amber`） | `#945605` | `#ecba5b` | 赭黄：限制/前提提示、参考清单标识 |

### 字体与标尺
- **字体栈（离线本机）**：
  - 标题 / 刊头 `--serif`：`"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "Source Han Serif CN", "SimSun", Georgia, serif`
  - 正文 `--sans`（别名 `--font`）：`-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", system-ui, sans-serif`
  - 数字与代码 `--mono`：`ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`，数字统一 `tabular-nums`。
- **容器与留白**：主容器 `--max-w: 1180px`，左右留白 `--pad-x: clamp(18px, 4vw, 44px)`，顶栏高 `60px`（手机 `52px`），手机底栏高 `58px`（页面底部预留 `calc(126px + env(safe-area-inset-bottom))` 确保末条完全滚离避让）。

## 2. 导航与页壳

- **顶栏（`.site-header.top`）**：品牌（绛赭圆点 + 衬线站名）+ 5 个高频主枢纽（今日、公开课、X 好文、每日汇总、雷达）+「全站目录」（`/` 或 `⌘K` 打开 `<dialog class="atlas-dialog">` 列出全部 13+ 真实栏目与实时计数）+ 收藏星（由 `favorites.js` 挂载于 `.top .dm` 前）+ 深浅色切换按钮（`.dm`）。
- **手机底栏（`.mobile-dock`）**：仅在 `<= 780px` 通用浏览页显示，4 项（今日、公开课、日更、全站），实底磨砂贴底；文章精读页不启用底栏。
- **外部 bot 兼容**：X 简报与 X 海报 bot 生成页内联 `assets/site.css` + `assets/vp-head.js`，其旧顶栏（`header.top:not(.site-header)`）自动继承 V4 棉纸/衬线/绛赭样式，并获得「全站目录」抽屉与手机折叠菜单。

## 3. 核心版式与窄屏防裁切铁律

- **首页双主角（`.home-stage`）**：
  - 桌面（`>= 961px`）：左 `1.18fr` 今日头版（无框直排：刊头、头条导语、前提争议折叠、同日另两条主线）+ 右 `0.88fr` 砚墨「继续学」案头卡（`.study-monolith`：主读卡、次要在学区 `.monolith-secondary`、间隔复习区）。
  - 平板（`781px–960px`）：案头卡置顶，`.monolith-secondary` 两列并排。
  - 手机（`<= 780px`）：刊头收束，砚墨案头卡转为紧凑书签形态（隐藏次要项第三行副标题 `.mi-sub`，保留完整篇名/进度/热区），确保「继续学」与「今日头条」共居 390×844 首屏。
- **窄屏防裁切铁律（390px / 320px）**：
  - **禁止**在 `html` 或 `body` 上写 `overflow-x: clip` 来掩盖溢出。
  - 所有单列和响应式 Grid 轨道必须显式写成 `minmax(0, 1fr)`，内容列必须有 `min-width: 0`。
  - 行内 `code` 及雷达标题/路径/摘要/借鉴框必须启用 `overflow-wrap: anywhere; word-break: break-word; box-decoration-break: clone;`，让长路径在 390px 与 320px 视口内逐字可读、零右侧裁切。
- **公开课列表（`.course-ledger`）**：无重型卡片外壳，手机端隐藏 `.ce-thumbs` 缩略条、两行截断简介，确保首屏可见多门课程；`courses/ai-agent-catalog/courses.html` 保留独立「公开课参考清单」入口，不计入课程与复习。
- **文章精读外壳（`assets/article.css`）**：保持原 `<main class="deck">` 与小测/模拟器内置 JSON 协议不变；桌面 `.fin-btn` 停靠左轨底 `.toc-foot`，`< 1180px` 停靠顶栏右侧 `.top-actions`，屏底零悬浮按钮遮挡正文。

## 4. 图标与动效

- **图标（只用 Lucide）**：构建时从 `assets/icons.json` 内联 SVG；运行时通过 `vp-head.js` 的 `__ic()` 提供 `menu` / `x` / `star` / `party-popper`。不用 emoji 当界面图标。
- **动效**：克制过渡（`0.15s–0.35s cubic-bezier(0.22, 1, 0.36, 1)`）与主题切换 View Transitions；`prefers-reduced-motion: reduce` 时全部关闭。

## 5. 数据、进度与同步（不变）

- 所有内容与计数只来自本仓库 `data/*.json`、`x-brief/`、`x-posters/`，日期统一按北京时间（`Asia/Shanghai`）显示。
- 存储键与同步协议保持不变：`done:<path>`、`rev-done:<id>`、`rev-op:<id>`、`rev-join:<id>`、`today-read:<YYYY-MM-DD>`、`fav:token`、`fav:cache`、`theme`。
- `assets/favorites.js` 必须保持可单独引用（自动补载 `gh.js` 与 `progress.js`）。
