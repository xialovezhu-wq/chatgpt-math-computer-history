# ChatGPT Math & Computer History 项目交接

基线日期：2026-08-20

当前对话：`00-基线整理与 GitHub 首次迁移`

## 1. 项目目标

这个项目源于 Codex/ChatGPT 原生聊天界面的数学公式显示问题：用户通过 Typeless 等方式输入的部分数学表达使用单美元定界，但用户消息气泡和若干注释组件不能按预期渲染。

为解决显示问题，用户制作并长期迁移一个“数学副本”。用户有时也会把它称为“碎壳”或“碎副本”。该副本复制最新版官方 ChatGPT 桌面客户端，对少量 ASAR entry 施加数学渲染补丁，再使用本地签名安装。

Computer History 并未完整迁移到数学副本自身。当前实现仍依赖官方 ChatGPT 组件、Computer History MCP、伴随脚本和 LaunchAgent 形成的跨进程链路。

当前阶段的目标不是立即修复，而是完整保存、脱敏整理并发布现有实现审查基线，交给外部 ChatGPT 或工程师做架构、源码、安全、生命周期和可靠性审查。

## 2. 当前实现概况

### 数学副本

数学副本承担日常聊天和学习界面。它使用本地 Codex profile，并保留绝大部分官方客户端资源，只替换预期的少量 ASAR entry。

### ASAR 数学补丁

数学补丁主要负责：

- 为用户消息气泡增加受限的单美元行内数学 tokenizer。
- 为注释浮层中的所选文本和用户评论启用数学 Markdown renderer。
- 为 composer 或已保存注释列表中的相关文本启用相同渲染路径。
- 通过固定源哈希、exactly-once 锚点、entry integrity、block hash 和数据前缀检查降低误补丁风险。

### 官方 ChatGPT companion

官方 ChatGPT companion 用于接近官方 Computer History 运行域。它不是数学聊天的主要可见界面，而是必要时由伴随逻辑使用独立 profile 启动的官方应用实例。

### MCP 跨进程调用

数学副本主进程中的 `codexMathHistoryCall` 使用官方 ChatGPT 包内的 `cua_node` 启动本地 `mcp-call.mjs`，后者调用 SkyComputerUseClient 的 computer-history MCP。

当前代理只覆盖：

- `getState`
- `pause`
- `resume`
- `getSettings`
- `updateSettings`

其他启用、重试、历史列表、历史建议、清理和内部 reconcile 路径仍保留数学副本本地控制器实现。

### LaunchAgent

History Companion LaunchAgent 每 300 秒运行一次 `manage.sh`。脚本查询 Computer History 状态，维护手动暂停 latch，并在特定不可用状态下尝试使用独立 profile 启动官方 ChatGPT companion。

### 独立 user-data-dir

数学副本使用的 profile 与 companion 官方实例使用的 Shared Config profile 不同。独立 user-data-dir 的原始目的，是允许官方 companion 与数学副本并存并减少同一 profile 的直接争用；代价是本地配置域、窗口状态和部分可见数据分离。

### 当前运行域和配置域

当前至少涉及：

1. 数学副本 Electron/UI 运行域。
2. 数学副本 app-server 运行域。
3. 官方 ChatGPT companion 运行域。
4. SkyComputerUseClient / Computer History MCP 运行域。
5. 官方 CUAService 和 App Group 事件域。
6. 数学副本默认 Codex profile。
7. companion Shared Config profile。
8. LaunchAgent 的状态、PID、日志和暂停 latch 域。

## 3. 用户观察到的核心问题

以下内容属于用户实际观察，不自动等同于底层根因已经确认：

- 当数学副本和官方 ChatGPT 同时打开时，Computer History 曾经可以工作。
- 当只打开数学副本、不打开原生官方 ChatGPT 时，Computer History 无法正常运行。
- 数学副本中存在聊天和正确数学渲染，但用户在另一个官方实例中没有看到等价的对话状态。
- 用户担心长期同时打开两个 ChatGPT 实例可能造成状态冲突、上下文混乱、性能下降或输出质量下降。
- “同时打开两个实例是否会降低模型输出质量”目前没有直接证据，应标记为待验证，不得写成事实。

## 4. 已确认问题

以下问题已有 Review Pack 文件、源码快照、哈希、进程或脱敏日志证据支持：

- 数学副本与官方 companion 使用不同 user-data-dir。
- 当前存在多个配置和生命周期权威域。
- 数学副本和 companion 都可能启动 app-server 相关组件。
- 历史日志中出现 HTTP 409 和 `Remote app server already online` 冲突。
- companion PID 文件曾指向已经不存在的主进程。
- companion profile 下曾观察到多批 crashpad 辅助进程残留。
- Computer History 只代理五个控制器方法，其余方法仍由数学副本本地控制器处理。
- `paused`、`stopped` 和 `disabled` 在当前 manager 状态机中被归入手动暂停保护分支。
- companion 会启动完整官方 ChatGPT，而不是经过支持的最小化 Computer History daemon。
- 数学副本依赖内部 MCP、SkyComputerUseClient、压缩 ASAR 锚点和版本特定 entry 名称。
- 数学副本缺少官方 CUAService App Group entitlement。
- 数学副本使用本地签名，可以通过结构性 codesign 验证，但不是官方 notarized 发布物。
- 数学副本仍可能注册官方 `codex`、`http`、`https` scheme 和文档处理器。
- 每次官方更新都可能改变 ASAR 文件名、压缩符号、React cache slot、函数锚点和源哈希。

## 5. 事实、观察、推测和未知项

| 类别 | 内容 |
|---|---|
| Confirmed | 数学副本是脱敏审查材料所描述的窄 ASAR 修改副本。 |
| Confirmed | Computer History 代理只覆盖五个方法，形成混合控制面。 |
| Confirmed | 数学副本与 companion 使用不同 profile。 |
| Confirmed | 历史日志中存在 app-server 409 冲突、失效 PID 和辅助进程残留证据。 |
| Confirmed | 数学副本没有官方 CUAService application-group entitlement。 |
| User-observed | 两个实例同时打开时 Computer History 曾经可用。 |
| User-observed | 只打开数学副本时 Computer History 无法正常运行。 |
| User-observed | 数学副本的对话没有在用户观察的官方实例中等价显示。 |
| Hypothesis | 标准官方应用、数学副本和隐藏 companion 可能竞争 Electron single-instance、profile 或远程 app-server 身份。 |
| Hypothesis | 双 profile 是对话或本地状态不可见的主要原因之一。 |
| Hypothesis | Computer History 混合权威控制面可能造成启动顺序和状态竞态。 |
| Hypothesis | 数学副本保留官方 URL handler 可能影响“打开哪个应用”的路由。 |
| Unknown / Needs verification | 两个实例是否使用完全相同账号、workspace、组织和远端 thread catalog。 |
| Unknown / Needs verification | “必须先运行 Computer History，官方应用才能启动”的精确因果方向。 |
| Unknown / Needs verification | 同时运行两个实例是否影响模型回答质量，而不仅是本地资源和状态。 |
| Unknown / Needs verification | 是否存在 OpenAI 官方支持的无 UI Computer History 服务接口。 |
| Unknown / Needs verification | 启动问题由 user-data-dir 锁、remote app-server 身份、App Group 权限还是多因素组合导致。 |

## 6. 当前决策

- 为该事项建立独立 Codex 项目 `ChatGPT Math & Computer History`。
- 当前 Codex 项目长期对应一个本地 Git 仓库。
- 本地 Git 仓库长期对应一个 GitHub 私有仓库。
- 当前对话只负责首次基线整理和 GitHub 迁移。
- 后续不同任务应在同一个 Codex 项目中分别新建聊天，避免把基线迁移、架构审查和功能修复混在一个任务里。
- GitHub 仓库用于让其他 ChatGPT 或工程师通过固定 commit 和 tag 审查。
- 首次迁移阶段不提前修改数学渲染、ASAR、MCP、LaunchAgent 或系统应用。
- 原始 Review Pack 保持字节稳定，新增项目级交接文件不写入其 Manifest。

## 7. 安全边界

仓库不得包含：

- `ChatGPT.app`。
- 数学副本 `.app` bundle。
- 官方 `app.asar`。
- 从官方应用提取的完整前端源码。
- 聊天数据库。
- Computer History 原始事件。
- Computer History 记忆正文。
- Cookie。
- Token。
- API Key。
- GitHub Token。
- 登录凭据。
- Authorization Header。
- 签名私钥。
- 钥匙串材料。
- 未脱敏日志。
- 用户真实路径。
- 用户邮箱或账户信息。
- installation ID、server ID 和 request ID。
- crash dump。
- 大型官方二进制文件或安装包。

发现可疑内容时，只报告文件路径、风险类型和处理结果，不输出疑似凭据全文。

## 8. 当前仓库的性质

这是一个脱敏后的实现审查快照。

它不是可以直接安装的完整应用，不包含 OpenAI 官方应用源码或官方 app.asar，不代表 OpenAI 官方支持的扩展方案，也不提供官方 Team ID、App Group 或 notarization 能力。

`/Users/USER_NAME`、`com.example`、`LOCAL_SIGNING_IDENTITY` 和证书指纹占位符用于保护本机身份。任何审查者或 AI 都不得擅自把这些占位符还原为用户真实信息。

## 9. 后续审查重点

1. 为什么 Computer History 只能在官方 ChatGPT 同时运行时工作？
2. 这是进程依赖、App Group、app-server、身份认证、生命周期还是 user-data-dir 导致的？
3. 是否可以只保留数学副本的可见窗口，同时让官方 companion 以真正隐藏、稳定的方式运行？
4. 是否可以将 Computer History 能力迁移到数学副本自身？
5. 当前 MCP 代理为什么只覆盖部分控制器？
6. 当前方案中的权威状态到底由哪个进程维护？
7. 双 app-server 是否会造成 409 和状态竞争？
8. LaunchAgent 的轮询、恢复、PID、进程组和暂停逻辑是否合理？
9. 是否存在更少侵入、更抗升级的实现方式，例如发送前数学格式规范化？
10. 怎样建立可重复的启动矩阵、DOM 渲染、Computer History 生命周期和 24 小时资源泄漏回归测试？

## 10. 推荐阅读顺序

1. `PROJECT-HANDOFF.md`
2. `README.md`
3. `AGENTS.md`
4. `docs/01-architecture.md`
5. `docs/02-build-and-migration.md`
6. `docs/03-known-problems-and-evidence.md`
7. `docs/04-redesign-options.md`
8. `docs/05-external-review-prompt.md`
9. `docs/06-sharing-and-security.md`
10. `docs/07-user-claim-assessment.md`
11. `docs/08-source-inventory.md`
12. `evidence/current-state.json`
13. `source-review-snapshot/`
14. `tools/`

## 基线变更边界

本次基线迁移只新增：

- `PROJECT-HANDOFF.md`
- `AGENTS.md`
- `.gitignore`

Review Pack 原始文件、源码审查快照、工具和 `MANIFEST.sha256` 均保持不变。本次没有修改功能代码，没有启动或控制 ChatGPT 进程，也没有重新签名或部署应用。
