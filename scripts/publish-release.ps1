# ============================================================================
# publish-release.ps1 — 发布 GitHub Release + 上传安装包
#
# 用法（PowerShell）：
#   $env:GH_TOKEN = "<GitHub PAT，需 repo + workflow 权限>"
#   .\scripts\publish-release.ps1 -Version 1.1.0
#
# 前置：npm run build:release 已产出安装包（本脚本会自动调用）
# 产物目录：D:\cargo-build-target\desktop-note-widget\release\bundle\
# ============================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Repo = "usersanren/windchime-note"
$Tag = "v$Version"

if (-not $env:GH_TOKEN) {
    Write-Error "请先设置 $env:GH_TOKEN（GitHub PAT，需 repo + workflow 权限）"
    exit 1
}

$Headers = @{ Authorization = "Bearer $env:GH_TOKEN"; Accept = "application/vnd.github+json" }

# 0. 先打安装包（如果不存在）
$nsisPath = "D:\cargo-build-target\desktop-note-widget\release\bundle\nsis\WindChimeNote_${Version}_x64-setup.exe"
if (-not (Test-Path $nsisPath)) {
    Write-Host "[0/3] 安装包不存在，先运行 build:release（约 8 分钟）..." -ForegroundColor Cyan
    if (Test-Path dist) { Remove-Item -Recurse -Force dist }
    $env:CARGO_TARGET_DIR = "D:\cargo-build-target\desktop-note-widget"
    $env:TMP = "D:\build-tmp"; $env:TEMP = "D:\build-tmp"
    $env:Path = "C:\Users\Administrator\.cargo\bin;$env:Path"
    npm run tauri:build
}

# 1. 创建 Release（已存在则跳过）
$notes = "WindChimeNote v${Version} — 见仓库 README / DEVELOPMENT_SUMMARY 了解本次更新。"
$body = @{
    tag_name   = $Tag
    name       = $Tag
    body       = $notes
    draft      = $false
    prerelease = $false
} | ConvertTo-Json

Write-Host "[1/3] 创建/获取 Release $Tag ..." -ForegroundColor Cyan
try {
    $rel = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/releases" -Headers $Headers -Body $body -ContentType "application/json"
    Write-Host "  已创建: $($rel.html_url)"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 422) {
        Write-Host "  Release 已存在，复用..." 
        $rel = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$Repo/releases/tags/$Tag" -Headers $Headers
    } else {
        throw
    }
}

# 2. 上传安装包
Write-Host "[2/3] 上传安装包..." -ForegroundColor Cyan
$assetPaths = @(
    "D:\cargo-build-target\desktop-note-widget\release\bundle\nsis\WindChimeNote_${Version}_x64-setup.exe",
    "D:\cargo-build-target\desktop-note-widget\release\bundle\msi\WindChimeNote_${Version}_x64_en-US.msi"
)
foreach ($path in $assetPaths) {
    if (-not (Test-Path $path)) {
        Write-Host "  跳过（不存在）: $path"
        continue
    }
    $name = Split-Path -Leaf $path
    $uploadHeaders = @{ Authorization = "Bearer $env:GH_TOKEN"; "Content-Type" = "application/octet-stream" }
    $resp = Invoke-RestMethod -Method Post -Uri "https://uploads.github.com/repos/$Repo/releases/$($rel.id)/assets?name=$name" -Headers $uploadHeaders -InFile $path
    Write-Host "  已上传: $name"
}

Write-Host "[3/3] 完成！Release 页面: https://github.com/$Repo/releases/tag/$Tag" -ForegroundColor Green
