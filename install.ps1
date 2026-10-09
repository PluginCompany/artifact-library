# Install the Artifact Library CLI (artifact.exe) on Windows.
#
#   irm https://raw.githubusercontent.com/plugincompany/artifact-library/main/install.ps1 | iex
#
# Environment:
#   ARTIFACT_VERSION      release to install, e.g. 0.4.0 (default: latest)
#   ARTIFACT_INSTALL_DIR  target directory (default: %LOCALAPPDATA%\Programs\artifact)
#   ARTIFACT_BASE_URL     where the release files live (default: the GitHub release)
# The download is verified against the release's SHA256SUMS before it is installed.
$ErrorActionPreference = 'Stop'
$Repo = 'plugincompany/artifact-library'
$Version = if ($env:ARTIFACT_VERSION) { $env:ARTIFACT_VERSION } else { 'latest' }
$Dest = if ($env:ARTIFACT_INSTALL_DIR) { $env:ARTIFACT_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\artifact' }

$arch = switch ($env:PROCESSOR_ARCHITECTURE) { 'AMD64' { 'x64' } 'ARM64' { 'arm64' } default { throw "Unsupported CPU architecture: $($env:PROCESSOR_ARCHITECTURE)" } }
$asset = "artifact-windows-$arch.exe"
if ($env:ARTIFACT_BASE_URL) { $base = $env:ARTIFACT_BASE_URL.TrimEnd('/') }
elseif ($Version -eq 'latest') { $base = "https://github.com/$Repo/releases/latest/download" }
else { $base = "https://github.com/$Repo/releases/download/v$($Version.TrimStart('v'))" }

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("artifact-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host "Downloading $asset ($Version)..."
  Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS" -OutFile (Join-Path $tmp 'SHA256SUMS')
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile (Join-Path $tmp $asset)
  $line = Get-Content (Join-Path $tmp 'SHA256SUMS') | Where-Object { ($_ -split '\s+')[1] -eq $asset } | Select-Object -First 1
  if (-not $line) { throw "$asset is not listed in SHA256SUMS" }
  $expected = ($line -split '\s+')[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $tmp $asset)).Hash.ToLower()
  if ($expected -ne $actual) { throw "Checksum mismatch for $asset (expected $expected, got $actual)" }

  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  Move-Item -Force (Join-Path $tmp $asset) (Join-Path $Dest 'artifact.exe')
  Write-Host "Installed artifact $(& (Join-Path $Dest 'artifact.exe') --version) to $Dest\artifact.exe (checksum verified)."

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $userPath) { $userPath = '' }
  if (-not (($userPath -split ';') -contains $Dest)) {
    $newPath = if ($userPath) { $userPath.TrimEnd(';') + ';' + $Dest } else { $Dest }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host "Added $Dest to your user PATH. Open a new terminal to use 'artifact'."
  }
  Write-Host ''
  Write-Host 'Next steps:'
  Write-Host '  artifact config set server http://localhost:3000   # your Artifact Library server'
  Write-Host '  artifact doctor'
  Write-Host '  artifact skill install --agent claude              # or opencode, codex'
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
