param([ValidateRange(1024,65535)][int]$Port=7862)
$ErrorActionPreference='Stop'
$studioInterfaces=Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway }
if (-not $studioInterfaces) { throw 'Interface LAN dengan default gateway tidak ditemukan.' }
$studioRuleName="Adexe-LoRA-Studio-LAN-$Port"
if (Get-NetFirewallRule -Name $studioRuleName -ErrorAction SilentlyContinue) {
    Write-Output "Rule $studioRuleName sudah tersedia."
} else {
    New-NetFirewallRule -Name $studioRuleName -DisplayName "Adexe LoRA Studio LAN ($Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -InterfaceAlias @($studioInterfaces.InterfaceAlias) -Profile Any -ErrorAction Stop | Out-Null
    if (-not (Get-NetFirewallRule -Name $studioRuleName -ErrorAction SilentlyContinue)) { throw 'Rule belum terpasang. Jalankan PowerShell sebagai Administrator.' }
    Write-Output "Port $Port diizinkan dari subnet lokal pada interface LAN."
}
