# ChatGPT Math 26.818.41509 更新与输入预览

日期：2026-08-24

状态：实施中；静态候选与核心界面验收已通过，Computer History 周期验收和正式部署待完成。

## 目标

从官方 ChatGPT 26.818.41509（build 6962）重新构建数学副本，保留用户气泡、注释和 Computer History 既有能力，并在官方“纯文本编辑器”模式下增加显式的“查看预览／查看源代码”切换。

## 关键边界

- 不修改官方应用。
- 不在旧数学副本上增量覆盖。
- 只允许四个 ASAR entry 发生元数据变化。
- 不修改共享 remark-math 的 `singleDollarTextMath: false`。
- 不修改 assistant renderer 或 KaTeX 保护窗口。
- 不复制第二套用户消息 tokenizer、链接规则或列表整理逻辑。
- 预览必须延迟加载并直接复用同一个 `user-formatted-text` 组件。
- 预览只改显示，不写回 ProseMirror 文档、草稿或提交覆盖值。
- Computer History 继续只代理现有五个 MCP 操作。

## 已锁定官方基线

- Version：26.818.41509
- Build：6962
- 官方 ASAR SHA-256：`8eb91bd9efbf9a4dd04b9b0afdbfcb4e0bab5da18c1919ad74ca327c00c7e791`
- Header SHA-256：`2923afd2f7a6bab88f30ff809919d83919f4ba3e61a1883303de6a9568ed3699`

## 四个目标 entry

1. `webview/assets/user-formatted-text-BjT0CYhd.js`
2. `webview/assets/subagent-activity-chip-group-fTxFK4Q1.js`
3. `webview/assets/app-initial-DwVrCWuo.js`
4. `.vite/build/main-u1nlBt5g.js`

原二十个迁移锚点最终分类为十二个保留、八个重绑定；新增的 Codex composer、纯文本设置、输入槽、操作区和延迟加载锚点均唯一。

## 预览实现

- 实际 Codex composer 路径为 `IGc`，不是 ChatGPT 模式的 `bEc`。
- 纯文本模式关闭时不显示预览按钮。
- 纯文本模式开启且正文非空时显示“查看预览”。
- 预览替代可见输入内容，但 controller 保持存活。
- 返回源代码后重新聚焦原 controller。
- 输入法 composition 期间拒绝进入预览。
- 预览使用 Codex 提交链的规范化文本：`controller.getText()` 后附加提交协议的单个结尾换行。
- 预览和发送后用户气泡调用相同的 `user-formatted-text` initializer、component、className 和数学扩展。
- 首次加载失败只显示原文，并使运行验收失败；不得退回复制 renderer 的方案。

## 静态验收

- 两次完整构建的 math/final ASAR 哈希一致。
- 官方 data prefix 保持逐字节一致。
- 8,160 个 packed entry 的 whole-entry 与 block hash 通过。
- 三个数学 entry 和一个 History entry 是唯一元数据变化。
- 共享单美元配置 entry 与官方源逐字节相同。
- `singleDollarTextMath: false` 保留一次，开启值为零。
- assistant renderer 和 KaTeX 保护窗口逐字节相同。
- 用户专用单美元标记只出现在用户气泡、预览和选择器路径。

## 运行验收

- 预览原文与发送后用户气泡原文的长度和 SHA-256 相同。
- 去除 React 自动生成的非语义 ID 后，共享 `user-formatted-text` 子树的结构哈希相同。
- 代码块、货币、Shell 变量和 URL 中的美元符号不触发数学渲染。
- 错误 LaTeX 局部显示错误文本，不清空预览或正文。
- 返回编辑后原文不变、焦点恢复，撤销仍有效。
- 输入法 composition 期间不能进入预览。

## 部署边界

- 候选应用：`ChatGPT-Math-26.818.41509-History.app`
- 旧版 `ChatGPT-Math-26.818.32112-History.app` 始终保留。
- 只有静态、签名、运行和 History 周期验收全部通过后才可部署。
- 原 Review Pack 和 `MANIFEST.sha256` 不修改。
