# Android アプリ（デバッグ版）を組み立てる
# - フォルダー名に日本語（アプリ）が入っていると Android の組み立てツールが動かないため、
#   英字だけのドライブ名 T: を割り当ててから組み立てる
# 使い方：powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 [-Release]
param([switch]$Release)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$jdk = Get-ChildItem 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-21*' | Select-Object -First 1
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

if (-not (Test-Path 'T:\android')) { subst T: $root }
Set-Location T:\
npm run sync
if ($LASTEXITCODE -ne 0) { exit 1 }
Set-Location T:\android
$task = if ($Release) { 'bundleRelease' } else { 'assembleDebug' }
.\gradlew.bat $task --no-daemon  # 常駐プロセスを残さない（残ると、出力を待つ側の処理が終わらなくなる）
exit $LASTEXITCODE
