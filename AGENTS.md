# AGENTS.md · 给改这个仓库的 bot

- **改样式或模板前先读 `DESIGN.md`**：令牌、组件、只用 Lucide 图标、动效规则、布局要紧凑。
- 生成页面：`node build.mjs`（首页、栏目页、概念卡、收藏页）；X 简报用 `/workspace/x-brief/site/build.py`，海报用 `/workspace/daily-x-tech-posters/scripts/publish_gallery.py`。两个发布流程都会顺带运行 `scripts/rebuild-home.sh`，重建首页。
- 新增界面图标：先把名字加进 `scripts/vendor-icons.mjs` 的 `NAMES`，运行后再用 `ic('name')`。不要写 emoji 图标。
- 不碰 `_private/`；不在 main 上做大改版，先开分支。
