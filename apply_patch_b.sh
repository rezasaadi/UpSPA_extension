set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -f go.mod ]] || ! grep -q '^module upspa$' go.mod; then
  echo "ERROR: run this from services/storage-provider-go/ (where go.mod lives)" >&2
  exit 1
fi
FILES=(
  internal/crypto/b64_test.go
  internal/crypto/ed25519_test.go
  internal/crypto/pwd_update_sigmsg_test.go
  internal/crypto/scalar_keygen_test.go
  internal/crypto/fuzz_test.go
  internal/crypto/negative_test.go
  internal/crypto/ristretto_test.go
)
for f in "${FILES[@]}"; do
  if [[ -f "$f" ]]; then
    sed -i \
      -e 's#github.com/your-org/sp/internal/crypto#upspa/internal/crypto#g' \
      -e 's#github.com/rezasaadi/UpSPA_FPB/services/storage-provider-go/internal/crypto#upspa/internal/crypto#g' \
      "$f"
    echo "patched: $f"
  fi
done
echo
echo "Done. Verifying tests build:"
go vet ./internal/crypto/... && echo "  go vet OK"
echo "Run: go test ./internal/crypto/..."
