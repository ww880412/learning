# DESIGN.md · 学习库设计规范

所有生成或修改本站页面的人和 bot（学习搭子、X Brief、X海报日报 等）都按这份规范来。令牌的实际值在 `assets/site.css`，这里是摘要。**改样式先改令牌，不要在页面里写零散的颜色、字号和间距。**

技术栈固定为：静态 HTML + `assets/site.css`（令牌 + 组件）+ `assets/vp-head.js`（主题、动效、运行时图标）+ Lucide 图标（`assets/icons.json`）。不用框架，不依赖 CDN。

## 1. 主题与令牌

三套主题由 `html[data-theme=A|B|C]` 切换，默认是 **C**。`vp-head.js` 在页面画出来之前就设好主题，用户的选择存在 localStorage `site-theme`。深色模式用 `html.dark`，可以和三套主题任意组合。

| 令牌 | A 杂志 | B 仪表盘 | C 个人站（默认） |
|---|---|---|---|
| `--paper` 背景 | #f7f4ee · 深 #181512 | #eef1f5 · 深 #0b0d12 | #f3f5fb · 深 #0b0b0f |
| `--sheet` 卡片 | #fffdf9 · 深 #211d18 | #fff · 深 #14151a | #fff · 深 #15151c |
| `--ink` 正文 | #2b2722 · 深 #ede6da | #16171a · 深 #ececf1 | #1d2340 · 深 #f2f2f5 |
| `--meta` 次要文字 | #8a8076 · 深 #a89d8f | #6e707a · 深 #9597a3 | #8a90ad · 深 #9a9aab |
| `--hair` 细线 | #e6dfd3 · 深 #382f26 | #dfe4ea · 深 #252a35 | #e6e9f4 · 深 #26262f |
| `--blue` 主色 | #b4532a 砖红 · 深 #e08a5f | #5b5bd6 靛紫 · 深 #9198ff | #7b5cff 紫 · 深 #a08bff |
| `--acc2` 辅色（渐变/流光） | #c98a2b 琥珀 | #a855f7 紫 | #ff5e8a 粉 |
| 标志性表面 | 米色纸、衬线标题、双线报头 | 深色侧栏 #0f172a，选中项 #22c55e 竖条 | 深色顶栏 #0b0b0f，首页渐变 hero |
| 字体 | 标题 `--serif`（Noto Serif CJK），正文 Inter / PingFang | Inter / PingFang，基础字号 14px | Inter / PingFang |

状态色在三套主题里都可以用：`--red`（逾期、警示）、`--green`（已学完）、`--amber`（提示）、`--purple`（已掌握），每个都有对应的 `-soft` 浅底。**逾期只用红色**，其他地方不要用红色强调。

### 通用尺度（`:root`）
- 间距：`--sp-1..6` = 4 / 8 / 12 / 16 / 24 / 32px。卡片内边距 12–18px，卡片之间 10–14px，分区之间 ≤32px。
- 字号：`--fs-xs` 12 · `--fs-sm` 13.5 · `--fs-md` 15 · `--fs-lg` 18 · `--fs-xl` 24 · `--fs-2xl` 32。首页 hero 标题可以到 44–80px，只用在 A/C 的头条和大数字。标题字距 -0.01 到 -0.035em，数字用 `tabular-nums`。
- 圆角：`--r-xs` 6 · `--r-sm` 8 · `--r-md` 10 · `--r-lg` 12（C 主题为 20）· `--r-xl` 18 · `--r-pill` 999。
- 阴影：`--sh-1` 细、`--sh-2` 悬停、`--sh-3` 浮起。默认用边框，不用阴影，阴影只在悬停时出现。

## 2. 组件
- **卡片** `.card` / `.panel` / `.ps-t`：`--sheet` 底色、1px `--hair` 边框、`--r-lg` 圆角。可点的卡片悬停时上浮 1–3px，边框变成 `--blue`，并带鼠标光斑。重点卡片（简报头条、收藏）可以加 `.fx-feat` 流光边框，每屏最多 1–2 个。
- **按钮** `.btn`：主色实心，高 34–40px，圆角 8px；`.btn.ghost` 是描边按钮；`.btn.sm` 高 30px。文字用动词开头，例如「开始复习 →」「继续 →」。
- **标签** `.tag`：12px，`--hair2` 底色，可以带状态色（`.blue` `.green` `.amber` `.purple`，`.red` 只用于逾期）。
- **数字卡** `.kpi` / `.stat`：小标签 12px（`--meta`）+ 大数字 26–46px，粗细 750–800。数字会滚动增长：给元素加 `.cnt` 类，或放进 `.kpi`。
- **分区标题** `.kicker` + `.sub`：17–19px 加粗，前面是 3px 宽的主色渐变短线，`.n` 是计数胶囊；`.sub` 13.5px，`--meta` 色。
- **列表** `.list .row`：一个白底容器，行之间用 1px 细线分隔，行高紧凑（上下 8–12px）。
- **收藏星**：`favorites.js` 自动挂到页面、`a.card` 和简报原帖上。已收藏时是实心金色星（#e0a100）。不要手写 ☆ / ★。

## 3. 图标（只用 Lucide）
- 图标来源：`assets/icons.json`，由 `scripts/vendor-icons.mjs` 从 lucide-static 抽取，只收本站用到的图标。新图标先加进脚本的 `NAMES` 再运行。不要用 emoji 或其他图标库充当界面图标。
- 构建时内联：`build.mjs` 用 `ic(name, size)`，X 简报 `build.py` / 海报 `publish_gallery.py` 用 `ic()` / `XB.ic()`；浏览器里用 `__ic(name, size, 'fill')`，只含 menu / x / star / party-popper。
- 尺寸：行内 14–16px，按钮 18px，卡片图标 20px，标题 26px。描边 2，≥20px 用 1.75。颜色继承 `currentColor`。装饰性图标加 `aria-hidden`，只有图标的按钮要有 `aria-label`。
- 栏目图标映射（`COL_IC`）：公开课 graduation-cap · X 好文 file-text · 技术研究 flask-conical · 微信公众号 message-circle · 视频 circle-play · 概念卡 puzzle · X 简报 newspaper · X 海报 image · 产品灵感 rocket · DSH 插件 boxes · 雷达 radar · 每日汇总 calendar · 站点标志 book-open · 深色切换 sun-moon · 提示 lightbulb · 设置 settings。
- 文字里的箭头「→ ←」属于排版，不算图标，可以保留。用户写的内容（简报正文、海报原帖）里的 emoji 不用改。

## 4. 动效
- 时长：`--dur-1` 120ms（颜色、按下）· `--dur-2` 220ms（淡入淡出、主题切换）· `--dur-3` 420ms（位移、展开）。
- 缓动：位移和展开用 `--spring`（CSS `linear()` 弹簧，有轻微回弹；不支持的浏览器退回 cubic-bezier）；颜色和透明度用 `--ease`（easeOutQuint）。
- 会动的只有：悬停上浮或放大、收藏星弹出、折叠面板展开、进度条填充、数字滚动、首屏卡片错峰入场（每张 40ms，最多 10 张）、下方分区滚动到时淡入、主题和深色切换的交叉淡化（View Transitions）。
- 不要做：自动轮播、无限循环的大动画（流光边框是唯一例外，速度要慢）、视差、超过 500ms 的位移。
- `prefers-reduced-motion: reduce` 时关掉全部动画和过渡，直接显示内容，不做淡入。

## 5. 布局
- 紧凑，少留白：用户不喜欢大片空白。桌面版用满宽度（主区 1280–1320px，B 有侧栏），多列网格，网格里不能留大空洞，左右列要尽量等高。
- 网格列写成 `minmax(0,1fr)`，防止长文字把列撑开。
- 手机（≤900px）改成单列或两列，横向内容（海报）改成可滑动；可点区域 ≥40px。
- 三套首页布局同时渲染，靠 `data-theme` 切换显示（`.lay-A/B/C`）。共用的数据块放在布局外面。

## 6. 要做 / 不要做
- ✅ 新颜色、间距、圆角先加成令牌再用；三套主题和深色模式都要检查。
- ✅ 首页数据只来自 data/、x-brief/、x-posters/，空状态如实显示，不编造打卡天数或数字。
- ✅ 学习进度以 `data/review.json` 为准，本机勾选是临时记录。跨设备用首页「同步到其他设备」（见第 7 节）。不要把复习完成只写进按天的 `today-read:`。
- ✅ 外链只放在内容里；课程卡片之类的按钮只链本站学习页或课程页。
- ❌ 不用 emoji 当界面图标，不引入 CDN 或框架，不在页面里写内联颜色。
- ❌ 不在页面里写死主题（`data-theme`）；不要绕过 `build.mjs` 手改生成出来的 HTML。

## 7. 学习进度（换设备）

没有服务器，也没有令牌。两层记录：

- **`data/review.json` 是跨设备的准绳。** 学习搭子写入队列条目的 `learned`（「学完了」的日期，`YYYY-MM-DD`，可以没有）和 `reviews[].done`（某一次复习是否完成）。`node build.mjs` 重写这个文件时保留已有的 `learned` 和 `done`，并写进 `review.md` 的「学完」列。
- **浏览器里的勾选只属于这台设备，是临时记录。** `done:<pathname>` 是「学完了」的日期（课程页按钮写入，和首页 `doneOf()` 用的路径一致）。`rev-done:<条目 id>` 是「第几天 → 完成日期」：首页「今日」勾上复习行，就把当前已到期的待复习一次记完；当天仍显示为已勾，第二天消失。三套主题共用这一套计算。`today-read:<日期>` 只记当天简报、雷达有没有看过，不进同步。

首页怎么算：有 `learned` 或本机 `done:` 都算学过。排期优先用 `learned`；两边都有时用更早的那天，只有一边就用那一边。某一次复习在 `reviews[].done === true` 或本机 `rev-done` 里有这一天，都算完成。

换手机或电脑：三套主题的「今日」标题旁都有「同步到其他设备」。它给出首页链接，记录放在 hash 里：`#sync=` 后面是紧凑 JSON 的 base64url，只含 `done:` 和 `rev-done:`（形如 `{"d":{"/路径":"日期"},"r":{"条目 id":{"1":"日期"}}}`）。在另一台打开任意由 `build.mjs` 生成的页面（至少首页）会合并进那台的 localStorage：键取并集；同一条 `done:` 留更早的日期；`rev-done:` 按天合并，每天留更早的日期。不删除本机已有记录，也不改写路径。合并后用 `history.replaceState` 去掉 hash，并在「今日」标题下显示「已同步 N 条记录」。链接可以贴进聊天，在手机上打开。
