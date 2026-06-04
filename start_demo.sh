set -e

GO_BIN="${GO_BIN:-/usr/local/go/bin/go}"
DB_USER="${DB_USER:-reza}"
DB_PASSWORD="${DB_PASSWORD:-1234}"
WSL_IP="$(hostname -I | awk '{print $1}')"

for session in sp1 sp2 sp3 ls1 ls2 ls3
do
    tmux kill-session -t "$session" >/dev/null 2>&1 || true
done

if ! pg_isready -h localhost >/dev/null 2>&1; then
    echo "PostgreSQL is not running."
    echo "Start it first:"
    echo "sudo systemctl start postgresql"
    exit 1
fi

echo "[1/5] Starting SP1..."

tmux new-session -d -s sp1 "
cd services/storage-provider-go &&
export DATABASE_URL='postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/upspa1?sslmode=disable' &&
export SP_ID=1 &&
export PORT=8081 &&
${GO_BIN} run ./cmd/sp
"

echo "[2/5] Starting SP2..."

tmux new-session -d -s sp2 "
cd services/storage-provider-go &&
export DATABASE_URL='postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/upspa2?sslmode=disable' &&
export SP_ID=2 &&
export PORT=8082 &&
${GO_BIN} run ./cmd/sp
"

echo "[3/5] Starting SP3..."

tmux new-session -d -s sp3 "
cd services/storage-provider-go &&
export DATABASE_URL='postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/upspa3?sslmode=disable' &&
export SP_ID=3 &&
export PORT=8083 &&
${GO_BIN} run ./cmd/sp
"

echo "[4/5] Starting Login Server 1..."

tmux new-session -d -s ls1 "
cd demo/light-login-server &&
PORT=3000 node server.mjs
"

echo "[5/5] Starting Login Server 2..."

tmux new-session -d -s ls2 "
cd demo/light-login-server &&
PORT=3001 node server.mjs
"

echo "[6/5] Starting Login Server 3..."

tmux new-session -d -s ls3 "
cd demo/light-login-server &&
PORT=3002 node server.mjs
"

sleep 3

echo
echo "Checking health..."

curl -s http://localhost:8081/v1/health || true
echo
curl -s http://localhost:8082/v1/health || true
echo
curl -s http://localhost:8083/v1/health || true
echo

echo
echo "Running tmux sessions:"
tmux ls

echo
echo "Login servers:"
echo "  http://localhost:3000"
echo "  http://localhost:3001"
echo "  http://localhost:3002"

echo
echo "Storage Providers:"
echo "  http://localhost:8081"
echo "  http://localhost:8082"
echo "  http://localhost:8083"

echo
echo "Storage Providers for Chrome on Windows:"
echo "  http://${WSL_IP}:8081"
echo "  http://${WSL_IP}:8082"
echo "  http://${WSL_IP}:8083"

echo
echo "Done."
