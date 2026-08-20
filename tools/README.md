# Tools

## inspect-only.sh

只读检查官方版本、数学副本、主进程、companion profile 进程、PID 文件和补丁 sentinel。

分享包中 LaunchAgent label 已脱敏为 `com.example...`。在本机使用前需要替换为实际 label。

它不会调用 open、kill、pause、resume、enable、disable 或任何 launchctl 写操作。

## self-check.sh

检查分享包中是否混入：

- 官方 ChatGPT 应用或 app.asar。
- 原始 companion 日志和状态文件。
- 常见私钥、Bearer Token 或 API Key。
- 未脱敏的本机 home 路径。

如果存在 MANIFEST.sha256，还会验证全部文件哈希。

