#!/bin/bash
# Setup script for Amazon Linux 2023 EC2 server - Run this once on your EC2 instance

set -e

echo "=== MoneyBots API - EC2 Setup Script (Amazon Linux 2023) ==="

# Update system
echo "Updating system packages..."
sudo dnf update -y

# Install required packages
echo "Installing required packages..."
# Note: curl-minimal is pre-installed on Amazon Linux 2023, skip curl
sudo dnf install -y unzip git

# Install Bun
echo "Installing Bun..."
curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH for current session
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Add Bun to PATH permanently in .bashrc
if ! grep -q "BUN_INSTALL" ~/.bashrc; then
  echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
  echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
  echo "Added Bun to PATH in ~/.bashrc"
fi

# Verify Bun installation
echo "Bun version:"
bun --version

# Create apps directory if it doesn't exist
mkdir -p $HOME/apps

# Clone repository (if not already cloned)
if [ ! -d "$HOME/apps/moneybotsapi-js" ]; then
  echo "Cloning repository..."
  cd $HOME/apps
  git clone https://github.com/nsvirk/moneybotsapi-js.git
  cd moneybotsapi-js
else
  echo "Repository already exists, pulling latest changes..."
  cd $HOME/apps/moneybotsapi-js
  git pull origin main
fi

# Install dependencies
echo "Installing dependencies..."
bun install

# Create .env file from .env.example if it doesn't exist
if [ ! -f .env ]; then
  echo "Creating .env file from .env.example..."
  cp .env.example .env
  echo "✓ .env file created"
  echo "⚠️  Please edit .env file with your configuration"
else
  echo ".env file already exists"
fi

# Setup systemd service
echo "Setting up systemd service..."

# Update paths in service file for current user
USER=$(whoami)
sed -i "s|User=ec2-user|User=$USER|g" moneybotsapi.service
sed -i "s|/home/ec2-user/apps/moneybotsapi-js|$HOME/apps/moneybotsapi-js|g" moneybotsapi.service

# Copy service file to systemd directory
sudo cp moneybotsapi.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable moneybotsapi.service

# Start the service
sudo systemctl start moneybotsapi.service

# Check service status
echo ""
echo "=== API Service Status ==="
sudo systemctl status moneybotsapi.service --no-pager

# Setup Caddy Server
echo ""
echo "Setting up Caddy Server..."

# Install Caddy (if not already installed)
if ! command -v caddy &> /dev/null; then
  echo "Installing Caddy..."
  sudo dnf install -y 'dnf-command(copr)'
  sudo dnf copr enable -y @caddy/caddy
  sudo dnf install -y caddy
else
  echo "Caddy already installed"
fi

# Create Caddy log directory
sudo mkdir -p /var/log/caddy
sudo chown -R caddy:caddy /var/log/caddy
sudo chmod 755 /var/log/caddy

# Display instructions for Caddyfile configuration
echo ""
echo "IMPORTANT: You need to manually add the API configuration to your existing Caddyfile"
echo "See DEPLOYMENT.md for detailed configuration"
echo ""
echo "Configuration to add to /etc/caddy/Caddyfile:"
echo "  api.moneybots.app {"
echo "      reverse_proxy localhost:3000"
echo "  }"
echo ""
echo "After adding the configuration:"
echo "  sudo nano /etc/caddy/Caddyfile"
echo "  sudo caddy validate --config /etc/caddy/Caddyfile"
echo "  sudo systemctl reload caddy"
echo ""

# Enable Caddy service (don't restart if it's already running with your config)
sudo systemctl enable caddy

# Check Caddy status
echo "=== Caddy Service Status ==="
sudo systemctl status caddy --no-pager || echo "Caddy not running (expected if you haven't configured it yet)"

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "API Service Commands:"
echo "  - View API logs: sudo journalctl -u moneybotsapi.service -f"
echo "  - Restart API: sudo systemctl restart moneybotsapi.service"
echo "  - Check API status: sudo systemctl status moneybotsapi.service"
echo ""
echo "Caddy Server Commands:"
echo "  - View Caddy logs: sudo journalctl -u caddy -f"
echo "  - Restart Caddy: sudo systemctl restart caddy"
echo "  - Check Caddy status: sudo systemctl status caddy"
echo "  - Reload Caddyfile: sudo systemctl reload caddy"
echo "  - View access logs: sudo tail -f /var/log/caddy/moneybotsapi-access.log"
echo ""
echo "Don't forget to:"
echo "1. Edit .env file with your configuration"
echo "2. Configure Security Group to allow ports 80 and 443 (HTTP/HTTPS)"
echo "3. Add api.moneybots.app configuration to /etc/caddy/Caddyfile"
echo "4. Ensure DNS A record for api.moneybots.app points to this EC2 IP"
echo "5. Set up GitHub Actions secrets in your repository"
echo ""
echo "Installation directory: ~/apps/moneybotsapi-js"
echo ""
echo "After Caddyfile configuration, your API will be accessible at:"
echo "  - https://api.moneybots.app (with automatic SSL)"
echo "  - Direct API runs on localhost:3000 (not publicly exposed)"
echo ""
echo "Note: Reload your shell or run 'source ~/.bashrc' to update PATH"
