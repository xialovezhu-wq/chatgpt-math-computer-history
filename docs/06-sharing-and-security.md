# 分享与安全说明

## 已包含

- 数学补丁构建器的脱敏快照。
- 整包验证器的脱敏快照。
- Computer History main-process proxy 构建器。
- companion manager 和 MCP client。
- LaunchAgent 配置。
- entitlements 和 designated requirement 示例。
- 当前状态的脱敏摘要。
- 外部评审提示词。

## 已替换

- `/Users/实际用户名` 改为 `/Users/USER_NAME`。
- `com.实际用户名` 改为 `com.example`。
- 本地签名 identity 改为 `LOCAL_SIGNING_IDENTITY`。
- 本地证书 SHA-1 改为占位符。

## 明确排除

- 官方 ChatGPT.app。
- 官方 app.asar 和解包后的官方 JS。
- 本地签名私钥、证书导出文件和钥匙串。
- 原始日志。
- Computer History 事件和记忆正文。
- T9 归档内容与索引。
- 聊天数据库和工作区数据。
- 账号、Token、Cookie、API Key、installation ID、server ID、request ID。

## 为什么不放官方二进制

本包用于技术讨论，不是重新分发 ChatGPT。官方应用体积大、受许可和版权约束，而且版本更新频繁。审查者应使用自己合法安装的官方客户端，只阅读本包中的补丁逻辑。

## 执行警告

`source-review-snapshot` 已脱敏，路径和签名占位符会使它无法直接运行。这是有意设计，防止别人误把审查材料当成安装器。

如需复现实验，应先：

1. 在隔离 macOS 用户或测试机器上操作。
2. 自己生成本地签名证书。
3. 重新审计最新版 app.asar 锚点。
4. 不使用真实聊天或 Computer History 数据。
5. 保留官方应用和 profile 的完整回滚副本。

