// =============================================================================
// UpSPA - Storage Provider crypto (services/storage-provider-go/internal/crypto)
// Reviewed and annotated by Efe Bektes (intern, ITU), May 2026.
// This file: the fixed on-the-wire byte lengths, defined in one place.
// Change:    comments/annotations only.
// Reviewed with AI assistance; verified against the crypto test suite before commit.
// =============================================================================
// constants.go — the fixed byte-lengths used across the SP, kept in one place so a
// layout change is a single edit and the compiler finds every use.

package crypto

// Fixed sizes (in bytes) of the values that travel over the wire. Inputs that do not
// match these lengths are rejected (the API answers HTTP 400).
const (
	LenEd25519PublicKey = 32 // Ed25519 public key
	LenEd25519Signature = 64 // Ed25519 signature
	LenCtBlobNonce      = 24 // nonce of an encrypted blob
	LenCtBlobTag        = 16 // authentication tag of an encrypted blob
	LenRistretto        = 32 // a Ristretto255 point (encoded)
	LenScalarKi         = 32 // a scalar: the secret share k_i
)

// Sizes specific to the password-update signature message.
const (
	LenTimestamp = 8 // timestamp, little-endian uint64
	LenSpID      = 4 // SP id, little-endian uint32

	// Total length of the signature message when the ciphertext part is empty:
	// 24 + 16 + 32 + 8 + 4 = 84 bytes.
	PwdUpdateSigMsgFixedLen = LenCtBlobNonce + LenCtBlobTag + LenScalarKi + LenTimestamp + LenSpID
)
