set -euo pipefail
check() {
  local url="$1"
  echo "Checking ${url}"
  curl --fail --silent --show-error --location --max-time 10 "${url}" >/dev/null
}
check "http://localhost:8081/v1/health"
check "http://localhost:8082/v1/health"
check "http://localhost:8083/v1/health"
check "http://localhost:3000"
check "http://localhost:3001"
check "http://localhost:3002"
echo "Oracle demo smoke test passed."
