# GradeFlow Netlify Deployment Guide

Your GradeFlow PWA is ready to deploy on Netlify! Follow these steps:

## Step 1: Connect to Netlify

1. Go to [netlify.com](https://netlify.com)
2. Sign in with your GitHub account (or create one)
3. Click **"Add new site"** → **"Import an existing project"**
4. Select **GitHub** as your provider
5. Authorize Netlify to access your GitHub repositories
6. Choose the **`Hyoketsu-112/GradeFlow-1-`** repository

## Step 2: Configure Build Settings

Netlify will auto-detect your settings. Confirm these are correct:

- **Build command**: (leave empty - static site)
- **Publish directory**: `.` (root directory)
- **Environment variables**: None needed

Click **Deploy site**

## Step 3: Automatic Deployments

Your site will now automatically deploy whenever you push to the `main` branch. 

Netlify will provide you with:
- A free `.netlify.app` subdomain (e.g., `gradeflow-xyz.netlify.app`)
- HTTPS certificate (automatic)
- CDN distribution globally
- Continuous deployment from GitHub

## Configuration Details

The `netlify.toml` file includes:
- **SPA routing**: All routes redirect to `index.html` for client-side routing
- **PWA support**: Service worker (`sw.js`) not cached (always fresh)
- **Asset caching**: CSS/JS/SVG/ICO cached for 1 year (immutable)
- **HTML caching**: Cached for 1 hour (must revalidate)
- **Manifest support**: Proper headers for `manifest.json`

## Custom Domain (Optional)

Once deployed:
1. Go to your Netlify site settings
2. Click **"Domain management"**
3. **"Add custom domain"**
4. Enter your domain (e.g., `gradeflow.app`)
5. Follow DNS setup instructions

## Troubleshooting

**Site shows 404 errors?**
- SPA routing is configured in `netlify.toml` - should work automatically

**Service worker not updating?**
- Netlify is configured to not cache `sw.js` - browsers always fetch fresh version

**Assets loading slowly?**
- Check Netlify's CDN status in site analytics

## Need Help?

- [Netlify Docs](https://docs.netlify.com)
- [PWA Deployment Guide](https://docs.netlify.com/configure-builds/file-based-configuration/)
