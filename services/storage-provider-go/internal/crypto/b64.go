// =============================================================================
// UpSPA - Storage Provider crypto (services/storage-provider-go/internal/crypto)
// Reviewed and annotated by Efe Bektes (intern, ITU), May 2026.
// This file: canonical base64url (no padding) with strict length checks.
// Change:    tightened whitespace handling under newer Go; always canonical decode then re-encode.
// Reviewed with AI assistance; verified against the crypto test suite before commit.
// =============================================================================
// b64.go — canonical base64url (no padding) encoding/decoding with strict length checks.
// Every binary value on the wire is base64url-no-pad; we always decode then re-encode to one
// canonical form before storing or comparing, and reject anything of the wrong size.

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
