package crypto
import (
	"crypto/ed25519"
	"fmt"
)
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
	return ed25519.Verify(ed25519.PublicKey(sigPk), msg, sig)
}
