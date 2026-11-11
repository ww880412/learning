# 间隔复习队列

> 由 build.mjs 从 data/review.json 生成，不要手改本文件。
> 跨设备以本文件为准。`learned` 是「学完了」的北京日期，点学完不会自动排复习。只有 `joined`（用户点「加入复习」的北京日期）存在时才有 `reviews`。间隔 1、3、7、14、30 天，从 `joined` 当天算起，不从学完日算。取消复习会去掉 `joined` 和 `reviews`，留下 `joinAt`，`learned` 保留。
> 浏览器：`done:<路径>` 只记学完；`rev-join:<条目 id>` 是待上传的加入或取消（`{joined, at}`）；`rev-op:<条目 id>` / `rev-done:<条目 id>` 只作用在已经加入的条目上。没加入的旧操作不会把复习写回来。有令牌时这些操作写入 `data/review.json`。勾完的那一行当天还留在「今日」里，算进「已看」，第二天消失。地址加 `?today=YYYY-MM-DD` 可以自查。
> 内容 bot 加新篇时写 `{item, start, reviews: []}`，不要写 `joined`，不要预填 `reviews`。构建会把没有 `joined` 的 `reviews` 清掉。

| 内容 | 学完 | 加入复习 | 开始 | 第 1 天 | 第 3 天 | 第 7 天 | 第 14 天 | 第 30 天 |
|---|---|---|---|---|---|---|---|---|
| L01 用 200 行代码写一个 Claude Code（智能体循环） | 2026-10-12 | — | 2026-10-11 | — | — | — | — | — |
| 黄同学h 入职大厂两个月，我的 AI 开发心得 | 2026-10-23 | — | 2026-10-11 | — | — | — | — | — |
| L01 Course intro + the AI coding landscape（从 Typist 到 Curator） | — | — | 2026-10-12 | — | — | — | — | — |
| 腾讯技术工程 两万字长文｜手把手带你趟过 AI Coding 深水区：编码让位，人退到哪里 | — | — | 2026-10-12 | — | — | — | — | — |
| Anthropic 工作坊 Claude Managed Agents：把大脑和手拆开（AI Engineer World's Fair 2026） | 2026-10-28 | — | 2026-10-14 | — | — | — | — | — |
| Holon 博客 AI 自动交付流如何保证质量：四层验证与验收防线 | 2026-10-28 | — | 2026-10-15 | — | — | — | — | — |
| Felix Rieseberg 如何变得更有雄心：写给与模型协作的人类使用指南 | 2026-10-25 | — | 2026-10-15 | — | — | — | — | — |
| L02 拆开一个前沿编码智能体（Harness 的 8 个组件） | — | — | 2026-10-17 | — | — | — | — | — |
| L02 How LLMs Code (Under the Hood) | — | — | 2026-10-17 | — | — | — | — | — |
| L01 AI Agent-1：解剖小龍蝦（以 OpenClaw 为例） | — | — | 2026-10-17 | — | — | — | — | — |
| 张立行 吃一堑，长一智：Agent 时代的两个关键词 Context 与 Loop | — | — | 2026-10-23 | — | — | — | — | — |
| Itamar Friedman 通往 L4 软件工程：Agentic SDLC 还不等于软件工厂 | — | — | 2026-10-24 | — | — | — | — | — |
| 大淘宝技术 AI 驱动研发体系的实践和思考 | — | — | 2026-10-28 | — | — | — | — | — |
| 大淘宝技术 天猫技术大型 AI 项目的研发协同实践 | — | — | 2026-10-28 | — | — | — | — | — |
| PaperWeekly RSI全景综述来了！从Prompt到自动科研，四大技术路线全梳理 | — | — | 2026-10-28 | — | — | — | — | — |
| 腾讯技术工程 别只盯着AI Coding，真正的变化发生在整个研发流程 | — | — | 2026-10-28 | — | — | — | — | — |
| L03 The Big Three: Context, Model, Prompt | — | — | 2026-10-28 | — | — | — | — | — |
| L04 Spec-Driven Development | — | — | 2026-10-28 | — | — | — | — | — |
| L05 Modern agentic CLIs | — | — | 2026-10-28 | — | — | — | — | — |
| L06 From pair-coding to agent orchestration | — | — | 2026-10-28 | — | — | — | — | — |
| L07 Inside the Call: Messages, Streams, and Tool Calls | — | — | 2026-10-28 | — | — | — | — | — |
| L08 Hackathon 1 Briefing | — | — | 2026-10-28 | — | — | — | — | — |
| L09 Stop conditions and the approval layer | — | — | 2026-10-28 | — | — | — | — | — |
| L10 Skills and the Elephant-Goldfish Model | — | — | 2026-10-28 | — | — | — | — | — |
| L11 Guardrails: Errors, Retries and Approval Gates | — | — | 2026-10-28 | — | — | — | — | — |
| L13 Browser Extensions and Assistants You Can Text | — | — | 2026-10-28 | — | — | — | — | — |
| L14 Subagents | — | — | 2026-10-28 | — | — | — | — | — |
| L15 Compaction and Prompt Caching | — | — | 2026-10-28 | — | — | — | — | — |
| L16 Agent Memory | — | — | 2026-10-28 | — | — | — | — | — |
| L03 高级提示与复杂代码库的上下文工程（RePPIT） | — | — | 2026-10-28 | — | — | — | — | — |
| L04 MCP 与工具调用（从 M×N 到 M+N，code mode） | — | — | 2026-10-28 | — | — | — | — | — |
| L05 Agent Skills 最佳实践 | — | — | 2026-10-28 | — | — | — | — | — |
| L06 客座 Lee Robinson：常驻 agent 是怎么工作的 | — | — | 2026-10-28 | — | — | — | — | — |
| L07 定制你的 agent 配置（AGENTS.md、hooks、skills、subagents） | — | — | 2026-10-28 | — | — | — | — | — |
| L09 让代码库为 agent 做好准备，以及后台编码 agent 工作流 | — | — | 2026-10-28 | — | — | — | — | — |
| L11 Agentic 代码审查：最佳实践与架构 | — | — | 2026-10-28 | — | — | — | — | — |
| DeepSeek Harness 团队 Super-agent 设计探索：让人只做决策和验收 | — | — | 2026-11-01 | — | — | — | — | — |
| L01 课程概览——从规模定律到会自我改进的 agent | — | — | 2026-11-01 | — | — | — | — | — |
| L02 推理时算力扩展——多采样、怎么挑、怎么组合 | — | — | 2026-11-01 | — | — | — | — | — |
| L03 可靠验证——从结果打分到逐步打分，再到弱验证器集成 | — | — | 2026-11-01 | — | — | — | — | — |
| L04 从工具和代码的反馈中学习——ReAct、RLEF 与 Constitutional AI | — | — | 2026-11-01 | — | — | — | — | — |
| L05 规划与多步推理——LATS 树搜索、SPRINT 并行规划、SWiRL 多步 RL | — | — | 2026-11-01 | — | — | — | — | — |
| L06 训练时扩展与 RL——STaR、DeepSeekMath 的 GRPO、DAPO | — | — | 2026-11-01 | — | — | — | — | — |
| L07 用搜索自我改进——AlphaCode、AlphaCode 2 与 Search-o1 | — | — | 2026-11-01 | — | — | — | — | — |
| L08 agent 评测与长任务——METR 时间跨度、GDPval、DeepScholar-Bench | — | — | 2026-11-01 | — | — | — | — | — |
| L09 未来研究方向——多样性、自我验证、自出题与每瓦智能 | — | — | 2026-11-01 | — | — | — | — | — |
| Xudong Han / LangChain 后台任务不再堵住主循环：LangChain 的异步子任务 | — | — | 2026-11-07 | — | — | — | — | — |
| Anthropic Agent 记忆的部件：记下、整理、表示、核对 | — | — | 2026-11-07 | — | — | — | — | — |
| Addy Osmani 写代码的 agent，把你做成了管理者 | — | — | 2026-11-08 | — | — | — | — | — |
| 腾讯研究院 迈向AI原生组织：腾讯的探索样本 | — | — | 2026-11-04 | — | — | — | — | — |
| Smartpig / LangChain Managed Deep Agents v0.10：给 Agent 一个浏览器，把长任务放到后台 | — | — | 2026-11-09 | — | — | — | — | — |
| 旺旺 / Jev Engineering PDF Jev Engineering：KV cache 怎样决定 coding agent 的设计 | — | — | 2026-11-10 | — | — | — | — | — |
