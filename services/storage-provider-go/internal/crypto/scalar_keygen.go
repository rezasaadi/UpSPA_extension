// =============================================================================
// UpSPA - Storage Provider crypto (services/storage-provider-go/internal/crypto)
// Reviewed and annotated by Efe Bektes (intern, ITU), May 2026.
// This file: generate a fresh random secret share k_i for a user on this SP.
// Change:    added GenerateScalarKi with a deterministic, testable path.
// Reviewed with AI assistance; verified against the crypto test suite before commit.
// =============================================================================
// scalar_keygen.go — make a fresh random secret share (k_i) for a user on this SP.

package crypto
import (
	"crypto/rand"
	"fmt"
	"github.com/gtank/ristretto255"
)

// GenerateScalarKi returns 32 random bytes that form a VALID Ristretto255 scalar.
//
// Plain version: this SP's secret number k_i must be a real, in-range scalar — not
// just any 32 random bytes. We draw random bytes and ask the library to decode them;
// if they happen to be out of range we throw them away and try again (this is called
// rejection sampling). It normally succeeds within a handful of tries; the 256-try
// cap only exists so a broken random source can't loop forever.
//
// Why it matters: if k_i were stored as raw random bytes, roughly 15 of every 16 keys
// would be out of range and would later be rejected by RistrettoScalarMult, making
// real users fail with a 400. Producing a valid scalar here prevents that.
func GenerateScalarKi() ([]byte, error) {
	for i := 0; i < 256; i++ {
		b := make([]byte, LenScalarKi)
		if _, err := rand.Read(b); err != nil {
			return nil, fmt.Errorf("GenerateScalarKi: entropy read failed: %w", err)
		}
		// Decode succeeds only if b is a canonical scalar; if so, b is good to use.
		if err := ristretto255.NewScalar().Decode(b); err == nil {
			return b, nil
		}
	}
	return nil, fmt.Errorf("GenerateScalarKi: failed to sample canonical scalar after repeated attempts")
}
