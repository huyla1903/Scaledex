<#
@title        Scaledex - upload images release
@version      0.1.1
@author       La Gia Huy
@since        2026-11-15
@updated      2026-11-15
@engine       Windows PowerShell 5.1
@target       Windows; GitHub CLI (gh) logged in to the repo's account
@about        Zips data/images/ and uploads it as images.zip to the GitHub Release
              tagged "images". The GitHub Pages workflow downloads that zip, so the
              web app serves its own copies instead of linking to bandai.co.jp.
              The images stay out of git history. Run it after
              scraper/build_data.py has downloaded new images; it then starts the
              Pages workflow.
              Usage:  powershell -ExecutionPolicy Bypass -File tools\upload_images.ps1
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$images = Join-Path $root "data\images"
if (-not (Test-Path $images)) { Write-Error "data\images not found - run scraper\build_data.py first." }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Write-Error "GitHub CLI (gh) is not on PATH." }

$tmp = Join-Path $env:TEMP "scaledex-upload"
New-Item -ItemType Directory -Force $tmp | Out-Null
$zip = Join-Path $tmp "images.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Write-Host "Zipping $images ..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
# entries are relative to data\images (figures/..., products/..., trim/...)
[System.IO.Compression.ZipFile]::CreateFromDirectory($images, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "images.zip: $mb MB"

Push-Location $root
$ErrorActionPreference = "Continue"  # gh writes progress to stderr; PS 5.1 would treat it as an error
try {
    $null = gh release view images 2>$null
    if ($LASTEXITCODE -ne 0) {
        gh release create images --prerelease --title "Image data for the web app (not a release)" --notes "images.zip = data/images/ for the GitHub Pages site and the Obsidian plugin's online images. Uploaded by tools/upload_images.ps1; not a software release. Figure and product images (c) Bandai / Pokemon." $zip
    } else {
        gh release upload images $zip --clobber
    }
    if ($LASTEXITCODE -ne 0) { Write-Error "gh failed." }
    Write-Host "Uploaded. Starting the Pages workflow to publish them ..."
    gh workflow run pages.yml
} finally { Pop-Location }
