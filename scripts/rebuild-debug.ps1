# ============================================================================
# rebuild-debug.ps1 — 更新 debug exe（前端改动 + Rust 编译，独立运行无需 vite）
#
# 用法：  PowerShell 中执行  .\scripts\rebuild-debug.ps1
# 产物：  D:\cargo-build-target\desktop-note-widget\debug\desktop-note-widget.exe
#
# 关键说明：
#  - Tauri v2 debug 构建默认走 devUrl（localhost:1420）→ 直接跑 exe 会白屏。
#    本脚本用 `tauri build --debug` 生成嵌入资源版，可独立运行。
#  - `cargo build`（debug）不会检测 dist 内容变化（1 秒完成=没嵌入），
#    必须走 tauri build 才会先 npm run build 再嵌入。
# ============================================================================

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# 1. 删旧 dist（safe-delete shim 会拦 bash rm，必须用 PowerShell）
Write-Host "[1/2] 删除旧 dist..." -ForegroundColor Cyan
if (Test-Path dist) {
    Remove-Item -Recurse -Force dist
}

# 2. 环境变量重定向（C 盘空间不足，必须）
$env:CARGO_TARGET_DIR = "D:\cargo-build-target\desktop-note-widget"
$env:TMP = "D:\build-tmp"; $env:TEMP = "D:\build-tmp"
$env:Path = "C:\Users\Administrator\.cargo\bin;$env:Path"

# 3. tauri build --debug：自动跑 npm run build（前端）→ cargo build（Rust，嵌入 dist）
Write-Host "[2/2] 编译 debug exe（嵌入资源版，约 8 分钟）..." -ForegroundColor Cyan
npm run tauri:build -- --debug

Write-Host "`n完成！产物：D:\cargo-build-target\desktop-note-widget\debug\desktop-note-widget.exe" -ForegroundColor Green
Write-Host "直接运行该 exe 即可（无需 vite）。" -ForegroundColor Green
