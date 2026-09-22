# 可讨论的重构方向

## 评价标准

外部评审应同时考虑：

- 数学公式输入和显示是否稳定。
- Computer History 是否使用官方支持路径。
- 是否只有一个交互式 ChatGPT 主实例。
- 对话、设置和权限是否只有一个权威源。
- 更新后是否无需反汇编压缩代码。
- 手动暂停是否被尊重。
- 是否能完全回滚。

## 方案 A：只保留官方 ChatGPT，在输入端规范化公式

思路：

- 不创建数学副本。
- Typeless 或独立文本转换器把单美元输入转换为 ChatGPT 原生支持的行内或块级数学格式。
- 官方 ChatGPT 独占 Computer History、profile、对话和权限。

优点：

- 消除双应用和双 app-server。
- 不需要重签名。
- 更新兼容性最高。
- Computer History 完全走官方路径。

缺点：

- 需要可靠识别货币、Shell 变量、代码块和普通文本中的美元符号。
- 已发送的旧消息不会自动重新渲染。
- Typeless 集成能力需要确认。

优先级：最高。它最接近问题的真正需求，改动面最小。

## 方案 B：官方 ChatGPT + 本地剪贴板/输入法转换器

思路：

- 独立小工具监听明确快捷键，而不是全局监听。
- 用户粘贴或确认发送前，对数学片段做安全转换。
- 提供预览和撤销。

优点：

- 不改官方应用。
- 与 Typeless 无强耦合。
- 可以用单元测试覆盖边界。

缺点：

- 多一个用户操作步骤。
- 需要避免读取敏感剪贴板内容。

优先级：高。

## 方案 C：只运行数学副本，让官方 Computer History 服务独立化

思路：

- 不再启动完整官方 ChatGPT companion。
- 寻找官方支持的无 UI 服务、XPC、MCP 或公开接口。
- 数学副本只消费明确的 Computer History API。

主要障碍：

- 当前没有证据表明 OpenAI 提供了受支持的独立 Computer History daemon 接口。
- 数学副本没有官方 Team ID 和 App Group 权限。
- 继续使用内部 SkyComputerUseClient 仍然属于非公开依赖。

优先级：只有在找到官方支持接口后才值得实施。

## 方案 D：保留双进程，但重写为严格 supervisor

如果短期必须保留当前架构，至少需要：

1. 只允许一个 companion 实例。
2. 使用锁文件和进程组，不只使用 PID 文件。
3. 启动后记录完整进程树并负责清理。
4. 不使用 `open -n` 反复创建新实例。
5. 明确区分 `paused`、`disabled`、`stopped_by_user`、`crashed`、`unavailable`。
6. 手动暂停时不重启；异常停止时允许受限恢复。
7. 避免 companion 注册远程 app-server；如果无法关闭，则该方案不可接受。
8. 禁止 companion 展示为第二个交互窗口。
9. 完整代理全部 Computer History 方法，或一个都不代理。
10. 增加启动矩阵测试和资源泄漏测试。
11. 移除数学副本的 `http`、`https`、官方 `codex` scheme 和不需要的文档 handler。
12. 把 ASAR、Info.plist integrity、entitlements、签名和 Gatekeeper 检查纳入一个原子打包阶段。
13. 用固定方法白名单和响应 schema 替代任意 MCP 方法名透传。

即使做到这些，双 profile 和官方签名边界仍然存在。

优先级：中，仅作为过渡。

## 方案 E：在官方应用内部继续 ASAR 补丁

思路：直接修改官方应用，而不创建副本。

不推荐原因：

- 会破坏官方签名和自动更新。
- 回滚与完整性风险更高。
- 更新可能覆盖补丁。
- 系统权限和 App Group 也不保证在重签名后保留。

优先级：低。

## 建议决策顺序

1. 先验证方案 A：Typeless 或发送前转换是否足够满足需求。
2. 如果 Typeless 不可控，实现方案 B 的明确快捷键转换器。
3. 暂停继续扩大 ASAR 和 Computer History 内部代理。
4. 只有在发现官方独立 History 接口后，再评估方案 C。
5. 如果短期必须维持现状，按方案 D 收缩并增加硬验收。

## 新的硬验收矩阵

每次更新至少测试：

| 测试 | 官方关闭 | 数学关闭 | History 状态 | 预期 |
|---|---:|---:|---|---|
| 官方单独启动 | 是 | 是 | 任意 | 官方正常打开 |
| 数学单独启动 | 是 | 是 | stopped | 数学正常打开 |
| 数学单独启动 | 是 | 是 | running | 数学正常打开 |
| 官方后开数学 | 否 | 是 | running | 不抢 profile，不退出官方 |
| 数学后开官方 | 是 | 否 | running | 不劫持官方启动 |
| 手动暂停 | 任意 | 否 | paused | 5 分钟后仍 paused，不重启 |
| companion 崩溃 | 是 | 否 | unavailable | 最多一次恢复，无残留进程 |
| 连续 24 小时 | 任意 | 否 | mixed | 无 PID 漂移、无 crashpad 累积 |
| URL handler | 任意 | 任意 | 任意 | 官方版保持默认处理者 |
| Gatekeeper | 是 | 是 | 任意 | 明确区分本机实验可启动与可分发公证状态 |
| ASAR 闭环 | 是 | 是 | 任意 | header hash、Info.plist、签名 seal 完全一致 |
