#!/bin/bash

EMAIL="deenxconsultancy.com"
APP_DOMAIN="app.deenxconsultancy.com"
API_DOMAIN="api.deenxconsultancy.com"

echo "🔒 Getting SSL certificates..."

docker compose up -d nginx

docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  -d $APP_DOMAIN \
  -d $API_DOMAIN

echo "✅ SSL done!"
echo "🔄 Restarting nginx..."
docker compose restart nginx
echo "✅ Complete!"