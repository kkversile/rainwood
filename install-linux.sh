#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend" && npm install && npx prisma generate
cd ../frontend && npm install
echo 'Installation completed. Configure .env files and PostgreSQL, then run each app separately.'
