# Railway Deployment Steps - Supabase Migration

## Problem
Your Railway production environment is still using the old Neon database connection. After migrating to Supabase with the `thehealthshop` schema, you need to update Railway's environment variables.

## Solution

### Method 1: Railway Dashboard (Recommended)

1. **Go to Railway Dashboard**
   - Visit: https://railway.app/
   - Select your project: `health-shop-api-production`

2. **Update Environment Variables**
   - Click on your service
   - Go to the **Variables** tab
   - Add/Update these variables:

   ```env
   DATABASE_URL=postgresql://postgres.fmfoasrdsgotytodyzwk:Happyilshin6203*@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
   DATABASE_SSL=true
   NODE_ENV=production
   JWT_SECRET=your-production-jwt-secret-here
   ```

   **Important Notes:**
   - Keep your existing `JWT_SECRET` if you have one (don't change it or all users will be logged out)
   - If you don't have a `JWT_SECRET`, generate a secure one:
     ```bash
     node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
     ```

3. **Deploy**
   - Railway will automatically redeploy after you save the variables
   - Wait for the deployment to complete (check the **Deployments** tab)

4. **Verify**
   - Check the deployment logs for any errors
   - Test your login at: https://health-shop-api-production.up.railway.app/api/auth/login
   - Check health endpoint: https://health-shop-api-production.up.railway.app/api/health

### Method 2: Railway CLI

If you have Railway CLI installed:

```bash
# Login to Railway
railway login

# Link to your project (if not already linked)
railway link

# Set environment variables
railway variables set DATABASE_URL="postgresql://postgres.fmfoasrdsgotytodyzwk:Happyilshin6203*@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
railway variables set DATABASE_SSL="true"
railway variables set NODE_ENV="production"

# Railway will automatically redeploy
```

Or run the provided script:
```bash
chmod +x update-railway-env.sh
./update-railway-env.sh
```

## How the Schema Configuration Works

The code changes we made to `server/config/database.js` include:

```javascript
options: '-c search_path=thehealthshop,public'
```

This tells PostgreSQL to:
1. Look for tables in the `thehealthshop` schema first
2. Fall back to `public` schema if not found
3. Apply to all queries automatically

**No additional configuration needed** - once Railway redeploys with the new `DATABASE_URL`, it will automatically use the `thehealthshop` schema.

## Troubleshooting

### If deployment fails:

1. **Check Railway Logs**
   - Go to your Railway project
   - Click on **Deployments**
   - View the latest deployment logs
   - Look for database connection errors

2. **Common Issues**

   **Error: "relation does not exist"**
   - Your tables are not in the `thehealthshop` schema
   - Verify in Supabase SQL Editor:
     ```sql
     SELECT table_schema, table_name 
     FROM information_schema.tables 
     WHERE table_schema = 'thehealthshop';
     ```

   **Error: "password authentication failed"**
   - Double-check your `DATABASE_URL` is correct
   - Verify the password doesn't have special characters that need escaping
   - Your password has `*` which might need URL encoding: `%2A`
   - Try this URL instead:
     ```
     postgresql://postgres.fmfoasrdsgotytodyzwk:Happyilshin6203%2A@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
     ```

   **Error: "SSL connection required"**
   - Make sure `DATABASE_SSL=true` is set
   - Or add `?sslmode=require` to your connection string

3. **Test Connection Locally**
   ```bash
   # Test if the connection string works
   psql "postgresql://postgres.fmfoasrdsgotytodyzwk:Happyilshin6203*@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
   
   # Once connected, verify schema:
   \dn
   SET search_path TO thehealthshop;
   \dt
   ```

### If login still fails after deployment:

1. **Check API Health**
   ```bash
   curl https://health-shop-api-production.up.railway.app/api/health
   ```

2. **Check Database Connection**
   - Look at Railway logs for database connection errors
   - Verify Supabase project is active and accessible

3. **Check CORS Settings**
   - Make sure your frontend URL is in the `CORS_ORIGIN` environment variable
   - Example: `CORS_ORIGIN=https://your-frontend.vercel.app`

## Security Recommendations

### 1. Rotate Database Password
Since your database password is now in this document, consider rotating it:
1. Go to Supabase Dashboard → Settings → Database
2. Reset the database password
3. Update the `DATABASE_URL` in Railway with the new password

### 2. Use Railway Secrets
For sensitive values like `JWT_SECRET`, use Railway's built-in secrets management.

### 3. Enable Supabase Connection Pooling
You're already using the pooler (port 5432), which is good for production.

## Post-Deployment Checklist

- [ ] Environment variables updated in Railway
- [ ] Deployment completed successfully
- [ ] Health endpoint responds: `/api/health`
- [ ] Login works
- [ ] Dashboard loads data
- [ ] All API endpoints return data (not 500 errors)
- [ ] Check Railway logs for any warnings
- [ ] Consider rotating database password for security

## Additional Configuration

### Frontend Environment Variables
If your frontend is deployed separately (Vercel, Netlify, etc.), update:

```env
REACT_APP_API_URL=https://health-shop-api-production.up.railway.app
```

### CORS Configuration
Make sure Railway has the frontend URL in `CORS_ORIGIN`:

```env
CORS_ORIGIN=https://your-frontend-domain.com
```

## Need Help?

If you continue to see 500 errors:
1. Share the Railway deployment logs
2. Check the browser console for specific error messages
3. Test individual API endpoints to isolate the issue
