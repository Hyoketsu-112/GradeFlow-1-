# One-Click Netlify Deployment Script for GradeFlow (Windows/PowerShell)
# This script automates the Netlify deployment process

Write-Host "🚀 GradeFlow Netlify Deployment Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if netlify CLI is installed
$netlifyExe = Get-Command netlify -ErrorAction SilentlyContinue

if (-not $netlifyExe) {
    Write-Host "❌ Netlify CLI not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install it with:" -ForegroundColor Yellow
    Write-Host "  npm install -g netlify-cli" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Then run this script again" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Netlify CLI found" -ForegroundColor Green
Write-Host ""

# Check if netlify.toml exists
if (-not (Test-Path "netlify.toml")) {
    Write-Host "❌ netlify.toml not found in current directory" -ForegroundColor Red
    exit 1
}

Write-Host "✅ netlify.toml configured" -ForegroundColor Green
Write-Host ""

# Check if .git exists
if (-not (Test-Path ".git")) {
    Write-Host "⚠️  Warning: Not a git repository" -ForegroundColor Yellow
    Write-Host "Run: git init && git add . && git commit -m 'Initial commit'" -ForegroundColor Gray
    Write-Host ""
}

# Deploy to Netlify
Write-Host "Starting deployment to Netlify..." -ForegroundColor Cyan
Write-Host ""

netlify deploy --prod --dir=.

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your site is now live on Netlify" -ForegroundColor Green
    Write-Host "Check your deployment at: https://app.netlify.com" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "❌ Deployment failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual deployment:" -ForegroundColor Yellow
    Write-Host "1. Go to https://app.netlify.com/start" -ForegroundColor Gray
    Write-Host "2. Connect your GitHub repository" -ForegroundColor Gray
    Write-Host "3. Netlify will auto-detect your netlify.toml settings" -ForegroundColor Gray
    exit 1
}
