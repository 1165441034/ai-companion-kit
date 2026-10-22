param(
    [string]$OwnerQQ, [string]$BotQQ, [string[]]$PrivateQQ = @(), [string[]]$GroupQQ = @(),
    [string]$SnowLumaHome, [string]$ProxyUrl, [switch]$SkipDownloads, [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$projectRoot = $PSScriptRoot
$packageRoot = Join-Path $projectRoot 'packages\desktop-qq'
Set-Location -LiteralPath $projectRoot

function Find-Codex {
    $command = Get-Command codex.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $desktopBins = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
    if (Test-Path -LiteralPath $desktopBins) {
        $candidate = Get-ChildItem -Path (Join-Path $desktopBins '*\codex.exe') -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($candidate) { return $candidate.FullName }
    }
    $npmRoot = (& npm.cmd root -g).Trim()
    $openaiRoot = Join-Path $npmRoot '@openai'
    if (Test-Path -LiteralPath $openaiRoot) {
        $candidate = Get-ChildItem -LiteralPath $openaiRoot -Filter codex.exe -Recurse -File | Select-Object -First 1
        if ($candidate) { return $candidate.FullName }
    }
    return $null
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    if ($SkipDownloads) { throw '缺少 Node.js，请先安装 Node.js LTS。' }
    & winget.exe install --id OpenJS.NodeJS.LTS --exact --silent --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { throw 'Node.js 安装失败' }
    $env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User')
}
& node.exe -e "const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<13))process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw '请升级到 Node.js 22.13+ / 24 LTS 后重试。' }

if (-not $ProxyUrl) {
    $proxySettings = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
    if ($proxySettings.ProxyEnable -eq 1 -and $proxySettings.ProxyServer -match '^127\.0\.0\.1:\d+$') { $ProxyUrl = 'http://' + $proxySettings.ProxyServer }
}
if ($ProxyUrl) { $env:HTTPS_PROXY = $ProxyUrl; $env:HTTP_PROXY = $ProxyUrl; $env:NO_PROXY = 'localhost,127.0.0.1,::1' }

$codexPath = Find-Codex
if (-not $codexPath) {
    if ($SkipDownloads) { throw '缺少 Codex，请安装桌面应用或 npm install -g @openai/codex。' }
    & npm.cmd install -g @openai/codex
    if ($LASTEXITCODE -ne 0) { throw 'Codex 安装失败' }
    $codexPath = Find-Codex
    if (-not $codexPath) { throw '找不到 Codex 原生可执行文件，请重开终端后重试。' }
}
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw '项目依赖安装失败' }

if (-not $SnowLumaHome) { $SnowLumaHome = Join-Path $projectRoot 'runtime\SnowLuma' }
if ($SnowLumaHome -match '[^\x00-\x7F]') { throw 'SnowLuma 路径必须为纯英文，请用 -SnowLumaHome 指定英文路径。' }
if (-not (Test-Path -LiteralPath (Join-Path $SnowLumaHome 'index.mjs'))) {
    if ($SkipDownloads) { throw '请使用 -SnowLumaHome 指定已安装的 SnowLuma。' }
    if (Test-Path -LiteralPath $SnowLumaHome) { throw '目标目录已存在但不完整，拒绝覆盖；请选择一个空的新目录。' }
    $release = Get-Content -LiteralPath (Join-Path $packageRoot 'snowluma-release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $runtimeDirectory = Join-Path $projectRoot 'runtime'
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
    $archive = Join-Path $runtimeDirectory ('SnowLuma-' + $release.version + '.zip')
    Invoke-WebRequest -Uri $release.url -OutFile $archive -UseBasicParsing
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower() -ne $release.sha256) { throw 'SnowLuma 下载校验失败，未解压。' }
    Expand-Archive -LiteralPath $archive -DestinationPath $SnowLumaHome
}
if ($SnowLumaHome -match '[^\x00-\x7F]') { throw 'SnowLuma 路径必须为纯英文，请用 -SnowLumaHome 指定英文路径。' }
if (-not $OwnerQQ) { $OwnerQQ = Read-Host '你的管理员主号 QQ' }
if (-not $BotQQ) { $BotQQ = Read-Host '机器人 QQ 号' }
if (-not $PrivateQQ.Count) { $extra = Read-Host '其他私聊白名单 QQ，逗号分隔，可留空'; if ($extra) { $PrivateQQ = $extra.Split(',') } }
if (-not $GroupQQ.Count) { $extra = Read-Host '白名单群号，逗号分隔，可留空'; if ($extra) { $GroupQQ = $extra.Split(',') } }
$options = @{ ownerQQ=$OwnerQQ; botQQ=$BotQQ; privateQQ=@($PrivateQQ); groups=@($GroupQQ); snowLumaHome=$SnowLumaHome; codexPath=$codexPath; proxyUrl=$ProxyUrl }
$options | ConvertTo-Json | & node.exe (Join-Path $packageRoot 'scripts\configure.mjs')
if ($LASTEXITCODE -ne 0) { throw '本机配置生成失败' }
if ($NoStart) { Write-Output '安装和本机配置已完成，未启动服务。'; exit 0 }

$listener = Get-NetTCPConnection -LocalPort 5099 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
    $runtimeLogs = Join-Path $projectRoot 'runtime'
    New-Item -ItemType Directory -Force -Path $runtimeLogs | Out-Null
    Start-Process -FilePath (Join-Path $SnowLumaHome 'node.exe') -ArgumentList '.\index.mjs' -WorkingDirectory $SnowLumaHome -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeLogs 'snowluma.stdout.log') -RedirectStandardError (Join-Path $runtimeLogs 'snowluma.stderr.log') | Out-Null
}
Write-Output 'SnowLuma: http://127.0.0.1:5099；初始密码见 runtime\snowluma.stdout.log。'
Write-Output '首次使用请自行确认协议、登录机器人 QQ，并启用 HTTP 3000 / WS 3001（绑定本机）。'
Start-Process 'http://127.0.0.1:5099'
Read-Host '配置完成后按回车继续' | Out-Null
$options | ConvertTo-Json | & node.exe (Join-Path $packageRoot 'scripts\configure.mjs')
if ($LASTEXITCODE -ne 0) { throw 'SnowLuma 端点配置失败' }
$auth = (& $codexPath login status 2>&1 | Out-String)
if ($auth -notmatch 'ChatGPT') {
    & $codexPath login
    $auth = (& $codexPath login status 2>&1 | Out-String)
    if ($auth -notmatch 'ChatGPT') { throw '请使用 ChatGPT 账号登录 Codex；本项目不自动切换到 API Key 计费。' }
}
& $codexPath mcp add desktop_qq -- (Get-Command node.exe).Source (Join-Path $packageRoot 'src\mcp-desktop-qq.mjs')
if ($LASTEXITCODE -ne 0) { throw '桌面 MCP 注册失败' }
& (Join-Path $packageRoot 'scripts\Start-QQ-AutoReply.ps1')
Write-Output '请在桌面应用中重启 desktop_qq；用主号或白名单群 @ 机器人做首次收发验收。'
