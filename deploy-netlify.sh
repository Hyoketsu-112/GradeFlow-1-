#!/bin/bash
# One-Click Netlify Deployment Script for GradeFlow
# This script automates the Netlify deployment process

echo "🚀 GradeFlow Netlify Deployment Setup"
echo "======================================"
echo ""

# Check if user is logged into Netlify CLI
if ! command -v netlify &> /dev/null; then
    echo "❌ Netlify CLI not installed"
    echo ""
    echo "Install it with:"
    echo "  npm install -g netlify-cli"
    echo ""
    echo "Then run this script again"
    exit 1
fi

echo "✅ Netlify CLI found"
echo ""

# Check if netlify.toml exists
if [ ! -f "netlify.toml" ]; then
    echo "❌ netlify.toml not found in current directory"
    exit 1
fi

echo "✅ netlify.toml configured"
echo ""

# Deploy to Netlify
echo "Starting deployment to Netlify..."
echo ""

netlify deploy --prod --dir=.

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ DEPLOYMENT SUCCESSFUL!"
    echo ""
    echo "Your site is now live on Netlify"
    echo "Check your deployment at: https://app.netlify.com"
else
    echo ""
    echo "❌ Deployment failed"
    echo ""
    echo "Manual deployment:"
    echo "1. Go to https://app.netlify.com/start"
    echo "2. Connect your GitHub repository"
    echo "3. Netlify will auto-detect your netlify.toml settings"
    exit 1
fi
