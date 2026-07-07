set -euo pipefail
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script with sudo: sudo bash scripts/oracle/install_vm_dependencies.sh" >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates git curl wget unzip build-essential pkg-config tmux gnupg lsb-release
install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  > /etc/apt/sources.list.d/docker.list
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nodejs golang-go
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
  usermod -aG docker "${SUDO_USER}"
fi
echo
echo "Installed versions:"
git --version
curl --version | head -n 1
wget --version | head -n 1
docker --version
docker compose version
node --version
npm --version
go version
if [[ -x "${HOME}/.cargo/bin/rustc" ]]; then
  "${HOME}/.cargo/bin/rustc" --version
elif [[ -x "/home/${SUDO_USER:-}/.cargo/bin/rustc" ]]; then
  "/home/${SUDO_USER}/.cargo/bin/rustc" --version
else
  rustc --version || true
fi
echo
echo "If this user was newly added to the docker group, log out and back in before running docker without sudo."
