# ChatGPT Math 26.818.61809 更新计划

日期：2026-08-25

状态：已授权实施；运行验收与正式部署仍为独立授权门禁。

## 目标

从官方 ChatGPT 26.818.61809（build 7019）重新构建数学副本，保留 26.818.41509 已验收的用户气泡数学、两类注释数学、纯文本同组件预览、现有五项 Computer History 代理和显式 companion activation。

目标应用名为 `ChatGPT-Math-26.818.61809-History.app`。旧版 `ChatGPT-Math-26.818.41509-History.app` 在新版完整验收前始终保留。

## 已锁定源基线

- Version：26.818.61809
- Build：7019
- 官方 Bundle ID：`com.openai.codex`
- 官方 ASAR SHA-256：`76bbcdc2a4a2d77cfe03904a6537d0a655f9892f27a8925e3a6c7b613801d4cf`
- 官方 ASAR header SHA-256：`b39c87c9fb4ccfbe0fec76c4e6e8e354ee8a105d28f7f8694421cc817c86d112`
- 回滚副本：26.818.41509，ASAR SHA-256 `19095005e8ea6862aa5d04ddf92f60ef605ea38fb34e3dac4f05653a6c9b8a48`

任何实施阶段发现官方版本、build 或上述哈希变化，都必须停止并重新进行只读兼容性审计。

## 实施边界

- 不修改官方 `/Applications/ChatGPT.app`。
- 不在旧数学副本上增量覆盖。
- 不修改 LaunchAgent、companion profile、MCP 操作名或 Computer History 五项代理范围。
- 不修改共享 remark-math 的全局单美元配置、assistant renderer 或 KaTeX 保护窗口。
- 不读取聊天数据库、Computer History 正文、Keychain 或凭据。
- 不修改原 Review Pack、`MANIFEST.sha256`、旧版本工具、旧报告、旧 receipt 或固定基线 tag。
- 不启动、安装或部署候选应用，除非到达对应门禁后再次取得用户明确授权。
- 不推送 GitHub，除非用户另行明确授权。

## 阶段一：只读重绑定审计

1. 锁定官方版本、build、ASAR/header、签名结构、目标 entry 和每个目标 entry 的原始哈希。
2. 重新检查旧 20 项迁移锚点、Codex composer、同组件预览动态依赖和 History 控制器。
3. 每个绑定必须在目标 entry 中语义明确且恰好出现一次。
4. 将绑定分类为 retained、rebound、missing 或 multiple，并形成脱敏审计报告。
5. 任一目标语义不唯一、必须修改超过既有四个 entry，或 History 方法语义改变时停止。

## 阶段二：版本化静态候选

1. 新增 26.818.61809 专属 checker、数学构建器、History 构建器和静态验证器，不修改 26.818.41509 文件。
2. 从官方 ASAR 先构建数学中间候选，再注入现有 History bridge，生成最终候选。
3. 保留受限单美元 tokenizer、两类 annotation renderer、Codex 纯文本同组件预览和现有五项 History 操作。
4. 对动态 import、Vite 依赖闭包、React cache slot、压缩符号和 exactly-once 锚点进行新版重绑定。
5. 连续执行两次完整构建，要求中间和最终 ASAR 哈希完全一致。

静态通过标准：

- 官方源哈希在构建前后不变。
- ASAR header round trip、官方 data prefix、whole-entry hash 和 block hash 全部通过。
- 只有三个数学/预览 entry 和一个 History entry 发生批准的元数据变化。
- 全局 `singleDollarTextMath: false` 保持，开启值为零。
- assistant renderer 和 KaTeX 保护窗口与官方源逐字节相同。
- 预览仍延迟加载同一个 `user-formatted-text` 组件，不复制第二套 renderer 或数学扩展。

## 阶段三：staging 候选应用

1. 从官方 26.818.61809 应用完整复制到版本化 staging 目录。
2. 仅替换已锁定的最终 ASAR，并更新 Display Name、沿用的数学副本 Bundle ID 和 `ElectronAsarIntegrity`。
3. 沿用旧数学副本的 designated requirement 与 Electron 运行权限完成本地签名。
4. 生成部署前状态和 rollback manifest。
5. 验证候选 ASAR 与 staging 字节一致、Info.plist 差异受限、签名 deep/strict 通过。

本阶段不启动应用，也不修改 `/Applications`。

## 阶段四：运行验收门禁

到达本阶段后先向用户报告静态和签名结果，并取得单独授权。

运行验收使用候选自身可执行文件和隔离 `user-data-dir`，覆盖：

- 真实窗口、renderer、已登录账户和 app-server 连接。
- 用户气泡、两类注释、积分、分式、上下标和单美元公式。
- 预览与发送后气泡的原文哈希和规范化组件子树哈希一致。
- 返回编辑、焦点、撤销和输入法 composition 保护。
- 代码、货币、Shell 变量、URL、转义、未配对和错误公式保护。
- Computer History 原状态记录、至少 315 秒暂停保护和按原状态恢复。

若 Computer History 原状态不是 running，不自动恢复或改写用户状态，只记录可验证边界并另行请求授权。

## 阶段五：部署门禁

只有静态、签名、运行和 History 验收全部通过后，才再次取得用户明确确认并部署到 `/Applications`。

部署后必须验证：

- installed ASAR 与 staging 候选逐字节一致。
- 签名、权限、Info.plist 和 Electron integrity 均与批准状态一致。
- 从已安装路径进行一次隔离启动检查。
- 26.818.41509 继续保留作为回滚版本。

旧副本仅在新版稳定且用户再次明确确认后移动到废纸篓，不做永久删除。

## Git 记录

实施结果拆分为五个精确提交：

1. 版本计划。
2. 只读兼容性审计。
3. 静态候选链与证据。
4. 运行验收证据。
5. 正式部署证据。

完整部署后创建新版本 tag；不移动 `review-baseline-2026-08-20`，不自动推送远端。
