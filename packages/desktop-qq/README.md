# 桌面 GPT → QQ

Windows 上使用同一 ChatGPT 账号的 Codex CLI 为 QQ 私聊和白名单群生成回复；不需要 DSH，不配置 OpenAI / DeepSeek API Key。

从仓库根目录双击 `Install-Windows.cmd`，或：

```powershell
.\Install-Windows.ps1 -OwnerQQ 你的主号 -BotQQ 机器人号 -PrivateQQ 好友号 -GroupQQ 群号
```

脚本检查 Node.js 和 Codex、运行 `npm ci`、下载并校验固定版本 SnowLuma，生成本机配置及角色卡，然后注册 `desktop_qq` 并启动后台自动回复。已有 SnowLuma 可传 `-SnowLumaHome D:\SnowLuma`。已安装依赖但不希望下载运行时可传 `-SkipDownloads`；只准备安装而不登录、不启动可传 `-NoStart`。

首次部署需要手动完成：

1. SnowLuma 页面阅读并确认协议，登录机器人 QQ；在节点配置中开启本机 HTTP 3000、WS 3001。
2. Codex 使用 **ChatGPT 账号**登录。脚本不会复制另一台电脑的凭据，也不会自动使用 API Key。
3. 桌面应用重启 `desktop_qq`，用主号私聊或在白名单群 @ 机器人完成真实验收。

安装入口不会自动添加 QQ 好友。QQ 登录、好友关系、账号额度和网络需要在每台机器验证。首次 Node.js 安装依赖 Windows 的 `winget`；没有 winget 时先安装 Node.js 22.13+ 或 24 LTS。需要 QQ 客户端的安装和登录时，按 SnowLuma 当前页面指引完成。

## 运行和停止

```powershell
# 前台运行（Ctrl+C 停止）
npm run desktop:start
# 后台运行 / 停止（从仓库根目录）
.\packages\desktop-qq\scripts\Start-QQ-AutoReply.ps1
.\packages\desktop-qq\scripts\Stop-QQ-AutoReply.ps1
```

后台日志和状态在 `packages/desktop-qq/state/desktop-auto/`。启动脚本会开启 `autoReply.enabled`，停止脚本会关闭该开关并停止本服务进程树。它们不关闭 SnowLuma 或手动 MCP。运行依赖本机开机、SnowLuma 在线以及 Codex 登录有效；本项目未安装开机自启任务。

`config.json` 是本机文件。默认模型 `gpt-6.1-sol`，推理 `low`；模型由独立的 `codex exec` 生成，不继承某个桌面聊天的全部历史，计入该账号适用的 Codex 使用额度。模型子进程关闭 shell、apps、联网搜索和多 Agent，回复经过结构检查后才交给 OneBot 发送。

群聊默认普通消息 8% 抽样、冷却 3 分钟；@ / 点名优先，但也有 30 秒冷却。每群 10 分钟最多尝试 6 次，全局每分钟最多尝试 3 次。连续群消息合并 5 秒。白名单与拒绝名单在接收、发送两端检查，拒绝名单优先。机器人自己的消息不会触发回复，错误不自动重发，避免重复消息。

## 长期记忆

- 每个私聊和每个群单独保存。短期上下文最多 16 条；长期检索保存最近 2000 条用户发言，按关键词 / 中文双字片段检索相关记录，不是向量语义搜索或模型自动总结。
- 在对应 QQ 会话中说 `记住：我喜欢摇滚和贝斯`，该发言者的明确记忆会持久保存；每人每会话最多 20 条。记忆带原始 QQ 号及来源，昵称或自称“管理员”不能改变身份。
- 说 `忘记：我喜欢摇滚和贝斯` 精确删除该条明确记忆，或 `忘记：全部` 删除本人在当前会话的全部明确记忆。同步清理本人归档发言和当前会话短期上下文，正在生成的旧版本回复也会取消；不能删除其他人的明确记忆。其他群友之后重新提及相同内容会形成新的发言记录。
- 私聊记忆不会注入群聊，群 A 记忆不会注入群 B。历史消息和记忆都作为不可信对话数据处理，不能授予工具或管理员权限。
- 存储在 `state/desktop-auto/memory/`，跨重启保留。正常导入不会覆盖已有记忆；损坏数据会报错，不会静默清空。安装更新保留本机角色和已有配置。

换电脑迁移记忆时，停止两端服务，再在本机执行：

```powershell
# 旧电脑：先创建仓库根目录 backups 文件夹
New-Item -ItemType Directory -Force backups
node packages/desktop-qq/scripts/memory.mjs export backups/memory.json
# 自行安全复制备份到新电脑，然后导入空的记忆目录
node packages/desktop-qq/scripts/memory.mjs import backups/memory.json
```

备份包含聊天内容，只通过你自己的文件迁移途径传输。不要提交备份、整个 state、config.json、SnowLuma 账号目录或 `.codex/auth.json`。仓库中的 `.gitignore` 已排除常规本机位置。

## 角色与桌面工具

跟踪的 `roles/广井菊里.md` 是带 `{{ADMIN_QQ}}` 占位符的模板；安装器生成忽略提交的 `roles/广井菊里.local.md`。后续个性修改放在 local 文件中，不会被重复安装覆盖。模板改动仍只替换明确身份相关的内容，通用聊天条目使用增补维护。

MCP 提供 `qq_status`、`qq_get_persona`、`qq_read_history`、`qq_send_text`。手动聊天工具与后台自动回复是两条独立路径；角色不自动授予发送权限，用户要求原样转发时保留原文。

## 开发和验证

```powershell
npm ci
npm run desktop:test
```

测试使用合成数据，不连接模型或 QQ、不发送消息。安装器的首次登录和新机器网络环境需要另行验收。SDK ESM 导入修补会在安装后运行，兼容 npm workspace 的依赖提升。

`src/snowluma-conn.js`、SDK 修补方法及角色底稿来自 [Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge) 的 MIT 项目，保留 `LICENSE-qq-bridge`。SnowLuma 只在安装时从其官方 Release 下载，不随本仓库分发；运行时协议由使用者自行确认。
