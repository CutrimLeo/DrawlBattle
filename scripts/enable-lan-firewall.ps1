param([string]$InterfaceAlias='Wi-Fi',[int]$Port=3001)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$statusPath=Join-Path $projectRoot '.qa/lan-firewall.json'
try {
  $nodeExecutable=(Get-Command node.exe -CommandType Application).Source
  $ruleName='Codex-DrawBattle-LAN-'+$Port
  $ruleParameters=@{Name=$ruleName;DisplayName='DrawBattle - jogadores na rede local';Direction='Inbound';Action='Allow';Enabled='True';Profile='Any';Protocol='TCP';LocalPort=$Port;RemoteAddress='LocalSubnet';InterfaceAlias=$InterfaceAlias;Program=$nodeExecutable}
  if(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue){Set-NetFirewallRule @ruleParameters | Out-Null} else {New-NetFirewallRule @ruleParameters | Out-Null}
  $result=@{ok=$true;rule=$ruleName;port=$Port;interface=$InterfaceAlias;remoteAddress='LocalSubnet';program=$nodeExecutable}
  New-Item -ItemType Directory -Path (Split-Path -Parent $statusPath) -Force | Out-Null
  $result | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding utf8
  Write-Host ('DrawBattle liberado na rede local pela porta '+$Port+'.')
} catch {
  New-Item -ItemType Directory -Path (Split-Path -Parent $statusPath) -Force | Out-Null
  @{ok=$false;error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding utf8
  Write-Error $_
  exit 1
}
