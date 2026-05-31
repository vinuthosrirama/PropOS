#!/bin/bash
# PropOS deploy to Railway — double-click this file to deploy
set -e
cd "$(dirname "$0")"
echo "🚀 Logging into Railway..."
railway login
echo "⬆️  Deploying to Railway..."
railway up --detach
echo "✅ Deploy triggered! Check https://propos.addvantage.site in ~2 minutes."
