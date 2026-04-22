#!/bin/bash
# Script to update Railway environment variables
# Make sure you have Railway CLI installed: npm i -g @railway/cli
# And you're logged in: railway login

echo "Updating Railway environment variables..."

railway variables set DATABASE_URL="postgresql://postgres.fmfoasrdsgotytodyzwk:Happyilshin6203*@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
railway variables set DATABASE_SSL="true"
railway variables set NODE_ENV="production"

echo "✓ Environment variables updated!"
echo "Railway will automatically redeploy with the new configuration."
