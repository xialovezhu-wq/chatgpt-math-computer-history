# 外部评审提示词

下面内容可以直接复制给另一位工程师或另一个 AI：

---

请对这个 ChatGPT Math 实现做独立架构评审。不要默认认可当前方案，也不要直接修改我的电脑或运行安装脚本。

我的真实目标只有两个：

1. ChatGPT 用户消息和注释中的数学公式能正确渲染。
2. 官方 Computer History、聊天、配置、更新和权限保持正常。

当前方案通过复制官方 ChatGPT、修改 app.asar、重签名生成数学副本；同时用另一个官方 ChatGPT companion 和 MCP 转发提供 Computer History。现在出现了启动顺序、对话不可见、进程残留和官方应用不能稳定独立启动的问题。

请先阅读：

- README.md
- docs/01-architecture.md
- docs/03-known-problems-and-evidence.md
- docs/04-redesign-options.md
- source-review-snapshot/
- evidence/current-state.json

请完成以下评审：

1. 区分已确认事实、合理推测和缺失证据。
2. 判断当前启动问题最可能来自：
   - Electron single-instance 或 user-data-dir 锁；
   - 远程 app-server installation/server identity 冲突；
   - Computer History App Group 权限；
   - LaunchAgent/PID 生命周期；
   - 以上因素的组合。
3. 检查部分代理 Computer History 方法是否会造成混合权威状态。
4. 检查是否可以完全取消数学副本，改成 Typeless 或发送前格式转换。
5. 如果必须双进程，提出一个只有单一交互 UI、没有 app-server 冲突、可清理进程树的 supervisor 设计。
6. 给出最小可验证实验，不要先做大改动。
7. 给出推荐方案、回滚方案和硬验收矩阵。
8. 检查数学副本是否仍注册 `http`、`https`、官方 `codex` scheme 和文档 handler。
9. 区分 `codesign --verify` 通过与 Gatekeeper/notarization 可分发之间的差异。
10. 检查正则数学 tokenizer 在 code span、fenced code、Shell 和连续转义中的误判。

限制：

- 不要要求 OpenAI 私钥、Team ID 签名能力或未经授权的 App Group entitlement。
- 不要把内部 MCP、minified anchor 或 SkyComputerUseClient 当作稳定公开 API。
- 不要读取或索要聊天数据库、Computer History 原始事件、Cookie 或 Token。
- 不要建议直接修改正式应用，除非同时说明签名、更新和回滚风险。

希望输出格式：

1. Executive summary
2. Root-cause ranking
3. Architecture flaws
4. Recommended target architecture
5. Minimal experiments
6. Migration and rollback plan
7. Acceptance checklist

---
