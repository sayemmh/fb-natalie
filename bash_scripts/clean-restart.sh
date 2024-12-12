#!/bin/bash
echo "Pulling latest code..."
git pull origin main

pm2 stop flexbone-altair || true
pm2 start app.js --name flexbone-altair