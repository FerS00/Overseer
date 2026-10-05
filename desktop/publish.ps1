<#
.SYNOPSIS
  Builds a portable, self-contained Overseer.Desktop.exe (no .NET installation needed on the target machine).

.EXAMPLE
  ./publish.ps1                      # win-x64 into desktop/dist
  ./publish.ps1 -Runtime win-arm64   # Windows on ARM
  ./publish.ps1 -Output C:\Tools\Overseer -SkipTests
#>
[CmdletBinding()]
param(
  [ValidateSet('win-x64', 'win-arm64', 'win-x86')]
  [string] $Runtime = 'win-x64',
  [string] $Output = (Join-Path $PSScriptRoot 'dist'),
  [string] $Configuration = 'Release',
  [switch] $SkipTests
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  throw 'The .NET 8 SDK is required: https://dotnet.microsoft.com/download/dotnet/8.0'
}

if (-not $SkipTests) {
  Write-Host 'Running tests...' -ForegroundColor Cyan
  dotnet test tests/Overseer.Desktop.Core.Tests -c $Configuration --nologo
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed; nothing was published.' }
}

Write-Host "Publishing $Runtime to $Output..." -ForegroundColor Cyan
dotnet publish src/Overseer.Desktop -c $Configuration -r $Runtime --self-contained true `
  -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true `
  -p:EnableCompressionInSingleFile=true `
  -p:DebugType=embedded `
  -o $Output --nologo
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed.' }

$exe = Join-Path $Output 'Overseer.Desktop.exe'
if (-not (Test-Path $exe)) { throw "Expected $exe was not produced." }
$size = [math]::Round((Get-Item $exe).Length / 1MB, 1)
Write-Host "Done: $exe ($size MB)" -ForegroundColor Green
Write-Host 'Copy that single file anywhere and run it. Settings live in %APPDATA%\Overseer\desktop.json.'
