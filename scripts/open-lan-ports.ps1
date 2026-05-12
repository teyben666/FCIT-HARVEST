# Allow inbound TCP 3000 (Node) and 5173 (Vite dev).
# Uses Profile Any (Private + Public + Domain) so Windows "移动热点" / Mobile Hotspot works —
# hotspot is often classified as Public; rules with only Private would not apply.
#
# MUST run elevated: Start -> type "PowerShell" -> right-click -> Run as administrator
#   cd ...\farm-coding-game\scripts
#   .\open-lan-ports.ps1
#
# Phone on YOUR PC's hotspot: in ipconfig find "本地连接* xx" / vEthernet / 192.168.137.1
#   then open http://192.168.137.1:5173 or :3000 (not your home Wi-Fi IP).

$ErrorActionPreference = 'Stop'

$isAdmin = (
    [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host ''
    Write-Host 'ERROR: Not running as Administrator.' -ForegroundColor Red
    Write-Host 'Open PowerShell -> Run as administrator, then cd here and run .\open-lan-ports.ps1'
    Write-Host ''
    exit 1
}

$rules = @(
    @{ Name = 'Harvest IT - Node API 3000'; Port = 3000 },
    @{ Name = 'Harvest IT - Vite dev 5173'; Port = 5173 }
)

foreach ($r in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Set-NetFirewallRule -DisplayName $r.Name -Profile Any -ErrorAction Stop
        Write-Host "Updated to all profiles: $($r.Name)" -ForegroundColor Green
        continue
    }
    New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $r.Port -Profile Any -ErrorAction Stop | Out-Null
    Write-Host "Created: $($r.Name)" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Home Wi-Fi: http://<WLAN IPv4>:5173 or :3000' -ForegroundColor Cyan
Write-Host 'PC Mobile Hotspot: often http://192.168.137.1:5173 — check ipconfig for hotspot adapter.' -ForegroundColor Cyan
