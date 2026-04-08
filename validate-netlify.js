#!/usr/bin/env node

/**
 * Netlify Configuration Validator for GradeFlow
 * Verifies that all files are in place and configured correctly for Netlify deployment
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 GradeFlow Netlify Deployment Validator\n');

const checks = {
  'netlify.toml exists': () => fs.existsSync('netlify.toml'),
  'netlify.toml has [build] section': () => fs.readFileSync('netlify.toml', 'utf8').includes('[build]'),
  'netlify.toml has SPA redirect': () => fs.readFileSync('netlify.toml', 'utf8').includes('from = "/*"'),
  'netlify.toml has service worker headers': () => fs.readFileSync('netlify.toml', 'utf8').includes('for = "/sw.js"'),
  'index.html exists': () => fs.existsSync('index.html'),
  'index.html is valid HTML': () => fs.readFileSync('index.html', 'utf8').includes('<!doctype html>'),
  'manifest.json exists': () => fs.existsSync('manifest.json'),
  'manifest.json is valid JSON': () => {
    try {
      JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
      return true;
    } catch {
      return false;
    }
  },
  'sw.js (service worker) exists': () => fs.existsSync('sw.js'),
  'style.css exists': () => fs.existsSync('style.css'),
  'script.js exists': () => fs.existsSync('script.js'),
  'NETLIFY_DEPLOYMENT.md exists': () => fs.existsSync('NETLIFY_DEPLOYMENT.md'),
  '.git directory exists': () => fs.existsSync('.git'),
};

let passed = 0;
let failed = 0;

for (const [check, fn] of Object.entries(checks)) {
  const result = fn();
  const symbol = result ? '✅' : '❌';
  console.log(`${symbol} ${check}`);
  if (result) passed++;
  else failed++;
}

console.log(`\n📊 Results: ${passed}/${passed + failed} checks passed`);

if (failed === 0) {
  console.log('\n🎉 GradeFlow is READY for Netlify deployment!');
  console.log('\nNext steps:');
  console.log('1. Push to GitHub: git push');
  console.log('2. Go to netlify.com');
  console.log('3. Click "Add new site" → "Import existing project"');
  console.log('4. Select the GradeFlow repository');
  console.log('5. Deploy!');
  process.exit(0);
} else {
  console.log('\n❌ Fix the above issues before deploying');
  process.exit(1);
}
