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

群聊默认普通消息 30% 抽样、冷却 3 分钟；@ / 点名优先，但也有 30 秒冷却。每群 10 分钟最多尝试 6 次，全局每分钟最多尝试 3 次。连续群消息合并 5 秒。白名单与拒绝名单在接收、发送两端检查，拒绝名单优先。机器人自己的消息不会触发回复，错误不自动重发，避免重复消息。

## 日记（完整教程第 9 步）

复用 companion 的 JSONL 索引和每日 Markdown 存储，按私聊 / 群聊分别保存在 `state/desktop-auto/diary/<会话哈希>/`，日期固定为香港时区。自动回复读取当前会话最近 3 条日记；成功回复后，当天尚无日记时尝试写一条，单进程每会话每天至多尝试一次。不是午夜定时任务，也不会把日记发送到 QQ。模型仍使用 ChatGPT 登录的 GPT-6.1 Sol / low，无需额外 API Key。

```powershell
node packages/desktop-qq/scripts/diary.mjs auto group:你的白名单群号
node packages/desktop-qq/scripts/diary.mjs list group:你的白名单群号
```

桌面 MCP 新增 `qq_write_diary(text, mood?, title?, tags?, type, targetId)`、`qq_read_diary(n?, day?, type, targetId)`，更新后需重启 desktop_qq。工具校验白名单，日记不授予发送权限。角色规则采用增补。`desktopQQ.diary.enabled: false` 关闭后台自动写作。为了避免遗忘内容从日记回流，收到本人“忘记：”请求时保守清空当前会话整本日记，其他会话不受影响；日记不包含在 memory 导出中，迁移时另行私下复制 diary 目录，勿提交仓库。

已阅读完整教程第十三章：当前没有发送失败自动重试、没有“正在输入”上报，保留每分钟 3 次全局尝试及群冷却。教程提及的连续失败熔断、每小时发送上限尚未实现；提高抽样概率不代表平台不会限制账号。遇到平台警告应停止服务排查，勿高频重启 SnowLuma。

## 发图和表情包（完整教程第 7 步）

仓库根目录 `images/` 放普通图片，`memes/` 放表情包。随仓库提供 40 张《孤独摇滚》表情（`btr_001.jpg`～`btr_040.jpg`）；其他本机素材默认不提交。MCP 新增 `qq_send_image(type, targetId, image, caption?, replyToMessageId?, atUserId?)`。image 是相对仓库根目录或绝对本机路径；仅允许 `desktopQQ.image.allowDirs` 内的普通文件，默认这两个目录，最大 10 MB，支持 PNG/JPEG/GIF/WebP（GIF 动画由 QQ 客户端展示）。引用和 @ 可选，@ 仅群聊支持。

路径先解析真实位置防目录逃逸，再检查大小和文件头，经现有带 Token 的本机 OneBot 端点发送 Base64 图片；不新增无认证的 HTTP 服务，也不接受远程网址。更新后重启桌面的 desktop_qq 才能看到新工具。

后台可在原本获准发送的简短文字回复后附一张表情，同一次 OneBot 请求发送，不增加消息轮次。`desktopQQ.autoReply.reactions` 控制：默认 10% 抽样、每会话间隔 15 分钟、每会话每小时最多 2 次，全局间隔 5 分钟且每小时最多 4 次；尝试（含发送失败）计数写入会话状态，跨重启保留，不因收到表情或点名绕过限制。根据文字匹配开心、微笑、疑惑，严肃话题和长回复不附图，连续不发同一文件，找不到合适或可读图片时只发文字。

素材目录 `memes/catalog.json`（不提交）格式为 `[{"file":"memes/example.png","moods":["happy","smile","confused"],"source":"来源页面"}]`，每条只列适合该图的情绪。只有列入目录的本地图片才会被自动选择。新电脑没有本机目录时自动读取随仓库提供的 `memes/catalog.default.json`，直接使用这 40 张素材（20 张参与自动选择，其他可手动发送）；已有 `catalog.json` 优先且不会被覆盖。随仓库素材的来源与哈希在默认目录和 `memes/SOURCES.md` 中，其他私人素材需另行迁移。本机已检查素材内容、工具注册和频率规则，自动图片发送的真实验收需实际聊天触发后核对。

本机已通过 `qq_send_image` 向管理员发送角色表情，管理员确认收到且显示正常；该验证证明手动图片链路可用，不等同于概率触发的后台自动表情验收。

## 读取群友图片和表情

后台接收纯图、混合文字图片、动画表情图片段和 CQ 编码消息。通过群聊参与判断后，才下载当前合并批次最多两张图片，单张最大 10 MB、解码最大 2000 万像素，缩放至 1280 像素内，使用 Codex `--image` 附给同一 GPT 模型；GIF/WebP 等动图只识别首帧。原有 30% 群聊抽样、冷却和上限不变，图片不会绕过频率规则。`desktopQQ.vision.enabled: false` 可以关闭下载识图。

仅允许指定 QQ CDN 地址，逐跳检查重定向，不读取群消息里指定的硬盘路径；图片及其文字作为不可信聊天数据。临时 PNG 在本次生成结束后删除，不写入长期记忆。下载链接过期、消息无下载地址或格式不支持时明确标为无法读取，不假装识别成功。QQ 内置 face 表情保留 ID 作为上下文，不等同于图片视觉识别；尚未接入被引用的旧图自动回取。

本机已从真实群消息下载一张聊天截图，并通过 GPT-6.1 Sol / low 正确识别其内容；该检查没有发送 QQ 消息。群聊识图后自动回复仍需新消息触发验收。

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
