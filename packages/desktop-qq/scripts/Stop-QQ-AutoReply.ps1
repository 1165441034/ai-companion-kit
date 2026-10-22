$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $bridgeRoot 'state\desktop-auto'
$configPath = Join-Path $bridgeRoot 'config.json'
$configuration = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$configuration.desktopQQ.autoReply.enabled = $false
[System.IO.File]::WriteAllText($configPath, ($configuration | ConvertTo-Json -Depth 50), [System.Text.UTF8Encoding]::new($false))
$lockPath = Join-Path $stateDirectory 'service.lock'
if (Test-Path -LiteralPath $lockPath) {
    $serviceLock = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $serviceId = [int]$serviceLock.pid
    $service = Get-CimInstance Win32_Process -Filter "ProcessId=$serviceId" -ErrorAction SilentlyContinue
    if ($service -and $service.CommandLine -match 'desktop-qq-auto\.mjs') {
        & taskkill.exe /PID $serviceId /T /F | Out-Null
    }
    Remove-Item -LiteralPath $lockPath
}
Write-Output 'QQ 自动回复已关闭，桌面手动 QQ 工具仍可使用。'
