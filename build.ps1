#requires -Version 5.1
<#
    build.ps1 —— 构建重建版
    依赖：Rust (stable) + MSVC Build Tools + WebView2 Runtime + tauri-cli 2.x
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location (Join-Path $root 'backend')

try {
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Write-Host '未找到 cargo。先装 Rust：' -ForegroundColor Yellow
        Write-Host '  winget install Rustlang.Rustup'
        Write-Host '  winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"'
        exit 1
    }

    if (-not (Get-Command cargo-tauri -ErrorAction SilentlyContinue)) {
        Write-Host '安装 tauri-cli…' -ForegroundColor Cyan
        cargo install tauri-cli --version "^2" --locked
    }

    Write-Host '开始构建（首次会拉依赖，10 分钟级）…' -ForegroundColor Cyan
    cargo tauri build

    $bundle = Join-Path $PWD 'target\release\bundle'
    if (Test-Path $bundle) {
        Get-ChildItem $bundle -Recurse -Include *.exe, *.msi | Select-Object FullName, Length |
            Format-Table -AutoSize | Out-String -Width 160 | Write-Host
    }
}
finally {
    Pop-Location
}
