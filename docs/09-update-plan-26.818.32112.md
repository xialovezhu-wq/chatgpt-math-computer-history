# ChatGPT Math 26.818.32112 更新计划

计划日期：2026-08-22

状态：待审查，尚未授权实施、部署或删除旧副本

## 1. 目标

从当前官方 ChatGPT 26.818.32112（build 6933）重新构建数学副本，保留现有受限数学渲染能力和已验收的 Computer History 显式 companion activation，同时避免在旧数学副本上增量覆盖。

本计划只定义更新方法、证据门禁、回滚边界和验收标准。计划提交不授权修改官方应用、现有数学副本、LaunchAgent、Computer History 状态或运行进程。

## 2. 当前已确认基线

- 官方 ChatGPT：26.818.32112，build 6933。
- 官方 `app.asar` SHA-256：`128c748e313a7a630d689f9fa215724eb44fbea6e0a5d7990867370cf73d88d3`。
- 现有数学副本：26.814.41407，build 6720。
- 现有数学副本 `app.asar` SHA-256：`e3497261ea7fcc556ad9a2f829d361c1a593a86b698175ed6825b8c92e05adef`。
- 旧构建器锁定 26.814.41407 的源哈希、entry 文件名、压缩代码锚点、输出路径和候选哈希，不能直接用于 26.818.32112。
- GitHub `main` 当前为 `4decc18c037100d6cac999a4c6cb6821b15ccf45`，仓库为 Private。
- 固定基线 tag `review-baseline-2026-08-20` 不得移动。

## 3. 证据分类

### Confirmed

- 官方版本已经高于现有数学副本。
- 每次官方更新都可能改变 ASAR entry 名称、压缩变量、React cache slot、函数锚点和源哈希。
- 当前数学副本包含三类数学渲染修改和一类 History main-process 修改。
- 当前 Computer History 实现仍是部分代理和 companion 组合，不是官方扩展接口。

### Hypothesis

- 26.818.32112 可能仍保留等价的用户气泡、注释和 History 控制路径，但必须通过新版 ASAR 只读审计确认。
- 外部 `manage.sh` 可能无需逻辑修改，但其官方 node 路径、MCP 工具和状态语义仍需重新验证。

### Unknown / Needs verification

- 新版目标 entry 的精确路径和数量。
- 旧版每个压缩锚点在新版的对应形式。
- 新版是否改变 Computer History 控制器、MCP 工具或 companion 生命周期。
- 新版候选实际需要修改多少个 ASAR entry。

## 4. 停止条件

出现以下任一情况时停止构建，不猜测替换：

1. 任一目标绑定不能唯一确认。
2. 任一旧锚点或新版语义锚点命中数不是 1。
3. 目标功能只能通过扩大到未授权表面才能实现。
4. 新版 Computer History 接口发生不可解释变化。
5. 候选 ASAR 出现目标之外的 entry 元数据变化。
6. 数据前缀、entry integrity、block hash 或 header round trip 校验失败。
7. 签名、entitlements、AMFI 或启动验证失败。
8. 部署无法把候选应用与 matching manager 作为同一回滚单元。

## 5. 实施阶段

### 阶段 A：只读兼容性审计

1. 读取官方版本、build、Bundle ID、签名结构和 ASAR 哈希。
2. 只读解析新版 ASAR header 和 entry 清单。
3. 重新定位：
   - 数学 Markdown extension；
   - 用户消息气泡调用；
   - 注释浮层及已保存注释渲染；
   - Electron main entry；
   - Computer History 控制器和显式 retry/enable 路径。
4. 记录 entry 路径、语义标记、命中计数和证据强度，不保存或提交完整官方源码。
5. 输出 Confirmed、Candidate mapping、Incompatible gate、Unknown 和下一步检查。

### 阶段 B：版本锁定构建器

1. 为 26.818.32112 创建独立、版本锁定的构建参数。
2. 锁定新版官方源哈希、entry 路径、原始 entry integrity 和 exactly-once 锚点。
3. 不覆盖旧版 26.814.41407 构建器和验证证据。
4. 所有构建输出写入独立候选目录，不写入 `/Applications`。

### 阶段 C：数学渲染移植

1. 移植受限单美元 inline tokenizer。
2. 仅在专用用户气泡和注释 className 下启用。
3. 保持双美元、货币、Shell 变量、代码、转义、URL、未配对和跨行保护。
4. 验证 assistant 消息和其他 Markdown 表面未被全局改变。

### 阶段 D：Computer History 显式激活移植

1. 重新定位新版 main-process 控制器。
2. 仅移植现有五方法 MCP 代理和已验收的用户显式 companion activation。
3. 保持 `setEnabled(false)`、pause、resume 和周期 manager 的既有边界。
4. 不扩大代理覆盖，不修改 App Group、Bundle entitlement 或官方服务设计。
5. 若新版 `cua_node`、MCP 工具或 retry/enable 语义发生变化，停止并单独评审。

### 阶段 E：完整 ASAR 验证

1. 保留官方 data 区域前缀逐字节不变。
2. 只追加确认过的目标 entry，并更新对应 offset、size、whole-entry hash 和 block hash。
3. 根据新版实际目标数量设置 `metadataChangeCount`，不预设仍为 4。
4. 验证所有 entry、header、候选整包哈希和 sentinel 数量。
5. 输出机器可复核的候选验证 receipt，不提交官方 ASAR 或提取源码。

### 阶段 F：候选应用

候选名称：`ChatGPT-Math-26.818.32112-History.app`

1. 从最新版官方应用全量复制。
2. 替换候选 ASAR。
3. 修改专用 Bundle ID、Display Name 和 `ElectronAsarIntegrity`。
4. 使用现有本地签名方案重签名。
5. 验证 deep、strict、designated requirement 和 entitlements。
6. 候选构建阶段不覆盖或删除旧数学副本。

### 阶段 G：外部一次性部署

1. 由外部 Terminal 在数学副本退出后执行部署脚本，避免宿主会话替换自身。
2. 部署前核对版本、候选哈希、header hash、签名和 sentinel。
3. 候选应用与 matching manager 作为一个回滚单元。
4. 任一验证失败自动恢复旧应用和旧 manager。
5. 停止、替换或启动应用前再次取得用户明确确认。

### 阶段 H：运行验收

数学显示：

1. 用户消息中的受限单美元行内公式。
2. 独立公式。
3. 注释所选文本、用户评论和已保存注释列表。
4. 货币、Shell、代码、转义、URL 和跨行保护。

Computer History：

1. 用户显式 retry/enable 启动且只启动一个 companion。
2. 状态、暂停、恢复和禁用行为符合应用返回语义。
3. 暂停后等待超过一个 300 秒 LaunchAgent 周期，确认不会自动重启 companion。
4. 无新增 app-server 409，无重复 companion 主进程。

应用兼容性：

1. 数学副本正常启动。
2. 官方 ChatGPT 能独立启动。
3. 对话和配置可见性只记录屏幕可见事实，不读取数据库。
4. `codesign --verify`、AMFI、Gatekeeper、实际启动和 UI 分别验收，不互相替代。

### 阶段 I：切换、清理和发布

1. 用户完成实际验收后再切换主用副本。
2. 旧版继续保留为回滚副本。
3. 只有用户再次明确同意，才将旧副本移到废纸篓；不做不可恢复删除。
4. 原始 Review Pack 和原 `MANIFEST.sha256` 保持不变。
5. 新版审查材料进入独立版本目录和独立清单，不提交官方二进制、完整提取源码、凭据、日志或用户数据。
6. 使用独立 commit 和新 tag；不移动原固定 tag，不 force push。

## 6. 审核门

本计划需要依次通过三个审核门：

1. 计划审核：确认范围、停止条件和验收矩阵。
2. 只读兼容性审核：确认新版 entry mapping 与旧实现的实际差异。
3. 候选部署审核：确认候选验证 receipt、回滚单元和需要改变的应用状态。

当前授权只覆盖计划文件推送和只读兼容性审计，不覆盖阶段 B 到阶段 I 的实施。
