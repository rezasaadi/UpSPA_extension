set -euo pipefail
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script with sudo: sudo bash scripts/oracle/open_ports_ufw.sh" >&2
  exit 1
fi
apt-get update
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 3000/tcp
ufw allow 3001/tcp
ufw allow 3002/tcp
ufw allow 8081/tcp
ufw allow 8082/tcp
ufw allow 8083/tcp
ufw --force enable
ufw status verbose
