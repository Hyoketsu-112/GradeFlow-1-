# 🚀 Deploying GradeFlow to Vercel

This guide walks you through deploying GradeFlow (a PWA for grade management) to Vercel's global platform.

## Prerequisites

- GitHub account (repository already exists)
- Vercel account (free at https://vercel.com)

## Step-by-Step Deployment

### 1. Sign Up / Log In to Vercel

1. Go to https://vercel.com
2. Sign up or log in with your GitHub account
3. Authorize Vercel to access your GitHub repositories

### 2. Import Project

1. Click **"Add New"** → **"Project"**
2. Under "Import Git Repository," find and select **GradeFlow-1-** (or your repo name)
3. Click **"Import"**

### 3. Configure Project

**Framework Preset:** None (or Static)

**Root Directory:** Leave as `.` (current directory)

**Build Command:** Leave empty (we don't have a build step for static files)

**Output Directory:** Leave empty

**Environment Variables:** None needed (this is a client-side only app)

### 4. Deploy

1. Click **"Deploy"**
2. Vercel will automatically build and deploy your project
3. You'll get a live URL in ~30 seconds

### 5. Configure Custom Domain (Optional)

In your Vercel project dashboard:

1. Go to **Settings** → **Domains**
2. Click **"Add"** to add your custom domain
3. Follow instructions to update DNS records

### 6. Set as Production Domain

Once verified:

1. Go to **Dashboard** → Your GradeFlow project
2. Click **Settings** → **Domains**
3. Select your custom domain and mark as production

## What's Configured

The `vercel.json` file includes:

✅ **SPA Routing** - All requests redirect to `/index.html` for client-side routing
✅ **Cache Headers** - Optimized caching for static assets:

- Service Worker (`sw.js`): No cache (always fresh)
- HTML files: 1 hour cache with revalidation
- CSS/JS files: 1 year cache (immutable versions)
- Images: 1 year cache (SVG/ICO)

✅ **PWA Support** - Proper cache-control for service worker and manifest

## Advantages of Vercel

- ✅ **Automatic deployments** - Push to main branch auto-deploys instantly
- ✅ **Zero-config** - Works out of the box for static sites like GradeFlow
- ✅ **Fast CDN** - Global edge network with 35+ data centers
- ✅ **Free tier** - Generous free plan suitable for schools and institutions
- ✅ **Git integration** - Seamless GitHub integration with automatic previews
- ✅ **Preview deployments** - Auto-creates preview URLs for every pull request
- ✅ **Analytics** - Built-in performance metrics and traffic monitoring
- ✅ **Rollbacks** - One-click rollback to previous versions if needed
- ✅ **SSL/HTTPS** - Free SSL certificates on all deployments
- ✅ **Edge Functions** - Serverless functions at the edge (for future enhancements)

## Continuous Deployment

After setup, deployment is automatic:

1. Push to `main` branch → Auto-deploys to production
2. Push to other branches → Creates preview deployments
3. Open PR → Preview URL auto-generated

## Pre-Deployment Checklist

- ✅ All files committed to git
- ✅ `.gitignore` properly configured (deployment files excluded)
- ✅ `vercel.json` configuration deployed
- ✅ API keys/secrets not committed (used only client-side here)
- ✅ Service worker properly configured

## Rollback Instructions

If you need to revert to a previous deployment:

1. Go to Vercel Dashboard → GradeFlow project
2. Click **Deployments** tab
3. Find the previous working deployment
4. Click the **...** menu
5. Select **"Promote to Production"**

## Environment Variables (If Needed Later)

If you need to add environment variables:

1. Go to **Settings** → **Environment Variables**
2. Add your variables
3. Click **"Redeploy"** to apply
4. New deployment will have the variables

## Troubleshooting

**Blank page or 404 errors?**

- Clear browser cache (Cmd+Shift+Delete)
- Clear service worker: Open DevTools → Application → Service Workers → Unregister
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

**Styles not loading?**

- Check that CSS file paths are correct in HTML
- Verify `style-professional-dashboard.css` is in root directory
- Check browser console for 404 errors

**Service worker not updating?**

- The `vercel.json` sets `sw.js` to `max-age=0` forcing browser to check for updates
- Clear cache and refresh
- Service workers can be tricky; check DevTools Application tab

## Monitoring

After deployment:

1. Check Vercel dashboard for any build errors
2. Test the app in browser
3. Verify service worker registration (DevTools → Application)
4. Check that offline mode works (DevTools → Network → Offline)

## Next Steps

1. Point your domain to Vercel
2. Set up monitoring/alerting if needed
3. Configure CI/CD checks (optional)
4. Share live URL with users

---

**Questions?** Check Vercel docs: https://vercel.com/docs
