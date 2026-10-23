# 扒了市场上 6254个插件，梳理出我常用的 50+效率插件
Author: 苏茶 (@Suercha007) — X Article
URL: https://x.com/Suercha007/status/2112791503278125329
Stats shown: 7 replies / 9 reposts / 78 likes(approx., as displayed "7 9 78") / 1.1万 views
Capture notes: Text captured verbatim from the rendered article. NOTE: the plugins are for "DSH" = DeepSeek Harness (a DeepSeek coding-agent harness/desktop app) — NOT Claude Code/Codex/Cursor/browser, though some plugins imitate Claude Code / Codex UI or bridge to them. Repo link labels in the article are shown as "GitHub - owner/repo: description" link cards (descriptions truncated by X); the real hrefs are given as "仓库 href". One image (cover/media) exists: /Suercha007/article/2112791503278125329/media/2112788339816570880 (not described in text; image content not viewed). No install commands appear in the article.

---
首先说一哈，大部分插件在下面的仓库中都有收录。
https://github.com/awesome-dsh-plugin/awesome-dsh-plugin

还有一部分是是在博主日常开发中需要用到，专门去找到的一些插件，经过实际拷打，整理出来这几十个我觉得有用的插件，给友友们看下，也可以顺着这个分类去找下自己需要的。

还有给大家推荐必装的插件，就是插件市场的插件，下面这些大部分都能找到，直接点击安装即可。https://github.com/dsh-market/dsh-market/

## 1. 上下文与记忆
### 1. billion-context
下载量：177.3 万
一句话：官方上下文压缩，省 5 倍 token，小窗口跑数月级会话。
仓库：GitHub - ranxianglei/billion-context: A context-compression plugin for month-long single sessions (b… | https://github.com/ranxianglei/billion-context
### 2. dsh-archive-manager
下载量：16.2 万
一句话：在设置里搜索、恢复和删除已归档会话。
仓库：https://github.com/MichengAI/dsh-archive-manager
### 3. dsh-context
下载量：15.7 万
一句话：Context 仪表盘加 /context，查看组成、压缩与注入。
仓库：GitHub - bowenliang123/dsh-context: The best DeepSeek Harness plugin for context insight and managem… | https://github.com/bowenliang123/dsh-context
### 4. hindsight#coding-agents
下载量：5.7 万
一句话：会学习的长期记忆，自动召回和保存，按仓库隔离记忆银行。
仓库：hindsight/hindsight-integrations/coding-agents at main · vectorize-io/hindsight | https://github.com/vectorize-io/hindsight/tree/main/hindsight-integrations/coding-agents
### 5. dsh-mnemon
下载量：4.9 万
一句话：跨 Agent、本地优先的持久记忆，带语义召回和知识图谱。
仓库：https://github.com/omdsh-dev/dsh-mnemon
### 6. OpenViking memory
下载量：3.8 万
一句话：自动召回、画像注入、会话捕获，对接 OpenViking 服务端。
仓库：https://github.com/volcengine/OpenViking/tree/main/examples/dsh-memory-plugin
### 7. dsh-memory
下载量：2.6 万
一句话：白箱 AGI 探索，元认知、持续学习、世界模型。
仓库：GitHub - FuRongJun-1999/dsh-memory: 白箱AGI架构探索：元认知（自我认知循环）、持续学习（知识飞轮）、世界模型（条件空间+语义时空图）、自我改进（自举纪律）、零LL… | https://github.com/FuRongJun-1999/dsh-memory
### 8. dsh-rewind
下载量：2.6 万
一句话：同会话回退到任意消息，可还原工作区文件。
仓库：https://github.com/SiriLee/dsh-rewind

## 2. 界面与主题
### 9. dsh-codex-ui
下载量：23.2 万
一句话：Codex 风格侧栏、会话树、全局搜索和轮次导航。
仓库：https://github.com/MichengAI/dsh-codex-ui
### 10. DSH-better-sidebar
下载量：20.9 万
一句话：侧边栏工作台，文件、终端、Git、子代理都能开 Tab。
仓库：GitHub - omdsh-dev/DSH-better-sidebar: 开放的侧边栏底座，支持三方拓展注册新侧边栏页面。内置文件渲染编辑/终端/侧边对话/Git/子代理页面 ｜ Open sid… | https://github.com/omdsh-dev/DSH-better-sidebar
### 11. DeepSeek-Balance-Whale-Widget
下载量：19.9 万
一句话：鲸鱼挂件，显示余额、今日用量和单轮成本。
仓库：GitHub - MeteorNOX/DeepSeek-Balance-Whale-Widget: DeepSeek Harness（DSH）一只住在 DSH 界面右下角的小鲸鱼娘，帮你盯着DeepS… | https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget
### 12. dsh-skills-manager
下载量：19.5 万
一句话：设置里管理本地技能，只读查看公共 Agent 技能。
仓库：https://github.com/MichengAI/dsh-skills-manager
### 13. dsh-skill-explorer
下载量：14.0 万
一句话：技能中心，按来源浏览，启停、新建、回收。
仓库：dsh-web/packages/dsh-skill-explorer at main · zhu1090093659/dsh-web | https://github.com/zhu1090093659/dsh-web/tree/main/packages/dsh-skill-explorer
### 14. dsh-pet
下载量：13.7 万
一句话：鲸鱼娘桌宠，跟随 agent 状态，可摸头投喂。
仓库：https://github.com/zhu1090093659/dsh-pet
### 15. dsh-web-all
下载量：10.3 万
一句话：Web UI 插件与皮肤合集，看板、Git 图、远程、桌宠都在。
仓库：dsh-web/packages/dsh-web-all at main · zhu1090093659/dsh-web | https://github.com/zhu1090093659/dsh-web/tree/main/packages/dsh-web-all
### 16. dsh-pet（PC2005 版）
下载量：6.6 万
一句话：25 个透明动画、屏幕漫游、点击反应。
仓库：https://github.com/PC2005-cloud/dsh-pet/tree/main/dsh-pet
### 17. dsh-codex-pet
下载量：6.4 万
一句话：页内宠物，多会话任务提醒，能处理审批和问答。
仓库：GitHub - MichengAI/dsh-codex-pet: DSH Codex Pet — 为 DeepSeek Harness 提供宠物陪伴、多任务提醒与交互，以及 Skill 自定义宠物… | https://github.com/MichengAI/dsh-codex-pet
### 18. dsh-wallpaper-engine
下载量：5.8 万
一句话：把 Wallpaper Engine 壁纸播到聊天界面后面。
仓库：https://github.com/elysia395/dsh-wallpaper-engine
### 19. dsh-TUI
下载量：4.7 万
一句话：Claude Code 风格全屏终端，像素鲸鱼顶栏和状态行。
仓库：GitHub - ccch1mneyyy/dsh-TUI: DSH's officially top-recommended TUI plugin — high performance, low ov… | https://github.com/ccch1mneyyy/dsh-TUI
### 20. maid-atelier
下载量：4.2 万
一句话：深海女仆工坊主题皮肤。
仓库：dsh-deep-whale/maid-atelier at main · Small-tailqwq/dsh-deep-whale | https://github.com/Small-tailqwq/dsh-deep-whale/tree/main/maid-atelier
### 21. dsh-genui
下载量：3.7 万
一句话：回复里直接渲染图表、表单、3D 等交互 UI。
仓库：https://github.com/omdsh-dev/dsh-genui
### 22. dsh-dream-skin
下载量：3.2 万
一句话：8 套原创主题，一键换肤，支持主题包导入导出。
仓库：https://github.com/RevolutionLA/dsh-dream-skin
### 23. dsh-claude-style
下载量：1.8 万
一句话：复刻 Claude Code Desktop 的视觉与交互。
仓库：GitHub - Nwflower/dsh-claude-style: Claude Code Desktop theme for DeepSeek Harness｜ 为 DeepSeek Harne… | https://github.com/Nwflower/dsh-claude-style

## 3. 任务与开发
### 24. dsh-agency-agents
下载量：12.9 万
一句话：可召唤的领域专家，以子代理运行，主会话只留最终答复。
仓库：https://github.com/MichengAI/dsh-agency-agents
### 25. dsh-task-board
下载量：12.5 万
一句话：看板卡片跑真实 agent 会话，支持 cron 定时。
仓库：https://github.com/zhu1090093659/dsh-web/tree/main/packages/dsh-task-board
### 26. dsh-git-graph
下载量：11.7 万
一句话：输入框上方切分支，分支泳道和提交历史成图。
仓库：https://github.com/zhu1090093659/dsh-web/tree/main/packages/dsh-git-graph
### 27. dsh-cost-meter
下载量：10.6 万
一句话：会话与当日 API 费用、预算、余额、历史看板。
仓库：https://github.com/Han-1413141/dsh-cost-meter
### 28. dsh-automation
下载量：10.3 万
一句话：在独立会话里按计划跑编码任务。
仓库：https://github.com/MichengAI/dsh-automation
### 29. dsh-btw
下载量：8.5 万
一句话：/btw 一次性旁问，不执行工具，不写入主对话。
仓库：GitHub - MichengAI/dsh-btw: DSH 一次性只读旁问插件：基于当前上下文回答，独立气泡，不执行工具 · One-shot read-only side-ask plugin:… | https://github.com/MichengAI/dsh-btw
### 30. dsh-simplify
下载量：7.3 万
一句话：/simplify，在选定 Git 变更范围内简化代码。
仓库：https://github.com/MichengAI/dsh-simplify
### 31. dsh-pua
下载量：6.7 万
一句话：/pua，失败后换方法，宣称完成前先核验收据。
仓库：GitHub - MichengAI/dsh-pua: DSH PUA — 为 DeepSeek Harness 提供 PUA 任务推进、角色风味、验收循环和运行状态卡片 · PUA task per… | https://github.com/MichengAI/dsh-pua
### 32. dsh-code-review
下载量：5.9 万
一句话：/review 用独立子 Agent 审查选定 Git 范围。
仓库：https://github.com/MichengAI/dsh-code-review
### 33. dsh-univer-office
下载量：4.5 万
一句话：表格、文档、幻灯片、多维表格进同一个运行时。
仓库：https://github.com/dream-num/dsh-univer-office
### 34. dsh-agent-teams
下载量：4.5 万
一句话：多智能体团队。
仓库：GitHub - NanmiCoder/dsh-agent-teams: DeepSeek Harness 的 Agent Teams 多智能体协作插件，支持多个 AI Agent 组成团队，协同完成… | https://github.com/NanmiCoder/dsh-agent-teams
### 35. lunheng-article-pipeline
下载量：3.9 万
一句话：9 角色长文生产流水线，从检索到同行评审。
仓库：GitHub - zuoyunlai/lunheng-article-pipeline-dsh: 论衡（lunheng-article-pipeline）DeepSeek Harness bundle… | https://github.com/zuoyunlai/lunheng-article-pipeline-dsh
### 36. GraphFlow
下载量：3.2 万
一句话：本地代码知识图谱，10 个 MCP 工具，增量 AST 建图。
仓库：GitHub - Roarpeng/GraphFlow: Local-first code knowledge graph and context harness for coding agents. | https://github.com/Roarpeng/GraphFlow
### 37. archify
下载量：3.2 万
一句话：从仓库生成交互式架构图、时序图、数据流图。
仓库：https://github.com/tt-a1i/archify/tree/main/integrations/deepseek-harness
### 38. dsh-image-gen
下载量：2.6 万
一句话：让 agent 在对话里直接画图，结果留在当前会话。
仓库：https://github.com/shanliuling/dsh-image-gen
### 39. dsh-ops
下载量：2.3 万
一句话：给 Windows 的 DSH 提供 bash、PowerShell 7 和 Rust 工具。
仓库：GitHub - T-Auto/dsh-ops: A toolkit for low-level operations in DSH, designed to reduce token usage a… | https://github.com/T-Auto/dsh-ops
### 40. dsh-plugin-gating-hub
下载量：2.1 万
一句话：升级前预检、失败回滚，隔离拖垮启动的插件。
仓库：GitHub - Noob-stupid/dsh-plugin-gating-hub: DSH plugin - framework upgrade safety & plugin gating: c… | https://github.com/Noob-stupid/dsh-plugin-gating-hub
### 41. dsh-code-review（feng 版）
下载量：2.0 万
一句话：复用当前 Agent 只读审查 Git 与 SVN 变更。
仓库：https://github.com/f-e-n-g-0531/dsh-code-review

## 4. 连接、远程与模型
### 42. dsh-remote-web-ui
下载量：12.6 万
一句话：手机扫码远程控制 dsh web，SSE 实时同步。
仓库：https://github.com/zhu1090093659/dsh-web/tree/main/packages/dsh-remote-web-ui
### 43. dsh-im-connect
下载量：12.3 万
一句话：微信、企微、钉钉、飞书、QQ、TG 接进来。
仓库：GitHub - MichengAI/dsh-im-connect: DSH IM Connect — 将主流即时通讯平台接入本机 DeepSeek Harness · Connect major m… | https://github.com/MichengAI/dsh-im-connect
### 44. dsh-ssh
下载量：10.5 万
一句话：SSH 面板，Web 终端、SFTP、端口转发、批量执行。
仓库：https://github.com/zhu1090093659/dsh-web/tree/main/packages/dsh-ssh
### 45. dsh-im
下载量：6.2 万
一句话：扫码或机器人凭据接入飞书、微信、钉钉、QQ、Slack 等 9 个渠道。
仓库：https://github.com/xmanrui/dsh-im
### 46. BrowserSkill
下载量：2.8 万
一句话：控制可见 Chrome 和 Edge 的浏览器自动化桥。
仓库：https://github.com/Tencent/BrowserSkill/tree/main/packages/dsh-plugin-browserskill
### 47. dsh-codex-subscription
下载量：2.5 万
一句话：ChatGPT OAuth 在 DSH 里用 Codex 模型，免 API Key。
仓库：https://github.com/WSL043/dsh-codex-subscription
### 48. dsh-mcp-connector
下载量：2.3 万
一句话：MCP 管理面板，统一连接、授权与工具搜索。
仓库：https://github.com/duhu2000/dsh-mcp-connector
### 49. dsh-find-plugin
下载量：2.3 万
一句话：会话里搜插件，直接返回描述和安装命令。
仓库：https://github.com/awesome-dsh-plugin/dsh-find-plugin
### 50. dsh-connect-workbuddy
下载量：2.2 万
一句话：把本机登录的 WorkBuddy 模型接进 DSH。
仓库：https://github.com/dingminhua/dsh-connect-workbuddy
### 51. dsh-browser
下载量：2.0 万
一句话：共享真实浏览器，20 个 browser_* 工具，用户可随时接管。
仓库：GitHub - wqty123/dsh-browser: Shared real browser plugin for DeepSeek Harness | https://github.com/wqty123/dsh-browser
### 52. dsh-wsl
下载量：5,369
一句话：在 WSL 真内核上跑 Linux 命令，退出码、信号、超时都保留。
仓库：GitHub - XINY11451/dsh-wsl: A model-facing WSL tool plugin for DeepSeek Harness (DSH). It lets an ag… | https://github.com/XINY11451/dsh-wsl

## 5. 搜索、视觉与安全
### 53. modlens
下载量：9.5 万
一句话：给纯文本模型加视觉，图片转 OCR、版面、语义 JSON。
仓库：https://github.com/liustack/modlens
### 54. cc-safety-net
下载量：5.7 万
一句话：执行前拦破坏性 Git、文件命令和密钥访问。
仓库：GitHub - kenryu42/cc-safety-net: A pre-execution guard for AI coding agents. It blocks destructive G… | https://github.com/kenryu42/cc-safety-net
### 55. dsh-free-search
下载量：5.1 万
一句话：免 key 搜索，7 个引擎自动回退。
仓库：https://github.com/DDDMUC/dsh-free-search
### 56. modsearch
下载量：4.3 万
一句话：搜索网页和 X，返回可引用的结构化 JSON 证据。
仓库：https://github.com/liustack/modsearch
### 57. dsh-vision-router
下载量：3.3 万
一句话：免 Key 视觉链，加 OCR、定位、裁剪、像素对比工具。
仓库：GitHub - ysr666/dsh-vision-router: Eyes for text-only DeepSeek Harness agents: built-in free vision … | https://github.com/ysr666/dsh-vision-router

---
但要注意，插件真不是越多越好。装十几个之后，启动会变慢，快捷键和侧边栏也会互相抢位置。dsh-web-all 这种合集，跟里面单装的组件别重复上。

还有几个同名不同作者的坑：dsh-pet 和 dsh-code-review 都各有两版，认准作者再装。

上面给的是仓库地址，不是安装命令。真正装的时候在市场里点，或者用市场给的 npm 包名，别直接拿 GitHub 地址往 pnpm 里塞，容易把整个 monorepo 拖下来。

刚开始用，先挑三五个就够：billion-context、better-sidebar、task-board、ssh，覆盖面已经很大。
最近还有一个破假的插件比较火，但原仓库已经被干掉了。有一些开发者把它 fork 下来了，大家可以去找一下。
