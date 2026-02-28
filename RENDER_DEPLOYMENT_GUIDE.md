# Deploy Backend to Render

## Prerequisites
- GitHub repository with your code
- Neon database (already set up)
- Vercel frontend URL

---

## Step 1: Create Render Account

1. Go to https://render.com
2. Sign up with GitHub
3. Authorize Render to access your repositories

---

## Step 2: Create New Web Service

1. Click **"New +"** button
2. Select **"Web Service"**
3. Connect your GitHub repository
4. Select the repository: `the-health-shop-inventory-system`

---

## Step 3: Configure Service

### Basic Settings:
- **Name**: `health-shop-api` (or any name you prefer)
- **Region**: Choose closest to you (Singapore, Oregon, Frankfurt, etc.)
- **Branch**: `main`
- **Root Directory**: Leave empty (or put `.` if needed)
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### Instance Type:
- Select **"Free"** plan
  - Note: Free tier spins down after 15 minutes of inactivity
  - First request after spin-down takes ~30 seconds

---

## Step 4: Add Environment Variables

Click **"Advanced"** and add these environment variables:

### Required Variables:

1. **DATABASE_URL**
   - Value: Your Neon connection string
   - Format: `postgresql://username:password@host/database?sslmode=require`
   - Get from: Neon Dashboard → Connection String

2. **JWT_SECRET**
   - Value: Generate a random string (or let Render auto-generate)
   - Example: `your-super-secret-jwt-key-change-this-in-production`
   - Or use: https://randomkeygen.com/

3. **PORT**
   - Value: `3000`
   - (Render will override this, but good to have)

4. **NODE_ENV**
   - Value: `production`

5. **CORS_ORIGIN**
   - Value: Your Vercel frontend URL
   - Example: `https://health-shop-inventory.vercel.app`
   - Important: No trailing slash!

### Optional Variables (if you have them):

6. **SESSION_SECRET** (if used)
   - Value: Another random string

---

## Step 5: Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repository
   - Run `npm install`
   - Run `npm start`
   - Deploy your service

3. Wait for deployment (usually 2-5 minutes)
4. You'll get a URL like: `https://health-shop-api.onrender.com`

---

## Step 6: Update Frontend Environment Variables

### In Vercel Dashboard:

1. Go to your Vercel project
2. Settings → Environment Variables
3. Update `REACT_APP_API_URL`:
   - Value: `https://health-shop-api.onrender.com`
   - (Use your actual Render URL)
4. Redeploy frontend

### Or update `.env.production` in client folder:

```env
REACT_APP_API_URL=https://health-shop-api.onrender.com
```

Then commit and push to trigger Vercel redeploy.

---

## Step 7: Test Your Backend

### Health Check:
```bash
curl https://health-shop-api.onrender.com/api/health
```

Should return: `{"status":"ok"}`

### Test Login:
```bash
curl -X POST https://health-shop-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
```

---

## Step 8: Update CORS in Backend (if needed)

If you get CORS errors, update `server/index.js`:

```javascript
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'https://your-frontend.vercel.app',
  credentials: true
};

app.use(cors(corsOptions));
```

---

## Render Free Tier Limitations

### What's Included:
- ✅ 750 hours/month (enough for 1 service running 24/7)
- ✅ Automatic HTTPS
- ✅ Automatic deployments from GitHub
- ✅ Custom domains
- ✅ Environment variables

### Limitations:
- ⚠️ Spins down after 15 minutes of inactivity
- ⚠️ First request after spin-down takes ~30 seconds
- ⚠️ 512 MB RAM
- ⚠️ Shared CPU

### Upgrade to Paid ($7/month):
- No spin-down
- More RAM (512 MB → 2 GB)
- Faster response times

---

## Troubleshooting

### Issue: "Application failed to respond"
**Solution**: Check logs in Render dashboard
- Make sure `npm start` works
- Verify DATABASE_URL is correct
- Check if port is correct

### Issue: CORS errors
**Solution**: 
1. Add your Vercel URL to CORS_ORIGIN env var
2. Make sure no trailing slash in URL
3. Redeploy backend

### Issue: Database connection failed
**Solution**:
1. Verify Neon connection string
2. Make sure it includes `?sslmode=require`
3. Check Neon database is active

### Issue: JWT errors
**Solution**:
1. Make sure JWT_SECRET is set
2. Use the same secret across deployments
3. Don't change it after users log in

---

## Monitoring

### View Logs:
1. Go to Render dashboard
2. Click on your service
3. Click "Logs" tab
4. See real-time logs

### View Metrics:
1. Click "Metrics" tab
2. See CPU, Memory, Request count

---

## Auto-Deploy from GitHub

Render automatically deploys when you push to GitHub:

```bash
git add .
git commit -m "Update backend"
git push origin main
```

Render will:
1. Detect the push
2. Pull latest code
3. Run build command
4. Deploy automatically

---

## Alternative: Manual Deploy

If you don't want auto-deploy:

1. Go to service settings
2. Disable "Auto-Deploy"
3. Click "Manual Deploy" when ready

---

## Cost Comparison

| Platform | Free Tier | Paid Tier |
|----------|-----------|-----------|
| **Render** | Free (with spin-down) | $7/month |
| **Railway** | $5 credit/month | $5+ usage-based |
| **Heroku** | No free tier | $7/month |
| **Fly.io** | 3 VMs free | $1.94/month per VM |

---

## Next Steps After Deployment

1. ✅ Backend deployed to Render
2. ✅ Frontend updated with new API URL
3. ✅ Test login and all features
4. ✅ Monitor logs for errors
5. ✅ Set up custom domain (optional)

---

## Custom Domain (Optional)

### Add Custom Domain:
1. Go to service settings
2. Click "Custom Domains"
3. Add your domain (e.g., `api.yourdomain.com`)
4. Update DNS records as instructed
5. Render provides free SSL

---

## Summary

Your setup will be:
- **Frontend**: Vercel (https://your-app.vercel.app)
- **Backend**: Render (https://health-shop-api.onrender.com)
- **Database**: Neon (PostgreSQL)

All three services work together seamlessly!
