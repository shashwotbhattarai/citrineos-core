# SPDX-FileCopyrightText: 2025 Yatri Motorcycles

# SPDX-License-Identifier: Apache-2.0

#!/usr/bin/env bash
# Copies nginx.conf to the active nginx site config and restarts nginx.
# Run on EC2 host (Ubuntu) as root or with sudo.
# Usage: sudo ./reload.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NGINX_CONF="$SCRIPT_DIR/nginx.conf"
SITE_CONF="/etc/nginx/sites-available/citrineos"

if [ ! -f "$NGINX_CONF" ]; then
    echo "ERROR: $NGINX_CONF not found"
    exit 1
fi

echo "--- Copying nginx.conf to $SITE_CONF ---"
cp "$NGINX_CONF" "$SITE_CONF"

echo "--- Testing nginx configuration ---"
nginx -t

echo "--- Restarting nginx ---"
systemctl restart nginx

echo "--- Done ---"
echo "Verify: curl -i http://$(hostname -I | awk '{print $1}'):8093/"
