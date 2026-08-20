# ChatGPT Math & Computer History 项目规则

## 项目原则

- 项目文件、固定 commit、Git tag 和 Git 历史是事实源；聊天不是事实源。
- 开始任何任务前先阅读 `PROJECT-HANDOFF.md`、`README.md` 和相关证据文件。
- 修改前先说明目标、范围、计划、验证方式和停止条件。
- 始终区分 Confirmed、User-observed、Hypothesis 和 Unknown / Needs verification。
- 不得因为用户或旧 AI 曾经提出某种解释，就把它自动升级为已确认根因。
- 不得凭空补齐缺失源码、日志、测试结果或官方接口。
- 原始 Review Pack 文件受 `MANIFEST.sha256` 保护；未经用户明确确认不得修改或重新生成 Manifest。

## 安全规则

- 不读取、复制、输出或提交凭据。
- 不访问 macOS Keychain。
- 不读取聊天数据库。
- 不读取 Computer History 原始事件或记忆正文。
- 不读取 T9 归档正文，除非用户在独立任务中明确授权并限定范围。
- 不把官方应用、数学副本应用、官方 app.asar 或完整官方前端提取物放入仓库。
- 不还原 `/Users/USER_NAME`、`com.example`、签名 identity 和证书指纹占位符。
- 不输出 Token、Cookie、API Key、Authorization Header、私钥或认证材料。
- 不提交未脱敏日志、crash dump、PID、数据库或大型二进制文件。
- 不执行 `git reset --hard`、`git clean -fd`、force push 或其他破坏性 Git 操作。

## 修改规则

- 未经用户确认，不进行架构重构。
- 未经用户确认，不修改系统应用、LaunchAgent、Computer History 状态或运行进程。
- 未经用户确认，不重新打包、签名、安装或启动数学副本。
- 未经用户确认，不修改 ASAR、MCP 代理或 companion 实现。
- 修改功能代码时必须同时更新测试、验证说明和风险边界。
- 每个独立任务使用独立 commit，提交范围必须精确。
- 不使用 force push。
- 不覆盖未知或与当前项目无关的远程仓库。
- 不使用 `git add -A`、`git add .` 或 `git add --all`；必须逐个列出确认路径。
- 不修改当前基线 tag；后续变更创建新 commit 或新 tag。

## 测试规则

- 每次修改后必须说明实际运行的测试范围。
- 明确区分静态检查、模拟测试、隔离 profile 测试和真实运行测试。
- 未运行的测试不能声称已经通过。
- 不能伪造输出、截图、日志、哈希或测试结果。
- 静态 ASAR hash 和 sentinel 验证不能替代运行时 DOM、启动矩阵和生命周期测试。
- Computer History 测试必须尊重用户手动暂停状态，不得把 `paused` 自动当作故障恢复。
- 任何会启动、停止、暂停、恢复或清理真实应用状态的测试，都必须先获得用户确认。

## GitHub 规则

- GitHub 仓库保持 Private，除非用户明确要求改变可见性。
- 默认分支为 `main`。
- 发布前检查 staged 与 unstaged diff，只提交当前任务明确授权的文件。
- 推送后交叉验证本地 HEAD、远程 main、固定 tag 和仓库可见性。
- GitHub 连接用于审查，不代表授权外部审查者直接修改系统或部署实现。
