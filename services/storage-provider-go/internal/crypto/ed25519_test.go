package crypto_test
import (
	"crypto/ed25519"
	"crypto/rand"
	"testing"
	"upspa/internal/crypto"
)
func TestVerifyEd25519_ValidSig(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	msg := []byte("test message for ed25519")
	sig := ed25519.Sign(priv, msg)
	if !crypto.VerifyEd25519(pub, msg, sig) {
		t.Error("expected valid signature to pass verification")
	}
}
func TestVerifyEd25519_InvalidSig(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	msg := []byte("test message")
	sig := make([]byte, 64)
	if crypto.VerifyEd25519(pub, msg, sig) {
		t.Error("expected all-zero signature to fail verification")
	}
}
func TestVerifyEd25519_TamperedMessage(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	sig := ed25519.Sign(priv, []byte("original"))
	if crypto.VerifyEd25519(pub, []byte("tampered"), sig) {
		t.Error("expected tampered message to fail verification")
	}
}
func TestVerifyEd25519_WrongPublicKey(t *testing.T) {
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	wrongPub, _, _ := ed25519.GenerateKey(rand.Reader)
	msg := []byte("test message")
	sig := ed25519.Sign(priv, msg)
	if crypto.VerifyEd25519(wrongPub, msg, sig) {
		t.Error("expected wrong public key to fail verification")
	}
}
func TestVerifyEd25519_PanicsOnWrongPkLength(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic for wrong sigPk length")
		}
	}()
	crypto.VerifyEd25519(make([]byte, 16), []byte("msg"), make([]byte, 64))
}
func TestVerifyEd25519_PanicsOnWrongSigLength(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic for wrong sig length")
		}
	}()
	crypto.VerifyEd25519(make([]byte, 32), []byte("msg"), make([]byte, 32))
}
