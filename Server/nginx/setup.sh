#!/usr/bin/env bash
# CitrineOS Nginx + Let's Encrypt Setup Script
# Run on EC2 host (Ubuntu) as root or with sudo
# Domain: test.yatri-energy-core.yatrimotorcycle.com

set -euo pipefail

DOMAIN="test.yatri-energy-core.yatrimotorcycle.com"
EMAIL="shashwot@yatrimotorcycle.com"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== CitrineOS Nginx + SSL Setup ==="
echo "Domain: $DOMAIN"
echo ""

# 1. Install nginx and certbot
echo "--- Installing nginx and certbot ---"
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

# 2. Stop nginx temporarily for standalone cert issuance
echo "--- Stopping nginx for certificate issuance ---"
systemctl stop nginx || true

# 3. Create webroot directory for ACME challenges
mkdir -p /var/www/certbot

# 4. Obtain Let's Encrypt certificate (standalone mode)
echo "--- Obtaining Let's Encrypt certificate ---"
certbot certonly --standalone \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL"

# 5. Copy nginx config
echo "--- Installing nginx configuration ---"
cp "$SCRIPT_DIR/nginx.conf" /etc/nginx/sites-available/citrineos
ln -sf /etc/nginx/sites-available/citrineos /etc/nginx/sites-enabled/citrineos
rm -f /etc/nginx/sites-enabled/default

# 6. Test nginx config
echo "--- Testing nginx configuration ---"
nginx -t

# 7. Start and enable nginx
echo "--- Starting nginx ---"
systemctl enable nginx
systemctl start nginx

# 8. Set up certbot auto-renewal cron
echo "--- Setting up auto-renewal ---"
(crontab -l 2>/dev/null | grep -v certbot; echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | crontab -

# 9. Restart Docker containers (port bindings changed to 127.0.0.1 only)
echo "--- Restarting Docker containers (127.0.0.1 port bindings) ---"
if [ -f "$SCRIPT_DIR/../docker-compose.yml" ]; then
    cd "$SCRIPT_DIR/.."
    docker compose down && docker compose up -d
    echo "Docker containers restarted with loopback-only port bindings."
else
    echo "WARNING: docker-compose.yml not found. Restart Docker containers manually:"
    echo "  cd /path/to/Server && docker compose down && docker compose up -d"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Verify with:"
echo "  curl https://$DOMAIN/health"
echo "  wscat -c wss://$DOMAIN:8092/ocpp/yatri-1-ioc-1-sec1 -s ocpp1.6"
echo ""
echo "EC2 Security Group — ensure these ports are open:"
echo "  80, 443, 8090, 8092, 8093, 8094, 15672"
