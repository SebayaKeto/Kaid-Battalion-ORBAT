# Starts the 41st Orbat site on http://127.0.0.1:8090 and the 41st Ops bot.
# Run from PowerShell:  .\start-orbat.ps1
#   -Build   rebuild the website first (needs Node.js)
#   -NoBot   start the site only
#   -Lan     also open it to phones and PCs on your home network (http://<this PC's IP>:8090)
param([switch]$Build, [switch]$NoBot, [switch]$Lan)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { throw "No .env file. Copy .env.example to .env and fill it in." }

# The site and the bot share a secret. Create one the first time.
if (-not (Select-String -Path $envFile -Pattern '^\s*ORBAT_BOT_SECRET\s*=\s*\S{16,}' -Quiet)) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
  Add-Content -Path $envFile -Value "`r`n# Shared secret between the site and the 41st Ops bot (created automatically)`r`nORBAT_BOT_SECRET=$secret"
  Write-Host "Created ORBAT_BOT_SECRET in .env"
}

# Load .env into this process (the bot window inherits it)
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $k, $v = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process")
  }
}
foreach ($k in "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_BOT_TOKEN") {
  if (-not [Environment]::GetEnvironmentVariable($k, "Process")) { Write-Warning "$k is empty in .env" }
}

$node = Get-Command node -ErrorAction SilentlyContinue

if ($Build -or -not (Test-Path (Join-Path $root "pocketbase\pb_public\index.html"))) {
  if (-not $node) { throw "Rebuilding the site needs Node.js LTS from https://nodejs.org" }
  Push-Location (Join-Path $root "web")
  npm install
  npm run build
  Pop-Location
}

# Start the bot in its own window
if (-not $NoBot) {
  if (-not $node) {
    Write-Warning "Node.js isn't installed, so the bot won't start. Install Node.js LTS from https://nodejs.org and run this again."
  } else {
    $botDir = Join-Path $root "bot"
    if (-not (Test-Path (Join-Path $botDir "node_modules"))) {
      Push-Location $botDir
      npm install --no-audit --no-fund
      Pop-Location
    }
    Start-Process powershell -WorkingDirectory $botDir -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle = '41st Ops bot'; node index.js"
    Write-Host "41st Ops bot starting in a new window"
  }
}

$pb = Join-Path $root "pocketbase\pocketbase.exe"
if (-not (Test-Path $pb)) { throw "Put pocketbase.exe (v0.40.x, Windows amd64) in the pocketbase folder first." }
Set-Location (Join-Path $root "pocketbase")
if ($Lan) {
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -ExpandProperty IPAddress
  Write-Host ""
  Write-Host "Open on a phone on the same Wi-Fi:" -ForegroundColor Green
  foreach ($ip in $ips) { Write-Host "  http://${ip}:8090" -ForegroundColor Green }
  Write-Host "If Windows asks about the firewall, allow PocketBase on Private networks."
  Write-Host ""
  & $pb serve --http 0.0.0.0:8090
} else {
  & $pb serve --http 127.0.0.1:8090
}
