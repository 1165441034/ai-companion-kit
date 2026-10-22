$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $bridgeRoot 'state\desktop-auto'
$lockPath = Join-Path $stateDirectory 'service.lock'
if (Test-Path -LiteralPath $lockPath) {
    $serviceLock = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$serviceLock.pid)" -ErrorAction SilentlyContinue
    if ($existing -and $existing.CommandLine -match 'desktop-qq-auto\.mjs') {
        Write-Output "QQ 自动回复已运行，PID $($serviceLock.pid)"
        exit 0
    }
}
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
$configPath = Join-Path $bridgeRoot 'config.json'
$configuration = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$configuration.desktopQQ.autoReply.enabled = $true
[System.IO.File]::WriteAllText($configPath, ($configuration | ConvertTo-Json -Depth 50), [System.Text.UTF8Encoding]::new($false))
$nodePath = Join-Path $configuration.snowluma.homeDir 'node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) { $nodePath = (Get-Command node.exe -ErrorAction Stop).Source }
$entryPath = Join-Path $bridgeRoot 'src\desktop-qq-auto.mjs'
$service = Start-Process -FilePath $nodePath -ArgumentList ('"' + $entryPath + '"') -WorkingDirectory $bridgeRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDirectory 'service.stdout.log') -RedirectStandardError (Join-Path $stateDirectory 'service.stderr.log') -PassThru
Write-Output "QQ 自动回复已启动，PID $($service.Id)"
