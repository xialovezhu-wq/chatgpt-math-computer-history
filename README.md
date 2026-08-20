# ChatGPT Math Implementation Review Pack

版本：2026-08-20

用途：把当前“数学公式渲染副本 + 官方 Computer History 伴随进程”方案交给其他工程师或 AI 做独立评审。

## 先读结论

当前方案不是一个干净的单应用实现，而是两个相互依赖的运行域：

1. 数学副本负责日常聊天，并通过 ASAR 补丁让用户消息和注释中的数学公式正确渲染。
2. 官方 ChatGPT 的 Computer History 能力由另一条伴随链路提供。
3. 数学副本的部分 Computer History 控制方法被改写为跨进程 MCP 调用。
4. 一个 LaunchAgent 每 300 秒检查状态，必要时用独立 user-data-dir 启动隐藏的官方 ChatGPT 实例。

它实现了数学显示和部分 Computer History 控制，但存在明显架构问题：双配置域、双 app-server、内部接口依赖、部分代理、启动顺序耦合、进程残留和版本脆弱性。

## 当前已确认的问题

- 数学副本与官方 companion 使用不同 user-data-dir，配置和可见对话可能分离。
- 数学副本与标准官方 ChatGPT 不能可靠地作为两个正常交互应用并行运行。
- 旧日志中出现 `Remote app server already online` 和 HTTP 409 冲突。
- companion PID 文件已失效，但伴随 profile 仍留下多批 crashpad 进程。
- Computer History 代理只覆盖部分控制器方法，形成混合权威状态。
- 当前历史状态为 `stopped`，LaunchAgent 把它当作手动暂停并停止恢复。

## 阅读顺序

1. `docs/01-architecture.md`：当前真实架构与数据流。
2. `docs/02-build-and-migration.md`：数学副本的完整制作流程。
3. `docs/03-known-problems-and-evidence.md`：问题、证据和不确定性。
4. `docs/04-redesign-options.md`：可讨论的改进方案。
5. `docs/05-external-review-prompt.md`：可直接发给别人或其他 AI 的评审提示词。
6. `docs/06-sharing-and-security.md`：包内包含与排除内容。
7. `docs/07-user-claim-assessment.md`：对当前三个问题逐条区分事实、推测和待验证项。
8. `docs/08-source-inventory.md`：包内源码和排除项。
9. `evidence/current-state.json`：2026-08-20 的只读状态快照。

## 包内源码

`source-review-snapshot/` 是脱敏后的审查快照，不是可直接运行的安装器。它保留了机制、版本锚点和代码结构，但把用户名、Bundle ID 前缀、签名证书标识替换为占位符。

本包不包含：

- ChatGPT.app 或任何 OpenAI 二进制文件。
- app.asar 原文件或提取后的官方前端代码。
- 聊天数据库、Computer History 原始事件和记忆正文。
- 登录凭据、Cookie、Token、API Key。
- 证书私钥或可用于签名的钥匙串材料。

## 官方功能边界

OpenAI 官方文档说明 Computer History 属于 macOS ChatGPT 桌面应用能力，事件文件位于 ChatGPT App Group 中，暂停和恢复由桌面应用或菜单栏控制，临时事件最长保留 48 小时：

https://learn.chatgpt.com/docs/customization/computer-history

当前数学副本方案依赖未公开的内部组件和本地补丁，不是 OpenAI 官方支持的扩展方式。
