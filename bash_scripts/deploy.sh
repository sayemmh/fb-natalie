#!/bin/bash
echo "Pulling latest code..."
git pull origin main

echo "Installing dependencies..."
pnpm install

echo "Restarting app..."
pm2 stop flexbone-altair || true
pm2 delete flexbone-altair || true
pm2 start app.js --name flexbone-altair
pm2 save

echo "Done!"