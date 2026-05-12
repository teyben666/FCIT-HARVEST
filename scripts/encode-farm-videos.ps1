# One-time prep before class: smaller H.264 MP4s + faststart (easier on one laptop serving ~25 clients).
# Requires ffmpeg on PATH: https://ffmpeg.org/download.html
# Run from repo root:  powershell -ExecutionPolicy Bypass -File .\scripts\encode-farm-videos.ps1
# Writes *_web.mp4 next to each .mp4; verify in the game, then replace originals if you want.

$ErrorActionPreference = 'Stop'
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Error 'ffmpeg not found on PATH. Install ffmpeg, then run this script again.'
}

$repoRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $repoRoot 'server.js'))) {
    Write-Error "Could not find server.js next to scripts folder. repoRoot=$repoRoot"
}
$farmDir = Join-Path $repoRoot 'farm video'
if (-not (Test-Path $farmDir)) {
    Write-Error "Folder not found: $farmDir"
}

$files = Get-ChildItem -Path $farmDir -Filter '*.mp4' -File
if ($files.Count -eq 0) {
    Write-Host 'No .mp4 files in farm video folder.'
    exit 0
}

Write-Host "Encoding $($files.Count) file(s) in: $farmDir"
foreach ($f in $files) {
    if ($f.Name -match '_web\.mp4$') { continue }
    $out = Join-Path $farmDir (($f.BaseName) + '_web.mp4')
    Write-Host "-> $($f.Name) ..."
    # H.264, cap width 1280, CRF ~26 (smaller files), faststart, drop audio (UI is muted)
    & ffmpeg -y -hide_banner -loglevel warning -i $f.FullName `
        -c:v libx264 -preset medium -crf 26 `
        -vf "scale='min(1280,iw)':-2" `
        -movflags +faststart -an `
        $out
}
Write-Host 'Done. Test clips in the game; if OK, rename: remove old .mp4 and rename *_web.mp4 to the original names.'
