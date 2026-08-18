# ============================================================================
# build-release.ps1 — 打 release 安装包（MSI + NSIS + 主程序 exe）
#
# 用法：  PowerShell 中执行  .\scripts\build-release.ps1
# 产物：  D:\cargo-build-target\desktop-note-widget\release\bundle\{msi,nsis}\
#         D:\cargo-build-target\desktop-note-widget\release\WindChimeNote.exe
#
# 前置：  版本号如需更新，先改 package.json / src-tauri/tauri.conf.json / Cargo.toml
# 关键：  打包前删 dist（safe-delete shim 拦 bash rm，必须用 PowerShell）
# ============================================================================

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# 1. 删旧 dist
Write-Host "[1/2] 删除旧 dist..." -ForegroundColor Cyan
if (Test-Path dist) {
    Remove-Item -Recurse -Force dist
}

# 2. 环境变量重定向（C 盘空间不足，必须）
$env:CARGO_TARGET_DIR = "D:\cargo-build-target\desktop-note-widget"
$env:TMP = "D:\build-tmp"; $env:TEMP = "D:\build-tmp"
$env:Path = "C:\Users\Administrator\.cargo\bin;$env:Path"

# 3. release 打包（自动 npm run build + cargo build --release + 生成安装包）
Write-Host "[2/2] 打包 release（全量编译约 8 分钟）..." -ForegroundColor Cyan
npm run tauri:build

Write-Host "`n完成！产物：" -ForegroundColor Green
Write-Host "  - MSI:   D:\cargo-build-target\desktop-note-widget\release\bundle\msi\" -ForegroundColor Green
Write-Host "  - NSIS:  D:\cargo-build-target\desktop-note-widget\release\bundle\nsis\" -ForegroundColor Green
Write-Host "  - 主程序: D:\cargo-build-target\desktop-note-widget\release\WindChimeNote.exe" -ForegroundColor Green
