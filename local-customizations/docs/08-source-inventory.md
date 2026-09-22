# 源码清单

## 当前活动构建链

| 包内文件 | 作用 | 是否直接运行 |
|---|---|---|
| `source-review-snapshot/math-patch/build-narrow-user-message-math.mjs` | 构建用户气泡与注释数学补丁 | 审查快照，不可直接运行 |
| `source-review-snapshot/math-patch/verify-narrow-user-message-math.mjs` | 验证最终 ASAR 元数据、hash、offset 和 sentinel | 审查快照，不可直接运行 |
| `source-review-snapshot/history-companion/build-history-proxy-math.mjs` | 注入 Computer History 部分代理 | 审查快照，不可直接运行 |
| `source-review-snapshot/math-patch/search-asar-js.mjs` | 搜索新版 ASAR 压缩 JS 锚点 | 需要重新配置依赖路径 |
| `source-review-snapshot/history-companion/manage.sh` | LaunchAgent 状态检查与恢复逻辑 | 审查快照，不可直接部署 |
| `source-review-snapshot/history-companion/mcp-call.mjs` | SkyComputerUseClient JSON-RPC 客户端 | 审查快照，不可直接部署 |
| `source-review-snapshot/history-companion/history-companion.LaunchAgent.plist` | 300 秒调度模板 | 已脱敏，不可直接加载 |

## 历史演进文件

| 包内文件 | 作用 |
|---|---|
| `patch-single-dollar.mjs` | 早期单美元渲染试验 |
| `patch-user-message-math.mjs` | 早期用户消息气泡补丁 |

这些文件不是当前生产构建入口，仅用于理解方案如何逐步扩大。

## 签名材料

| 包内文件 | 作用 | 注意 |
|---|---|---|
| `stable-math-entitlements.plist` | 当前外层 app 权限集合示例 | 权限较宽，需要最小化复核 |
| `adhoc-electron-entitlements.plist` | 早期较窄权限示例 | 不是当前活动选择 |
| `codex-math-designated-requirement.txt` | 本地签名 requirement 示例 | 证书指纹已替换 |
| `codex-math-root-openssl.cnf` | 本地根证书配置示例 | 不含私钥 |
| `codex-math-leaf-openssl.cnf` | 本地叶证书配置示例 | 不含私钥 |

## 未包含的生成物

- 当前或旧版 app.asar。
- 官方 JS entry 提取物。
- 构建候选 ASAR。
- ChatGPT-Math 应用 bundle。
- Computer History Archive 应用 bundle。
- register、verify-gated、verify-narrow 等旧提取文件。

这些生成物不是理解补丁机制所必需，而且可能带来版权、体积和隐私风险。

