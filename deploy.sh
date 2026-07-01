#!/bin/bash
set -e

echo "🚀 Deploying..."

git pull origin main

docker compose down

docker compose build --no-cache

docker compose up -d

echo "⏳ Waiting 15 seconds..."
sleep 15

if curl -f http://localhost:8000/api/v1/ping > /dev/null 2>&1; then
    echo "✅ Backend healthy"
else
    echo "❌ Backend failed — check logs:"
    docker compose logs backend --tail=50
    exit 1
fi

echo "✅ Done!"