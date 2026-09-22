# 已知问题与证据

## 证据等级

本文区分：

- 已确认：由当前文件、进程、哈希或日志直接支持。
- 合理推测：与证据一致，但尚未完成受控实验。
- 未确认：需要改变运行状态才能验证，本包没有执行。

## Critical：Computer History 是部分代理，不是完整代理

已确认。

五个方法被转发到官方 MCP，但 timeline、清理、启用、重试、应用列表和内部 reconcile 仍走数学副本本地控制器。

影响：

- 一个页面可能混用两套状态。
- 设置显示与实际 recorder 状态可能不一致。
- 某些按钮成功，另一些按钮失败。
- 启动依赖和权限问题难以诊断。

## Critical：两个交互应用和一个隐藏 companion 竞争运行身份

部分已确认，根因仍需实验。

证据：

- 数学副本当前运行。
- 标准官方主进程当前未运行。
- companion 日志多次出现 `Remote app server already online` 和 HTTP 409。
- 日志表明多个 app-server 使用同一远程身份进行注册。

合理推测：

- 标准官方应用、数学副本和隐藏 companion 之间存在单实例、profile 或远程 app-server 身份竞争。

未确认：

- 用户所述“必须 Computer History 先运行，官方才能运行”的精确因果方向。
- 是 user-data-dir 锁、remote-control 身份还是两者共同导致。

## High：LaunchAgent 启动的是完整官方 ChatGPT

已确认。

`manage.sh` 使用 `open -j -n -a /Applications/ChatGPT.app`，附加独立 user-data-dir。

影响：

- 启动完整 Electron、renderer、app-server、Crashpad 和辅助进程。
- 不是最小化的 Computer History 服务。
- 可能参与远程 app-server 注册。
- 会产生独立 profile 和空白配置体验。

## High：PID 生命周期不可靠

已确认。

当前 PID 文件指向的主进程不存在；但伴随 profile 路径仍出现在多批 crashpad 进程中。

原因候选：

- 主进程退出后 PID 文件没有清理。
- `stopped` 或 `paused` 分支只记录 latch，不清理已有 companion 进程树。
- 只检查一个精确命令字符串，命令参数变化即无法识别。
- `open -n` 允许创建新实例。

## High：状态机把 stopped 当作手动暂停

已确认。

`paused|stopped|disabled` 都进入 `record_manual_pause`。

影响：

- 真正的异常停止可能被误判为用户意图。
- companion 不再恢复。
- UI 可能要求用户先在官方应用中恢复，形成启动顺序依赖。

## High：配置和对话可见性不统一

现象已由用户确认，底层原因部分未确认。

已确认：

- 数学副本使用默认 Codex profile。
- 隐藏官方 companion 使用独立 Shared Config profile。

合理推测：

- 如果用户看到的是 companion 官方窗口，它不会拥有数学副本相同的本地 UI 状态和设置。
- 对话不可见还可能涉及 bundle、server conversation、同步和 app-server ownership，不能只归因于 user-data-dir。

## Medium：版本更新高度脆弱

已确认。

每次更新都会改变：

- entry 文件名。
- 压缩变量名。
- React cache slot。
- 函数和 class 锚点。
- 官方 ASAR hash。

当前脚本通过 fail-closed 降低误补丁风险，但每次版本都要人工反汇编和重写。

## Medium：本地签名与官方能力边界

已确认。

数学副本使用本地证书和自定义 Bundle ID。它无法等价拥有 OpenAI 官方 Team ID、App Group、notarization 和服务授权。

因此“把官方应用复制一份并重签名”不能保证所有系统级功能仍然工作。

补充证据：当前数学副本能通过 `codesign --verify --deep --strict`，但 `spctl --assess --type execute` 拒绝它。前者只说明代码签名结构有效，不能证明 Gatekeeper 会把它当作受信任、已公证的可分发应用。

## High：数学副本仍注册官方 URL 和文档处理器

已确认。

数学副本从官方 Info.plist 复制而来，只修改 Bundle ID 和显示名，因此仍可能声明 `codex`、`http`、`https` URL scheme 以及官方文档类型。

影响：

- LaunchServices 可能把链接或文件打开请求交给数学副本。
- 标准官方应用和数学副本可能争夺默认 handler。
- 用户感觉“打开官方却进入另一个应用”可能与此有关。

建议：数学副本若继续存在，应只保留唯一自定义 scheme，并显式降低 handler rank。

## High：ASAR、Info.plist 和签名不在一个原子脚本中

已确认。

ASAR 构建器会输出新的 header hash，但不会自己更新安装 bundle 的 `ElectronAsarIntegrity`。当前安装流程靠外部命令手动写入 Info.plist，再签名。

影响：任一步遗漏都会产生 ASAR integrity、bundle seal 或签名不一致。验证器目前主要验证候选 ASAR，不完整覆盖最终安装 bundle 的 Info.plist 闭环。

## Medium：mcp-call 每次生成新客户端进程

已确认。

每次调用都会 spawn SkyComputerUseClient，建立 JSON-RPC，调用一个工具，然后 SIGTERM。

风险：

- 调用延迟和进程开销。
- 超时或异常时可能留下进程。
- 没有稳定的长连接生命周期和健康检查。

## Medium：数学 tokenizer 和注释 normalizer 仍有上下文漏洞

已确认代码层风险，尚未看到对应运行时故障。

- 单美元 tokenizer 主要依靠正则，本身不知道当前是否位于 Markdown code span 或 fenced code 中。
- 注释 normalizer 对原始字符串全局替换数学 delimiter，不先做 Markdown lexical tokenization。

影响：代码示例、Shell 内容、转义路径或未配对 delimiter 可能被误改为数学公式。

当前静态测试覆盖货币、环境变量和部分转义，但还需要真实 DOM 渲染测试覆盖 code span、fence、链接和连续反斜杠。

## Medium：当前验证主要证明字节一致，不证明运行行为

已确认。

哈希、offset、entry integrity 和 sentinel 检查很强，但仍然属于静态验证。它不能证明：

- React 模块没有 unresolved identifier。
- 公式最终 DOM 正确。
- Computer History 全生命周期一致。
- 标准官方应用和数学副本能按所有顺序启动。

必须增加隔离 profile 下的运行时 smoke suite 和 24 小时资源泄漏测试。

## Medium：日志与隐私

已确认。

官方 companion 日志可能包含 installation ID、server ID、request ID、工作区路径和远程连接错误。原始日志不适合直接分享。

本包只提供经过人工摘要的证据，不包含原始日志。

## 当前状态快照

时间：2026-08-20，Asia/Shanghai。

- 数学副本主进程：运行。
- 标准官方 ChatGPT 主进程：未发现。
- Computer History：`stopped`。
- LaunchAgent：每 300 秒运行。
- companion PID 文件：过期。
- companion profile 相关进程：发现多批 crashpad handler。
- 远程 app-server 409：历史日志中已确认。
