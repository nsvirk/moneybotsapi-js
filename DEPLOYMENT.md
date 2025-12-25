# Deployment Guide - AWS EC2 (Amazon Linux 2023) with Caddy

This guide explains how to deploy the MoneyBots API to AWS EC2 using Caddy as a reverse proxy with automatic deployment via GitHub Actions.

## Architecture

- **Bun API**: Runs on `localhost:3000` (not publicly exposed)
- **Caddy Server**: Reverse proxy on port `80/443` (public-facing)
- **Automatic HTTPS**: Caddy handles SSL certificates via Let's Encrypt
- **Auto Deployment**: GitHub Actions deploys on push to main branch

## Prerequisites

1. AWS EC2 instance running Amazon Linux 2023
2. GitHub repository
3. SSH access to EC2 instance
4. (Optional) Domain name pointed to EC2 for automatic HTTPS

## Initial Setup on EC2

### 1. Connect to your EC2 instance

```bash
ssh -i your-key.pem ec2-user@your-ec2-public-ip
```

### 2. Run the setup script

```bash
# Create apps directory and clone the repository
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/nsvirk/moneybotsapi-js.git
cd moneybotsapi-js

# Make setup script executable
chmod +x scripts/setup-ec2.sh

# Run setup script
./scripts/setup-ec2.sh
```

This script will:
- Install Bun runtime
- Install Caddy server
- Clone/update the repository
- Install dependencies
- Create systemd services (API + Caddy)
- Start both services

### 3. Configure environment variables

The setup script automatically creates `.env` from `.env.example`. Edit it with your configuration:

```bash
cd ~/apps/moneybotsapi-js
nano .env
```

Configure your environment variables:
```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Add other required environment variables as needed
```

**Important:** Bun automatically loads `.env` file - no additional configuration needed.

Restart the service after updating .env:
```bash
sudo systemctl restart moneybotsapi.service
```

### 4. Configure Caddyfile (Add to your existing Caddyfile)

**Important:** You already have a Caddyfile on your EC2 server. Add this configuration to your existing `/etc/caddy/Caddyfile`:

#### Configuration for api.moneybots.app
```caddy
api.moneybots.app {
    # Reverse proxy to Bun API running on localhost:3000
    reverse_proxy localhost:3000

    # Caddy automatically handles SSL certificates via Let's Encrypt

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000;"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
    }

    # Access logging
    log {
        output file /var/log/caddy/moneybotsapi-access.log
        format json
    }

    # Error logging (optional)
    log {
        output file /var/log/caddy/moneybotsapi-error.log
        level ERROR
    }
}
```

**Steps to configure:**
```bash
# Edit your Caddyfile
sudo nano /etc/caddy/Caddyfile

# Validate syntax
sudo caddy validate --config /etc/caddy/Caddyfile

# Reload Caddy (zero downtime)
sudo systemctl reload caddy
```

**DNS Requirements:**
- Ensure `api.moneybots.app` DNS A record points to your EC2 public IP
- Caddy will automatically obtain and renew SSL certificates from Let's Encrypt

**Note:**
- The `Caddyfile` in this repository (`~/apps/moneybotsapi-js/Caddyfile`) is just a reference
- Your actual Caddyfile is at `/etc/caddy/Caddyfile` on EC2

### 5. Configure Security Group

Allow HTTP/HTTPS traffic via AWS Console:

1. Go to EC2 Dashboard → Security Groups
2. Select your instance's security group
3. Add inbound rules:

| Type | Protocol | Port Range | Source | Description |
|------|----------|------------|--------|-------------|
| HTTP | TCP | 80 | 0.0.0.0/0 | HTTP access |
| HTTPS | TCP | 443 | 0.0.0.0/0 | HTTPS access (for SSL) |

Alternatively, use AWS CLI:
```bash
# Allow HTTP (port 80)
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

# Allow HTTPS (port 443)
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0
```

**Note:** Port 3000 should NOT be publicly accessible - the API runs on localhost only.

## GitHub Actions Setup

### 1. Generate SSH key for GitHub Actions

On your EC2 instance:

```bash
# Generate SSH key (if you don't have one already)
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github-actions -N ""

# Add the public key to authorized_keys
cat ~/.ssh/github-actions.pub >> ~/.ssh/authorized_keys

# Display the private key (you'll need this for GitHub secrets)
cat ~/.ssh/github-actions
```

### 2. Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add the following secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `EC2_HOST` | Your EC2 public IP or domain | Example: `54.123.45.67` |
| `EC2_USERNAME` | SSH username | `ec2-user` for Amazon Linux 2023 |
| `EC2_SSH_KEY` | Private key content | Content from `~/.ssh/github-actions` |
| `EC2_PORT` | SSH port | Usually `22` |

### 3. Grant sudo permissions for service restart

On EC2, allow your user to restart the service without password:

```bash
sudo visudo
```

Add this line at the end:
```
ec2-user ALL=(ALL) NOPASSWD: /bin/systemctl restart moneybotsapi.service, /bin/systemctl status moneybotsapi.service, /bin/systemctl status caddy
```

Replace `ec2-user` with your actual username if different.

**Note:** We only need status permission for Caddy since you'll manage the Caddyfile manually.

### 4. Test the deployment

Push to main branch:

```bash
git add .
git commit -m "Setup deployment"
git push origin main
```

The GitHub Actions workflow will:
1. Connect to EC2 via SSH
2. Pull latest code
3. Install dependencies
4. Restart the service
5. Display service status

Monitor the deployment in GitHub → Actions tab.

## Service Management Commands

### API Service Logs
```bash
# Follow live API logs
sudo journalctl -u moneybotsapi.service -f

# View last 100 lines
sudo journalctl -u moneybotsapi.service -n 100

# View logs since boot
sudo journalctl -u moneybotsapi.service -b
```

### Caddy Server Logs
```bash
# Follow live Caddy logs
sudo journalctl -u caddy -f

# View access logs
sudo tail -f /var/log/caddy/moneybotsapi-access.log

# View error logs
sudo tail -f /var/log/caddy/moneybotsapi-error.log
```

### API Service Control
```bash
# Start API service
sudo systemctl start moneybotsapi.service

# Stop API service
sudo systemctl stop moneybotsapi.service

# Restart API service
sudo systemctl restart moneybotsapi.service

# Check API status
sudo systemctl status moneybotsapi.service
```

### Caddy Server Control
```bash
# Start Caddy
sudo systemctl start caddy

# Stop Caddy
sudo systemctl stop caddy

# Restart Caddy
sudo systemctl restart caddy

# Reload Caddy config (no downtime)
sudo systemctl reload caddy

# Check Caddy status
sudo systemctl status caddy

# Validate Caddyfile syntax
sudo caddy validate --config /etc/caddy/Caddyfile
```

### Manual deployment
```bash
cd ~/apps/moneybotsapi-js
git pull origin main
bun install
sudo systemctl restart moneybotsapi.service

# Only if you made changes to Caddyfile:
# sudo nano /etc/caddy/Caddyfile
# sudo systemctl reload caddy
```

## Troubleshooting

### API Service not starting

Check logs:
```bash
sudo journalctl -u moneybotsapi.service -n 50
```

Common issues:
- `.env` file missing or incorrect
- Port 3000 already in use
- Bun not in PATH (check ExecStart path in service file)
- File permissions

### Caddy not working

Check logs:
```bash
sudo journalctl -u caddy -n 50
```

Validate configuration:
```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

Common issues:
- Caddyfile syntax errors
- Port 80/443 already in use
- Security Group not allowing ports 80/443
- Domain DNS not pointing to EC2 IP (if using domain)

### Can't access API from browser

1. Check API is running:
```bash
curl http://localhost:3000/health
```

2. Check Caddy is running:
```bash
sudo systemctl status caddy
```

3. Check from outside:
```bash
curl http://YOUR-EC2-IP/health
```

4. Verify Security Group allows port 80/443

5. Check Caddy logs for errors:
```bash
sudo tail -f /var/log/caddy/moneybotsapi-error.log
```

### GitHub Actions deployment failing

Check:
1. GitHub secrets are correctly set
2. SSH key has correct permissions on EC2
3. User has sudo permissions for systemctl
4. Repository exists on EC2
5. Check Actions logs in GitHub for detailed error

### Port issues

Check if port 3000 is in use:
```bash
sudo lsof -i :3000
```

Change port in .env and service file if needed.

## Production Recommendations

1. **✅ Use a reverse proxy** - Already configured with Caddy
2. **✅ Enable HTTPS** - Caddy handles this automatically with a domain
3. **Use a custom domain** - Point your domain to EC2 and update Caddyfile
4. **Set up monitoring** (CloudWatch, Datadog, etc.)
5. **Configure log rotation** for Caddy logs:
   ```bash
   sudo nano /etc/logrotate.d/caddy
   ```
   Add:
   ```
   /var/log/caddy/*.log {
       daily
       rotate 14
       compress
       delaycompress
       missingok
       notifempty
   }
   ```
6. **Set up automated backups** for data
7. **Use AWS Secrets Manager** for sensitive environment variables
8. **Configure health checks** and auto-restart policies
9. **Set up alerts** for service failures (CloudWatch Alarms)
10. **Enable rate limiting** in Caddyfile:
    ```caddy
    rate_limit {
        zone dynamic_zone {
            key {remote_host}
            events 100
            window 1m
        }
    }
    ```

## Security Notes

- ✅ **Reverse proxy configured** - API not directly exposed (localhost only)
- ✅ **HTTPS ready** - Caddy auto-configures SSL with domain
- Keep SSH key secure (GitHub secrets are encrypted)
- Restrict security group rules to necessary IPs if possible
- Regularly update system packages:
  ```bash
  sudo dnf update -y
  ```
- Use AWS IAM roles where possible
- Enable CloudWatch logging
- Keep .env file secure and never commit it
- Consider adding Caddy security headers (already configured)
- Monitor Caddy access logs for suspicious activity

## Accessing Your API

After deployment, your API will be available at:

- **Production URL**: `https://api.moneybots.app` (with automatic HTTPS via Let's Encrypt)
- **Direct EC2 IP**: `http://YOUR-EC2-IP` (HTTP only, if Caddyfile configured)

Example API calls:
```bash
# Health check
curl https://api.moneybots.app/health

# Query instruments
curl "https://api.moneybots.app/instruments/query?name=NIFTY&segment=NFO-OPT&expiry=2025-12-30"

# Register user
curl -X POST https://api.moneybots.app/user/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "user_id=ABC123&password=secret&totp_secret=BASE32SECRET&hash_key=yourhashkey"

# Login
curl -X POST https://api.moneybots.app/user/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "user_id=ABC123&password=secret&totp_secret=BASE32SECRET"

# Generate TOTP
curl -X POST https://api.moneybots.app/user/totp \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "totp_secret=BASE32SECRET"

# Logout
curl -X DELETE https://api.moneybots.app/user/logout \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "user_id=ABC123"

# Refresh instruments data
curl -X POST https://api.moneybots.app/instruments/refresh
```

**Important DNS Setup:**
- Ensure `api.moneybots.app` DNS A record points to your EC2 public IP address
- Caddy will automatically obtain and renew SSL certificates from Let's Encrypt
- Initial SSL certificate generation may take a few seconds on first request
