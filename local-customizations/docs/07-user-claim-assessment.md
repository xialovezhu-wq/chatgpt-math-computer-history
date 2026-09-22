# 对当前三个问题的独立判断

## 问题一：是否一直是官方 ChatGPT 和数学副本同时运行

原始设计意图基本如此，但当前实际状态不是“两个完整交互应用始终同时运行”。

已确认：

- 数学副本主进程正在运行。
- 标准官方 ChatGPT 主进程当前没有运行。
- 数学副本可以独立完成聊天。
- 数学副本的 Computer History 部分控制会调用外部 SkyComputerUseClient。
- LaunchAgent 只在特定恢复条件下用独立 profile 启动隐藏官方 ChatGPT。

因此更准确的描述是：

“数学副本是交互主应用；Computer History 控制通过官方组件和共享服务间接完成；必要时 companion 会额外启动一个隐藏官方应用实例。”

不能把“官方主进程始终负责录制”写成当前已确认事实，因为当前进程表没有官方主进程。

## 问题二：数学副本有对话，官方看不到

这个屏幕现象成立，但底层原因还没有完全确认。

已确认：

- 数学副本使用默认 Codex profile。
- companion 官方实例使用另一个 Shared Config profile。
- 两套 Electron 本地状态必然分离。

仍需确认：

- 两边是否登录相同账号、workspace 和组织。
- 对话缺失发生在本地 thread cache、远端 thread catalog 还是 UI 过滤。

所以“因为 profile 不同导致对话不可见”是当前最合理解释之一，但不是唯一已证明根因。

## 问题三：官方启动不了，必须 Computer History 先运行

现有信息不足以确认这个因果结论。

当前能确认的是：

- 数学副本运行时，标准官方主进程不存在。
- 历史状态当前为 stopped。
- 数学副本仍能聊天。
- companion 历史日志存在 app-server 409 冲突。
- companion profile 初始化日志存在 late userData path warning。
- 数学副本只代理了部分 Computer History 控制方法。

更强的根因候选是：

1. 两个应用或 app-server 争夺单实例、profile 或远程身份。
2. Computer History 控制面一部分走外部服务，一部分走数学副本本地 controller。
3. 启动 readiness 和 profile 切换存在竞态。

要证明“必须先运行 Computer History”，必须在隔离环境完成启动矩阵：

- History stopped，先开官方。
- History stopped，先开数学。
- History running，先开官方。
- History running，先开数学。
- companion 完全卸载后重复以上测试。

本轮只整理证据，没有改变运行状态执行这些实验。

