#!/bin/bash
set -e

echo '=== OQ Deploy ==='
git pull
echo 'Building...'
docker compose build --no-cache
echo 'Starting...'
docker compose up -d
echo 'Waiting for health check...'
sleep 3
curl -sf http://localhost:3100/health && echo ' ✅ Health OK' || echo ' ❌ Health FAIL'
echo '=== Done ==='
