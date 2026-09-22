# Typeless 数学只读预览层

日期：2026-08-26

状态：实现、Control+Q、预热优化、中间屏幕左侧定位、置顶窗口、字号放大、下标变量、数值坐标元组和括号内数学表达式修复部署、受控验收完成；初始证据见 `receipts/2026-08-26-typeless-math-read-only-preview.json`，性能证据见 `receipts/2026-08-26-control-q-prewarm-optimization.json`，当前屏幕与视觉尺寸证据见 `receipts/2026-09-04-preview-sizing.json`，当前中间屏幕左侧证据见 `receipts/2026-09-05-middle-screen-left-region.json`，下标变量修复证据见 `receipts/2026-09-04-subscript-identifier-fix.json`，坐标元组修复证据见 `receipts/2026-09-05-coordinate-tuple-rendering.json`，括号内数学表达式修复证据见 `receipts/2026-09-11-parenthesized-math-rendering.json`。

## 目标

在不修改官方 ChatGPT/Codex 应用、不修改 Google Chrome、不修改 Typeless、不触碰 Computer History 的前提下，为官方 Codex composer 和 Chrome 当前聚焦的普通可编辑文本框增加一个显式触发的本地数学预览窗口。

合同固定为：

1. Typeless 或键盘继续向原 Codex/Chrome 文本框写入纯文本草稿。
2. 用户显式按 `Control+Q`；预览打开后再次按同一快捷键会关闭并返回来源编辑框。
3. Hammerspoon 只读取得触发瞬间真正聚焦元素的 AXValue；Codex 与 Chrome 使用相互独立的 matcher。
4. 纯 formatter 只在内存中生成预览文本，不写回原文本框。
5. 本地 WebKit 窗口使用本地 KaTeX 渲染数学。
6. 用户返回编辑、切换窗口或切换应用时，预览立即关闭。
7. 预览层不得发送消息、模拟按键或修改剪贴板。

## 不解决的边界

预览层只改善发送前检查。用户最终手动发送的仍是底层纯文本草稿，因此官方用户消息气泡中的单美元公式不会仅凭这个预览层自动获得新渲染能力。

若未来要求发送后气泡也渲染，必须另行选择发送时规范化或独立数学副本；不得把预览验收冒充发送后渲染验收。

## 角色边界

- Typeless：语音输入来源，不承担确定性渲染。
- `codex_math_formatter.lua`：纯函数，只在内存中把高置信单美元数学映射为官方行内定界。
- `codex_math_preview_hotkey.lua`：只读取得 AXValue，管理预览窗口和生命周期。
- `preview-template.html`、`preview.js`、`preview.css`：安全构造只读 DOM 并调用本地 KaTeX。
- KaTeX：固定为本地 vendor 的 0.18.4，不使用 CDN。
- 官方 ChatGPT/Codex：继续承担草稿、发送、账号、对话、更新和 Computer History。
- Google Chrome：只提供当前前台窗口和当前聚焦 Accessibility 元素；预览实现不读取网址、标签页正文、其他文本框或其他标签页。

## 草稿只读门禁

Codex 路径保持原严格门禁，触发前必须同时满足：

- 前台 Bundle ID 为 `com.openai.codex`。
- focused element 为 `AXTextArea`。
- AXDOMClassList 含 `ProseMirror`。
- 直接父级为 `AXGroup`，且 class 含 `_ComposerLayoutBody_` 前缀。
- AXSelectedTextRange 可设置，用作当前 composer 身份特征之一。

Chrome 路径单独使用 focused-editable 门禁：

- 前台 Bundle ID 精确为 `com.google.Chrome`。
- 只取得系统当前 `AXFocusedUIElement`；不搜索或遍历页面。
- 元素必须 `AXFocused=true` 且 `AXEnabled=true`，并且不能为 read-only。
- 普通元素角色必须为 `AXTextArea` 或 `AXTextField`；其他角色只有在 `AXContentEditable=true` 时才允许。
- `AXSecureTextField`、secure/password/protected/private 指示、密码 autocomplete 和无法确认的角色全部在读取 AXValue 前拒绝。保护属性采用三态检查；属性读取失败、异常类型或语义不明同样在 AXValue 前返回 `unsupported_text_field`。
- matcher 通过后只读取一次 AXValue；值不是字符串时返回 `unsupported_text_field`，不增加任何降级路线。

Chrome 路径不读取当前网址，不建立域名白名单，不访问浏览器历史，不使用 Chrome 扩展、DevTools 或网站 DOM 识别 composer。离线 HTML 只存在于验收夹具，不参与运行时匹配。

模块只允许调用 `attributeValue("AXValue")` 一次读取已通过 matcher 的草稿。禁止：

- `setAttributeValue`。
- `performAction`。
- `hs.pasteboard`。
- `hs.eventtap`、keyStroke、mouse 或 menu 注入。
- Return、Enter、发送按钮或提交动作。
- AXURL、当前标签页 URL、网页正文扫描和其他标签页读取。
- 日志、文件或网络中的草稿正文。

## 本地渲染

运行资源固定部署到 `$HAMMERSPOON_CONFIG/codex_math_preview_assets/`。运行时只加载自包含的 `preview-bundle.html`；以下源文件和许可文件同时保留用于重建与审计：

- `preview-bundle.html`
- `preview-template.html`
- `preview.js`
- `preview.css`
- `vendor/katex/katex.min.js`
- `vendor/katex/katex.min.css`
- `vendor/katex/contrib/auto-render.min.js`
- `vendor/katex/fonts/*.woff2`

模块只能读取这个规范目录中的 `preview-bundle.html`，并在 start 时校验其固定 SHA-256；禁止传入任意模板路径、URL、其他 file 目录或路径穿越。WebView 使用 `html()` 加载自包含页面，不建立 file base URL，也不运行时读取外部本地资源。

模板 CSP 默认拒绝全部来源。三段可执行脚本只允许构建时计算出的 SHA-256；字体只允许内嵌 data。当前 Hammerspoon 1.1.1 WebKit 的真实验收确认脚本 hash 可用，但内嵌 style hash 会连带阻止运行，因此 style 仅允许 `unsafe-inline`。该 style 由固定构建器生成，20 个字体全部转成 data URL，动态草稿不能进入 style；connect、object、frame、form、file 与远程来源仍全部关闭。

正文通过安全 JSON data script 进入页面，再用 `createTextNode`、`textContent` 和 `createElement` 构建 DOM。禁止 innerHTML、document.write、eval 和动态 Function。

预览只启用：

- 双美元块级数学。
- 反斜杠圆括号行内数学。
- 反斜杠方括号块级数学。

单美元不直接交给 KaTeX；只有纯 formatter 判定安全的 span 才在预览内存文本中转换。fenced code 与等长 backtick inline code 会生成真实 `pre`/`code` 节点，因此 KaTeX auto-render 会忽略它们。

对于单个大写字母及数字下标，例如 `S_1`、`S_2`、`L_1`、`L_2` 或 `S1`，以及由 2 至 4 个带符号数值分量组成的坐标元组，例如 `(-2,0,-2)`、`(1,-4,-8)`，formatter 将其视为高置信数学标识符并转换为官方行内定界；多词全大写环境变量、模板变量和带路径的 shell 变量仍保持原文，shell 命令替换形式如 `$(printf %s)` 也保持原文。这样下标变量和坐标会交给 KaTeX 渲染，不会把单美元定界符显示在预览正文中。

以左括号开头的单美元内容不再一律按 shell 命令替换保留。只有出现明确数学信号时才转换并交给 KaTeX：内容含反斜杠命令、含 `^`，或含两侧带空格的运算符（`+`、`-`、`=`、`*`、`/`）。因此 `$(1 + \cos xy)^2$`、`$(a+b)^2$`、`$(x^2)$` 会被渲染，而 `$(printf %s)$`、`$(pwd)$`、`$(git status)$`、`$(12.50)$` 仍保持原文。证据见 `receipts/2026-09-11-parenthesized-math-rendering.json`。

## 屏幕定位与置顶

- 默认优先选择名称为 `Redmi 27 NU` 的中间主屏幕；如果名称不可用，则选择坐标起点为 `x=0` 的中间屏幕，再回退到系统主屏幕。
- 窗口固定在该中间屏幕内部左侧约 28% 宽度的区域，不选择 `Built-in Retina Display` 或 `F27B51U PRO` 这两块旁侧显示器。
- 正式预览使用 `screenSaver` window level，并调用 `bringToFront(true)`，覆盖普通窗口、Dock、菜单栏和全屏窗口。
- 空 warm view 仍保持 alpha 0、desktop 层级和最终预览尺寸，不参与交互；消费后才恢复置顶层级并移动到中间屏幕左侧约 28% 宽度的区域。
- 当前实测正式窗口位于 Redmi 27 NU 内部左侧区域；预览正文计算字号为 21.24 像素，标题和返回编辑按钮也同步放大。

## 一次性空窗口预热

- Hammerspoon start 后创建一个只含固定空 bundle 的 WebView。
- 空窗口必须验证 KaTeX、auto-render、正文长度 0、payload 长度 0、editable 节点 0 和 external resource 0 后才能标记 ready。
- Warm 阶段使用 `allowTextEntry(false)`、alpha 0 和 desktop 层级；即使 macOS 将屏幕外坐标夹回某块显示器，它也位于正常窗口与桌面交互之后。
- 触发后先在空窗口内用受控 `render(payload)` 构造本次 DOM；确认 generation、view、来源 app、PID、window、focused element 和安全元数据都未变化后才恢复置顶层级并显示。
- 每个 warm view 只消费一次。一旦注入草稿，它就是 active draft view，关闭时直接 delete，绝不 hide、清空后复用或回到 pool。
- 关闭后后台补建一个全新的空窗口；warm loading、invalid、timeout 或 unavailable 时仍可走原有 cold create/show/delete 路径，不排队或保存草稿。
- stop、reload 和 shutdown 删除 active view 与 warm pool；同步 navigation/closing/stop 和所有旧 callback 都受 generation 与对象身份门禁。
- 不再同步强制原生 window focus；该调用在 Hammerspoon 1.1.1 上单独阻塞约 1.67 秒。show、bringToFront 与 application activation 异步完成焦点，0.75 秒 focus arm timer 继续 fail closed。

当前最终实机数据：旧 cold 路径窗口返回约 1743 ms、KaTeX 可用约 1968 ms；优化后内部连续 5 轮均走 `open_warm`，范围 14–55 ms，中位数约 37 ms。通过外部 Control+Q 事件的完整链路实测约 175–268 ms。

## 窗口生命周期

- Preview 首次获得焦点后才进入 armed 状态。
- Hammerspoon 1.1.1 只有在 active WebView 允许键盘焦点时才发出可靠的 `focusChange` 事件。因此正式显示前启用 `allowTextEntry(true)`，但页面没有 `input`、`textarea` 或 `contenteditable` 节点；该设置只服务于焦点生命周期，不提供正文编辑能力。空 warm view 始终为 false。
- armed 后失焦时安排一个 generation-bound 极短关闭任务。
- 若原生关闭事件先到，取消失焦任务并按显式关闭路径处理。
- 再次按 `Control+Q`、点击“返回编辑”、红色关闭按钮或 Escape：关闭 preview，并仅在原 PID、Bundle ID 和 window ID 仍匹配时恢复原来源窗口。
- 返回原 Codex/Chrome、切换到第三方应用、切到其他 Hammerspoon 窗口、原窗口消失或 stop：关闭 preview；非显式关闭路径不主动恢复来源焦点。
- 所有 watcher、timer 和 window callback 都带 generation token；旧 preview 回调不得关闭新 preview。

## 隐私与网络

草稿、预览文本和 AXValue 只可存在于当前 Lua/WebKit 内存。不得写入持久日志、文件、模型或网络。

KaTeX、CSS、字体和 preview 脚本全部内嵌在已固定哈希的 bundle 中。Hammerspoon 1.1.1 会把导航 URL 表示为嵌套的 NSURL table；policy callback 先做有界、fail-closed 规范化，只允许精确的 `about:blank`，nil、空 URL、缺字段、过深嵌套、循环 table、外部导航、新窗口、表单和未知 scheme 全部拒绝。custom close scheme 只用于关闭窗口。

## 验收层级

### 纯 formatter

- 正向、拒绝、混合、代码保护、幂等和换行守恒通过。
- 500 组固定种子 fuzz 的二次转换稳定。

### 模拟 preview

- require 无副作用，start/stop 幂等。
- Chrome 普通单行、多行和明确 contenteditable 接受；secure/password/protected、无文本焦点、非字符串 AXValue 和其他应用拒绝。
- Codex 非严格 composer 和空草稿拒绝；Chrome matcher 不改变 Codex matcher。
- 模拟 runtime 不提供 clipboard、key 或 AX write 能力。
- 显式关闭恢复原窗口；失焦和切应用不抢焦点。
- generation、timer、watcher 和窗口关闭事件顺序通过。
- 一次性 warm view 的 ready、consume、cold fallback、render fail、timeout、同步创建失败、stale callback、来源变化、补池、stop 和不复用含草稿 view 通过。
- 固定本地 asset root 与 remote/path traversal 拒绝通过。

### 模板与本地资源

- CSP、JSON 注入、textContent DOM、代码保护和 delimiter 白名单通过。
- KaTeX 0.18.4 JS、CSS、auto-render、LICENSE 和全部 woff2 字体存在。
- 两次构建逐字节一致，bundle 哈希与运行时固定值一致。
- Hammerspoon WebKit 能执行自包含 bundle；KaTeX 与 auto-render 可用，20 个字体均为 data URL，external resource 为 0。
- policy callback 允许规范化后的当前 `about:blank` 文档，不允许外部请求。

### 真实官方 Codex

只读验收必须：

- 在同一 element、PID 和 window 身份下，preview 前后 AXValue 逐字节相等。
- 对外只报告 `ax_value_equal=true/false` 与长度，不输出正文或内容哈希。
- pasteboard changeCount 前后相等，不读取剪贴板正文。
- Preview 可见且 KaTeX 真实生成 `.katex` 节点。
- 返回编辑、切第三方 app、preview 失焦和关闭按钮路径分别关闭。
- 消息列表没有新增用户消息；整个验收不得发送测试消息。
- Control+Q 打开和再次关闭后，13 字节、5 字符草稿逐字相等，pasteboard changeCount 相等。
- 连续 5 轮均为 `open_warm`，只有 1 个 Hammerspoon window，未观察到窗口或 RSS 递增。

### 真实 Google Chrome

使用 `tests/fixtures/chrome-focused-editable.html` 的临时 `127.0.0.1` 静态页完成必要范围验收；服务器只监听 loopback，验收后已停止，临时标签页已关闭。该夹具没有 form、提交按钮、网络脚本或站点适配。

- 单行 `AXTextField`：20 字节、12 字符前后相等，生成 1 个 KaTeX 节点，pasteboard changeCount 相等。
- 多行 `AXTextArea`：28 字节、20 字符前后相等，生成 1 个 KaTeX 节点，pasteboard changeCount 相等。
- 可访问 contenteditable 在当前 Chrome 中暴露为 `AXTextArea`：21 字节、11 字符前后相等，生成 1 个 KaTeX 节点，pasteboard changeCount 相等。
- 密码框暴露为 `AXTextField` 加 `AXSecureTextField` 子角色：返回 `protected_text_field`，预览未打开，pasteboard changeCount 相等。
- 非文本焦点暴露为 `AXGroup`：返回 `unsupported_text_field`，预览未打开，pasteboard changeCount 相等。
- Finder 前台时热键禁用；触发前后 controller result 不变，预览未打开。
- 页面侧复核确认三个普通文本值逐字不变；空密码框仍为空；form 与 submit control 数量均为 0。

## 部署与回滚

部署前备份 `init.lua`、controller、bundle 和 preview 脚本，验证 runtime 文件与仓库源码哈希一致，再增加 preview 模块的 require/start 和 shutdown stop。本轮性能优化备份位于 `$HOME/.hammerspoon/backups/codex-math-preview-prewarm-20260826-133600/`。

回滚只恢复部署前 Hammerspoon 配置并移走本轮 preview runtime 文件。不得修改官方应用、Chrome、Typeless、LaunchAgent 或 Computer History。数学副本的后续退役是独立、用户授权且可恢复的文件操作，不属于预览运行时。
