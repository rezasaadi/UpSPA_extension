#!/usr/bin/env bash
set -e

echo "[1/6] Stopping SP servers..."
pkill -f upspa-sp || true
pkill -f "/cmd/sp" || true

echo "[2/6] Stopping login servers..."
pkill -f server.mjs || true

echo "[3/6] Clearing PostgreSQL databases..."

for db in upspa1 upspa2 upspa3
do
  echo "Resetting database: $db"

  psql -U reza -h localhost -d "$db" <<EOF
TRUNCATE TABLE setup RESTART IDENTITY CASCADE;
TRUNCATE TABLE records RESTART IDENTITY CASCADE;
EOF

done

echo "[4/6] Removing extension test state (manual step)"
echo "Remove/reload extension from chrome://extensions"

echo "[5/6] Checking ports..."

for port in 3000 3001 3002 8081 8082 8083
do
  if ss -tulpn | grep -q ":$port "; then
    echo "WARNING: Port $port still in use"
  else
    echo "OK: Port $port is free"
  fi
done

echo "[6/6] Demo state fully reset."