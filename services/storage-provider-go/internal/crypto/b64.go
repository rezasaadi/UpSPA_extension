// TODO(UPSPA-SP): Implement this file.
// - Read: docs/apis.md and docs/openapi/sp.yaml (wire contract)
// - Enforce: base64url-no-pad canonicalization + fixed-length checks
// - Never log secrets (uid/suid/cid/cj/k_i/signatures/points)
// Ownership: Efe (intern/efe/...)


package crypto

import (
	"encoding/base64"
	"errors"
	"fmt"
)

var ErrInvalidBase64 = errors.New("invalid_base64")
var ErrWrongLength = errors.New("wrong_byte_length")
var enc = base64.RawURLEncoding
func CanonicalB64(s string) (canon string, raw []byte, err error) {
	raw, err = enc.DecodeString(s)
	if err != nil {
		// Fallback: try standard base64url with padding.
		raw, err = base64.URLEncoding.DecodeString(s)
		if err != nil {
			return "", nil, fmt.Errorf("%w: %w", ErrInvalidBase64, err)
		}
	}
	canon = enc.EncodeToString(raw)
	return canon, raw, nil
}
func EncodeB64(raw []byte) string {
	return enc.EncodeToString(raw)
}

func DecodeFixedB64(s string, n int) (raw []byte, canon string, err error) {
	canon, raw, err = CanonicalB64(s)
	if err != nil {
		return nil, "", err
	}
	if n >= 0 && len(raw) != n {
		return nil, "", fmt.Errorf("%w: want %d bytes, got %d", ErrWrongLength, n, len(raw))
	}
	return raw, canon, nil
}
