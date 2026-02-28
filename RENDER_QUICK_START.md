# Render Quick Start Guide

## 🚀 Deploy in 5 Minutes

### 1. Sign Up
- Go to https://render.com
- Sign up with GitHub

### 2. Create Web Service
- Click **"New +"** → **"Web Service"**
- Select your repository
- Click **"Connect"**

### 3. Configure
```
Name: health-shop-api
Region: Singapore (or closest to you)
Branch: main
Build Command: npm install
Start Command: npm start
Plan: Free
```

### 4. Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

```env
DATABASE_URL=your-neon-connection-string
JWT_SECRET=your-random-secret-key
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://your-frontend.vercel.app
```

**Get Neon Connection String:**
1. Go to Neon Dashboard
2. Copy connection string
3. Should look like: `postgresql://user:pass@host/db?sslmode=require`

**Generate JWT_SECRET:**
- Use: https://randomkeygen.com/
- Or: `openssl rand -base64 32`

### 5. Deploy
- Click **"Create Web Service"**
- Wait 2-5 minutes
- Get your URL: `https://health-shop-api.onrender.com`

### 6. Update Frontend
In Vercel:
- Settings → Environment Variables
- Update `REACT_APP_API_URL` to your Render URL
- Redeploy

### 7. Test
```bash
curl https://health-shop-api.onrender.com/api/health
```

Should return: `{"status":"ok"}`

---

## ⚠️ Important Notes

### Free Tier Spin-Down
- Service sleeps after 15 min of inactivity
- First request takes ~30 seconds to wake up
- Upgrade to $7/month to prevent spin-down

### CORS Setup
Make sure `CORS_ORIGIN` matches your Vercel URL exactly:
- ✅ `https://your-app.vercel.app`
- ❌ `https://your-app.vercel.app/` (no trailing slash)

### Database Connection
- Neon connection string must include `?sslmode=require`
- Test connection in Neon dashboard first

---

## 📊 Your Stack

```
Frontend:  Vercel  → https://your-app.vercel.app
Backend:   Render  → https://health-shop-api.onrender.com
Database:  Neon    → PostgreSQL (serverless)
```

---

## 🔧 Troubleshooting

**"Application failed to respond"**
→ Check logs in Render dashboard

**CORS errors**
→ Verify CORS_ORIGIN env var matches Vercel URL

**Database errors**
→ Check DATABASE_URL includes `?sslmode=require`

**JWT errors**
→ Make sure JWT_SECRET is set

---

## 📝 After Deployment Checklist

- [ ] Backend deployed to Render
- [ ] Health check endpoint works
- [ ] Frontend updated with Render URL
- [ ] Test login functionality
- [ ] Test all CRUD operations
- [ ] Check logs for errors
- [ ] Monitor first few requests

---

## 💰 Cost

**Free Tier:**
- Backend: Free (with spin-down)
- Frontend: Free (Vercel)
- Database: Free (Neon - 0.5 GB)

**Total: $0/month**

**Upgrade Options:**
- Render Starter: $7/month (no spin-down)
- Neon Pro: $19/month (more storage)
- Vercel Pro: $20/month (more bandwidth)

---

## 🎯 Next Steps

1. Deploy to Render (follow steps above)
2. Test all features
3. Monitor for 24 hours
4. Consider upgrading if spin-down is annoying
5. Set up custom domain (optional)

---

## 📚 Full Documentation

See `RENDER_DEPLOYMENT_GUIDE.md` for detailed instructions.
