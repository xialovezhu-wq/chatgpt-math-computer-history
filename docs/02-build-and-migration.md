# 数学副本构建与迁移流程

## 设计原则

- 每次从最新版官方 `/Applications/ChatGPT.app` 重新复制。
- 不从旧数学副本增量升级。
- 只修改目标 ASAR entry。
- 所有压缩代码锚点必须在目标 entry 中恰好出现一次。
- 新版验收前保留旧版。
- 不修改用户聊天数据库和学习资料。

## 第一步：只读审计官方版本

读取：

- `CFBundleShortVersionString`
- `CFBundleVersion`
- `CFBundleIdentifier`
- `app.asar` SHA-256
- 官方签名和 Team ID

枚举所有 `ChatGPT-Math*.app`，确认旧副本唯一且没有运行。

## 第二步：定位 ASAR 入口

当前 26.814.41407 版本使用四个目标 entry：

1. `webview/assets/user-formatted-text-Bp-XdAPx.js`
2. `webview/assets/subagent-activity-chip-group-BMNUltzO.js`
3. `webview/assets/app-initial-BCLYDefw.js`
4. `.vite/build/main-DkjTIhil.js`

前三个用于数学渲染，第四个用于 Computer History 代理。

文件名和压缩变量每次更新都可能变化，所以构建脚本锁定：

- 官方整包哈希。
- 输出绝对路径。
- entry 文件名。
- 原始锚点。
- 预期 sentinel 数量。

如果任何锚点数量不是 1，构建必须失败关闭。

## 第三步：单美元数学扩展

`build-narrow-user-message-math.mjs` 向 user-formatted-text 的 Markdown extensions 增加一个受限 inline math tokenizer。

接受示例：

- 单美元包围、同一行、非空白开头和结尾的数学表达式。

拒绝示例：

- 双美元公式。
- 货币金额。
- Shell 环境变量。
- 跨行单美元内容。
- 转义美元符号。

扩展只在带有专用 className 的用户气泡和注释渲染路径启用，避免改变所有 Markdown 表面。

## 第四步：用户气泡补丁

将用户消息气泡调用增加：

`markdownClassName: codex-single-dollar-math`

这样 assistant 输出和其他 Markdown 表面不被全局改变。

## 第五步：注释补丁

两类注释被转换为 Markdown renderer：

- 注释浮层中的所选文本和用户评论。
- composer/已保存注释列表中的所选文本和用户评论。

专用 className 为：

`codex-annotation-math`

注释 normalizer 额外处理：

- LaTeX display delimiter 的换行形式。
- 跨行 inline delimiter 提升为 display math。
- 普通区间方括号、数组和 Markdown 链接保持不变。

## 第六步：重建 ASAR

实现不是原地覆盖压缩 entry，而是：

1. 保留官方 ASAR 原始 data 区域。
2. 把修改后的目标 entry 追加到末尾。
3. 更新这几个 entry 的 offset、size、whole-entry hash 和 block hash。
4. 重建 header。
5. 验证官方 data 前缀逐字节不变。

当前验证器要求只有四个 entry 的元数据发生变化。

## 第七步：Computer History 主进程代理

`build-history-proxy-math.mjs` 在 Electron main entry 中注入 `codexMathHistoryCall`。

它使用官方 ChatGPT 包内的 `cua_node` 执行本地 `mcp-call.mjs`，再调用 SkyComputerUseClient 的 computer-history MCP。

该层是内部接口桥接，不是官方扩展点。

## 第八步：复制和重签名

1. 使用 `ditto` 复制最新版官方应用。
2. 替换 `Contents/Resources/app.asar`。
3. 修改：
   - Bundle ID。
   - Display Name。
   - ElectronAsarIntegrity header hash。
4. 使用本地证书重签名外层 bundle。
5. 验证 deep、strict、designated requirement 和 entitlements。

重签名后的应用不是 OpenAI 官方签名，也不是官方 notarized 发布物。

## 第九步：验收

自动验收：

- 官方源哈希匹配。
- 候选整包哈希匹配。
- Header round trip。
- 目标 entry integrity 和 block hash。
- 数据前缀未改变。
- metadataChangeCount 等于 4。
- 数学 sentinel 数量正确。
- History proxy sentinel 数量正确。
- 签名和 entitlements 正确。

人工验收：

- 用户气泡公式。
- 注释链接打开后的公式。
- 所选文本和用户评论。
- Computer History 状态、权限、暂停、恢复和 timeline。
- 标准官方应用能否独立启动。
- 两个应用的对话和配置可见性。

当前历史流程对数学显示做得较充分，但过去没有把“标准官方应用独立启动”和“双进程完整矩阵”作为硬验收条件，这是导致问题遗漏的重要原因。

