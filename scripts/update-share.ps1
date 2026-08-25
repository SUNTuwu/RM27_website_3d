[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet("update", "status", "stop")]
  [string]$Action = "update",

  [ValidateRange(1024, 65535)]
  [int]$Port = 4173
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$toolsDir = Join-Path $repoRoot ".tools"
$cloudflaredPath = Join-Path $toolsDir "cloudflared.exe"
$previewOutLog = Join-Path $toolsDir "preview.out.log"
$previewErrorLog = Join-Path $toolsDir "preview.err.log"
$tunnelOutLog = Join-Path $toolsDir "tunnel.out.log"
$tunnelErrorLog = Join-Path $toolsDir "tunnel.err.log"
$previewPidFile = Join-Path $toolsDir "preview.pid"
$tunnelPidFile = Join-Path $toolsDir "tunnel.pid"
$urlFile = Join-Path $toolsDir "share-url.txt"
$localUrl = "http://127.0.0.1:$Port"

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

function Get-ListenerProcessId {
  param([int]$ListenPort)

  $pattern = "^\s*TCP\s+127\.0\.0\.1:$ListenPort\s+0\.0\.0\.0:0\s+LISTENING\s+(\d+)\s*$"
  foreach ($line in (& netstat.exe -ano -p TCP)) {
    if ($line -match $pattern) {
      return [int]$matches[1]
    }
  }

  return $null
}

function Test-IsProjectPreview {
  param([int]$ProcessId)

  try {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    if ([IO.Path]::GetFileName([string]$process.Path) -ine "node.exe") {
      return $false
    }
  } catch {
    return $false
  }

  if (Test-Path -LiteralPath $previewPidFile) {
    $storedProcessId = 0
    $storedValue = (Get-Content -Raw -LiteralPath $previewPidFile).Trim()
    if ([int]::TryParse($storedValue, [ref]$storedProcessId) -and $storedProcessId -eq $ProcessId) {
      return $true
    }
  }

  $distIndexPath = Join-Path $repoRoot "dist\index.html"
  if (-not (Test-Path -LiteralPath $distIndexPath)) {
    return $false
  }

  try {
    $localResponse = Invoke-WebRequest -UseBasicParsing -Uri "$localUrl/" -TimeoutSec 3
    $localIndex = Get-Content -Raw -LiteralPath $distIndexPath
    $bundleMatch = [regex]::Match($localIndex, "/?assets/index-[A-Za-z0-9_-]+\.js")
    if ($localResponse.StatusCode -eq 200 -and
      $bundleMatch.Success -and
      $localResponse.Content -match [regex]::Escape($bundleMatch.Value)) {
      Set-Content -LiteralPath $previewPidFile -Value $ProcessId
      return $true
    }
  } catch {}

  return $false
}

function Get-TunnelProcess {
  if (Test-Path -LiteralPath $tunnelPidFile) {
    $storedProcessId = 0
    $storedValue = (Get-Content -Raw -LiteralPath $tunnelPidFile).Trim()
    if ([int]::TryParse($storedValue, [ref]$storedProcessId)) {
      try {
        $storedProcess = Get-Process -Id $storedProcessId -ErrorAction Stop
        if ([string]$storedProcess.Path -ieq $cloudflaredPath) {
          return $storedProcess
        }
      } catch {}
    }
  }

  $processes = @(Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Where-Object {
    [string]$_.Path -ieq $cloudflaredPath
  })
  if ($processes.Count -eq 1) {
    Set-Content -LiteralPath $tunnelPidFile -Value $processes[0].Id
    return $processes[0]
  }

  return $null
}

function Get-TunnelUrl {
  foreach ($path in @($urlFile, $tunnelErrorLog, $tunnelOutLog)) {
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }

    $content = Get-Content -Raw -LiteralPath $path -ErrorAction SilentlyContinue
    $urlMatch = [regex]::Match([string]$content, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($urlMatch.Success) {
      return $urlMatch.Value
    }
  }

  return $null
}

function Stop-ProjectPreview {
  $listenerProcessId = Get-ListenerProcessId -ListenPort $Port
  if ($null -eq $listenerProcessId) {
    return
  }

  if (-not (Test-IsProjectPreview -ProcessId $listenerProcessId)) {
    throw "Port $Port is occupied by PID $listenerProcessId, which is not this project's Vite preview."
  }

  Stop-Process -Id $listenerProcessId
  Wait-Process -Id $listenerProcessId -Timeout 10 -ErrorAction SilentlyContinue
}

function Install-Cloudflared {
  if (Test-Path -LiteralPath $cloudflaredPath) {
    return
  }

  $downloadPath = "$cloudflaredPath.download"
  Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue

  Write-Host "Downloading the portable Cloudflare Tunnel client..."
  Invoke-WebRequest `
    -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
    -OutFile $downloadPath

  $signature = Get-AuthenticodeSignature -LiteralPath $downloadPath
  if ($signature.Status -ne "Valid" -or
    $null -eq $signature.SignerCertificate -or
    $signature.SignerCertificate.Subject -notmatch "Cloudflare, Inc\.") {
    Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
    throw "The downloaded cloudflared executable did not have a valid Cloudflare signature."
  }

  Move-Item -LiteralPath $downloadPath -Destination $cloudflaredPath -Force
}

function Show-ShareStatus {
  $listenerProcessId = Get-ListenerProcessId -ListenPort $Port
  $tunnelProcess = Get-TunnelProcess
  $tunnelUrl = Get-TunnelUrl

  Write-Host "Local preview: " -NoNewline
  if ($null -ne $listenerProcessId) {
    Write-Host "running (PID $listenerProcessId, $localUrl)"
  } else {
    Write-Host "stopped"
  }

  Write-Host "Cloudflare tunnel: " -NoNewline
  if ($null -ne $tunnelProcess) {
    Write-Host "running (PID $($tunnelProcess.Id))"
  } else {
    Write-Host "stopped"
  }

  if ($null -ne $tunnelUrl) {
    Write-Host "Public URL: $tunnelUrl"
  }

  if ($null -eq $listenerProcessId -or $null -eq $tunnelProcess) {
    exit 1
  }
}

if ($Action -eq "status") {
  Show-ShareStatus
  exit 0
}

if ($Action -eq "stop") {
  $tunnelProcess = Get-TunnelProcess
  if ($null -ne $tunnelProcess) {
    Stop-Process -Id $tunnelProcess.Id
    Wait-Process -Id $tunnelProcess.Id -Timeout 10 -ErrorAction SilentlyContinue
  }

  Stop-ProjectPreview
  Remove-Item -LiteralPath $previewPidFile, $tunnelPidFile, $urlFile -Force -ErrorAction SilentlyContinue
  Write-Host "Local preview and Cloudflare tunnel stopped."
  exit 0
}

Push-Location $repoRoot
try {
  Write-Host "[1/4] Validating assets and building the latest site..."
  & npm.cmd run check
  if ($LASTEXITCODE -ne 0) {
    throw "The production build failed with exit code $LASTEXITCODE."
  }

  Write-Host "[2/4] Restarting the local preview on port $Port..."
  Stop-ProjectPreview
  Remove-Item -LiteralPath $previewOutLog, $previewErrorLog -Force -ErrorAction SilentlyContinue

  $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
  $vitePath = Join-Path $repoRoot "node_modules\vite\bin\vite.js"
  $previewProcess = Start-Process `
    -FilePath $nodePath `
    -ArgumentList @($vitePath, "preview", "--host", "127.0.0.1", "--port", "$Port", "--strictPort") `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $previewOutLog `
    -RedirectStandardError $previewErrorLog `
    -WindowStyle Hidden `
    -PassThru
  Set-Content -LiteralPath $previewPidFile -Value $previewProcess.Id

  $previewReady = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($previewProcess.HasExited) {
      break
    }

    try {
      $localResponse = Invoke-WebRequest -UseBasicParsing -Uri "$localUrl/" -TimeoutSec 2
      if ($localResponse.StatusCode -eq 200) {
        $previewReady = $true
        break
      }
    } catch {}

    Start-Sleep -Milliseconds 250
  }

  if (-not $previewReady) {
    $previewError = if (Test-Path -LiteralPath $previewErrorLog) {
      (Get-Content -LiteralPath $previewErrorLog -Tail 30) -join [Environment]::NewLine
    } else {
      "No preview error log was produced."
    }
    throw "The local preview did not start.$([Environment]::NewLine)$previewError"
  }

  Write-Host "[3/4] Keeping or starting the Cloudflare tunnel..."
  Install-Cloudflared
  $tunnelProcess = Get-TunnelProcess
  $tunnelUrl = $null

  if ($null -ne $tunnelProcess) {
    $tunnelUrl = Get-TunnelUrl
    Write-Host "Keeping tunnel PID $($tunnelProcess.Id); the public URL will not change."
  } else {
    Remove-Item -LiteralPath $tunnelOutLog, $tunnelErrorLog, $tunnelPidFile, $urlFile -Force -ErrorAction SilentlyContinue
    $tunnelProcess = Start-Process `
      -FilePath $cloudflaredPath `
      -ArgumentList @("tunnel", "--url", $localUrl, "--no-autoupdate") `
      -WorkingDirectory $repoRoot `
      -RedirectStandardOutput $tunnelOutLog `
      -RedirectStandardError $tunnelErrorLog `
      -WindowStyle Hidden `
      -PassThru
    Set-Content -LiteralPath $tunnelPidFile -Value $tunnelProcess.Id

    for ($attempt = 0; $attempt -lt 120; $attempt++) {
      if ($tunnelProcess.HasExited) {
        break
      }

      $tunnelUrl = Get-TunnelUrl
      if ($null -ne $tunnelUrl) {
        break
      }

      Start-Sleep -Milliseconds 500
    }
  }

  if ($null -eq $tunnelUrl) {
    $tunnelError = if (Test-Path -LiteralPath $tunnelErrorLog) {
      (Get-Content -LiteralPath $tunnelErrorLog -Tail 30) -join [Environment]::NewLine
    } else {
      "No tunnel error log was produced."
    }
    throw "Could not determine the public tunnel URL.$([Environment]::NewLine)$tunnelError"
  }

  Set-Content -LiteralPath $tunnelPidFile -Value $tunnelProcess.Id
  Set-Content -LiteralPath $urlFile -Value $tunnelUrl

  Write-Host "[4/4] Checking the latest build through the public URL..."
  $localIndex = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "dist\index.html")
  $bundleMatch = [regex]::Match($localIndex, "/?assets/index-[A-Za-z0-9_-]+\.js")
  $expectedBundle = if ($bundleMatch.Success) { $bundleMatch.Value } else { $null }
  $publicReady = $false

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      $cacheBuster = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      $publicResponse = Invoke-WebRequest -UseBasicParsing -Uri "$tunnelUrl/?share_update=$cacheBuster" -TimeoutSec 15
      if ($publicResponse.StatusCode -eq 200 -and
        ($null -eq $expectedBundle -or $publicResponse.Content -match [regex]::Escape($expectedBundle))) {
        $publicReady = $true
        break
      }
    } catch {}

    Start-Sleep -Seconds 1
  }

  if (-not $publicReady) {
    throw "The local build succeeded, but the latest public page could not be verified at $tunnelUrl."
  }

  try {
    Set-Clipboard -Value $tunnelUrl
    $clipboardMessage = " (copied to clipboard)"
  } catch {
    $clipboardMessage = ""
  }

  Write-Host ""
  Write-Host "Updated successfully."
  Write-Host "Public URL: $tunnelUrl$clipboardMessage"
  Write-Host "The URL stays the same while tunnel PID $($tunnelProcess.Id) remains running."
} finally {
  Pop-Location
}
