# Allow inbound TCP 3000 (Node) and 5173 (Vite dev) on private networks.
#
# MUST run elevated: Start -> type "PowerShell" -> right-click "Windows PowerShell" ->
#   Run as administrator -> cd to this folder -> .\open-lan-ports.ps1
#
# If you prefer GUI: Windows Security -> Firewall & network protection ->
#   Advanced settings -> Inbound Rules -> New Rule -> Port -> TCP -> 3000 -> Allow (repeat for 5173).

$ErrorActionPreference = 'Stop'

$isAdmin = (
    [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host ''
    Write-Host 'ERROR: Not running as Administrator. Firewall rules were NOT added.' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Fix: Close this window. Open Start, type PowerShell, right-click -> Run as administrator.'
    Write-Host 'Then: cd ' -NoNewline
    Write-Host $PSScriptRoot -ForegroundColor Yellow
    Write-Host 'Then: .\open-lan-ports.ps1'
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
        Write-Host "Already exists: $($r.Name)"
        continue
    }
    New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $r.Port -Profile Private -ErrorAction Stop | Out-Null
    Write-Host "Created: $($r.Name)" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Done. On your phone use http://<PC-LAN-IP>:5173 (dev) or :3000 after npm run start:lan' -ForegroundColor Cyan
