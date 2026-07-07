// =============================================================================
// UpSPA - Storage Provider crypto (services/storage-provider-go/internal/crypto)
// Reviewed and annotated by Efe Bektes (intern, ITU), May 2026.
// This file: Ed25519 signature verification used to authorize password updates.
// Change:    comments/annotations only; behaviour unchanged.
// Reviewed with AI assistance; verified against the crypto test suite before commit.
// =============================================================================
// ed25519.go — verifying Ed25519 signatures (used to authorize password updates).

package crypto
import (
	"crypto/ed25519"
	"fmt"
)

// VerifyEd25519 checks that a message really was signed by the owner of a public key.
//
// Plain version: the public key is like a padlock everyone can see; the signature is
// proof that someone used the matching private key (which only the real owner has).
// We return true only if the signature genuinely matches THIS message and THIS key —
// change one byte of the message, or use the wrong key, and it returns false.
//
// The key must be exactly 32 bytes and the signature exactly 64 bytes. If they are
// not, that is a bug in the calling code (it should have length-checked the input
// first), so we stop loudly with a panic rather than quietly return a verdict on
// malformed data. The API callers decode and length-check before calling, and the
// server's recover middleware turns any stray panic into a clean HTTP 500.
func VerifyEd25519(sigPk []byte, msg []byte, sig []byte) bool {
	if len(sigPk) != LenEd25519PublicKey {
		panic(fmt.Sprintf(
			"crypto.VerifyEd25519: sigPk must be %d bytes, got %d",
			LenEd25519PublicKey, len(sigPk),
		))
	}
	if len(sig) != LenEd25519Signature {
		panic(fmt.Sprintf(
			"crypto.VerifyEd25519: sig must be %d bytes, got %d",
			LenEd25519Signature, len(sig),
		))
	}
	// ed25519.Verify does the real cryptographic check, in constant time.
	return ed25519.Verify(ed25519.PublicKey(sigPk), msg, sig)
}
