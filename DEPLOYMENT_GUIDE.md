# Deployment Guide: Vercel + Railway + Neon

## ✅ All Issues Fixed!

### Fixed Issues:
1. **Railway Backend**: Removed client build from backend deployment
2. **Vercel Frontend**: Fixed all ESLint errors (unused variables, React hooks dependencies, equality operators)

---

## 🚀 Deployment Steps

### 1️⃣ NEON DATABASE (Do First)

1. Go to https://console.neon.tech
2. Create project: "The Health Shop Inventory"
3. Copy connection string and change `neondb` to `the_health_shop_inventory`:
   ```
   postgresql://user:pass@ep-xxx.region.aws.neon.tech/the_health_shop_inventory?sslmode=require
   ```
4. In Neon SQL Editor, paste and run `server/database/schema.sql`
5. Verify tables created: users, locations, inventory, transfers, sales

---

### 2️⃣ RAILWAY BACKEND

#### Deploy:
1. Go to https://railway.app
2. New Project → Deploy from GitHub repo
3. Select your repository
4. Railway auto-detects and deploys

#### Environment Variables (Railway Dashboard → Variables):
```
DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/the_health_shop_inventory?sslmode=require
JWT_SECRET=472486691bda1d3627246a425fdb4402c84a4a20c1e3307029cbf4a6db4873e1e465e7f3c6cc93beef5d0f4743b6f9166bf31effdc7c040b041a537dd1150565
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://your-app.vercel.app
```

#### Get Railway URL:
- After deployment: `https://your-app.railway.app`
- Copy this for Vercel setup

---

### 3️⃣ VERCEL FRONTEND

#### Deploy:
1. Go to https://vercel.com
2. New Project → Import from GitHub
3. Configure:
   - **Framework**: Create React App
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `build`

#### Environment Variables (Vercel → Settings → Environment Variables):
```
REACT_APP_API_URL=https://your-railway-app.railway.app/api
```
(Replace with your actual Railway URL)

#### Redeploy:
- Go to Deployments → Click "Redeploy" to apply env variables

---

### 4️⃣ UPDATE RAILWAY CORS

After getting Vercel URL, update Railway environment variable:
```
FRONTEND_URL=https://your-actual-app.vercel.app
```

Push changes to GitHub → Railway auto-redeploys

---

## 🎯 Initial Setup

### Login:
- Open: `https://your-app.vercel.app`
- Username: `admin`
- Password: `admin123`

### Create Locations (Neon SQL Editor):
```sql
-- 2 Warehouses
INSERT INTO locations (name, type, address, contact_number) VALUES
('Main Warehouse', 'warehouse', 'Main Address', '123-456-7890'),
('Secondary Warehouse', 'warehouse', 'Secondary Address', '123-456-7891');

-- 28 Branches (example - customize as needed)
INSERT INTO locations (name, type, address, contact_number) VALUES
('Branch 1', 'branch', 'Branch 1 Address', '123-456-7892'),
('Branch 2', 'branch', 'Branch 2 Address', '123-456-7893'),
('Branch 3', 'branch', 'Branch 3 Address', '123-456-7894');
-- ... add remaining 25 branches
```

---

## 📋 Deployment Checklist

- [ ] Neon database created and schema loaded
- [ ] Railway backend deployed with all env variables
- [ ] Railway URL copied
- [ ] Vercel frontend deployed with Railway API URL
- [ ] CORS configured in Railway with Vercel URL
- [ ] Admin login works
- [ ] Locations created (2 warehouses + 28 branches)
- [ ] Test: Add inventory, create transfer, record sale

---

## 🔧 Troubleshooting

**Railway Build Fails:**
- Check that `railway.json` exists
- Verify `package.json` build script doesn't build client

**Vercel Build Fails:**
- All ESLint errors are now fixed
- Check that `REACT_APP_API_URL` is set

**CORS Errors:**
- Verify `FRONTEND_URL` in Railway matches your Vercel URL exactly
- Include `https://` in the URL

**Database Connection Fails:**
- Verify `DATABASE_URL` in Railway is correct
- Ensure `?sslmode=require` is at the end
- Check database name is `the_health_shop_inventory`

---

## 🎉 You're Done!

Your app is now live:
- **Frontend**: https://your-app.vercel.app
- **Backend**: https://your-app.railway.app
- **Database**: Managed at console.neon.tech
