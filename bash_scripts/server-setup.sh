#!/bin/bash

# Update and install essential packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y net-tools psmisc git build-essential python3 wget unzip

# Install NVM and Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
source ~/.bashrc
nvm install 18.17.0
nvm alias default 18.17.0
nvm use

# Install Node.js from Nodesource (in case needed as fallback)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install and update global npm
sudo npm install -g npm@10.8.2

# Install pnpm
sudo npm install -g pnpm

# Install PM2
sudo npm install -g pm2

# Setup SSH key (modify email as needed)
ssh-keygen -t rsa -b 4096 -C "sayemmh@gmail.com"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_rsa

# Clone the GitHub repository and setup project
git clone git@github.com:sayemmh/flexbone-altair.git
cd flexbone-altair/
pnpm install
pnpm run dev

# Create environment file
touch .env
vim .env

# Install ngrok for tunneling
wget https://bin.equinox.io/c/4VmDzA7iaHb/ngrok-stable-linux-amd64.zip
unzip ngrok-stable-linux-amd64.zip
sudo mv ngrok /usr/local/bin

# Install and configure Pagekite for tunneling
sudo apt-get install -y pagekite
pagekite 5004 flexbone.pagekite.me &

# Start the application with PM2
pm2 start app.js --name flexbone-altair
pm2 logs flexbone-altair
pm2 save
pm2 startup

# Miscellaneous utilities
sudo lsof -i:5004
ls -ltr
touch .env
vim .env
