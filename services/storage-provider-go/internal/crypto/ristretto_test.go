package crypto_test
import (
	"bytes"
	"crypto/rand"
	"errors"
	"testing"
	"github.com/gtank/ristretto255"
	"upspa/internal/crypto"
)
func validRistrettoPoint() []byte {
	return ristretto255.NewGeneratorElement().Encode(make([]byte, 0, 32))
}
func TestRistrettoScalarMult_ValidInputs(t *testing.T) {
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		t.Fatal(err)
	}
	k[31] &= 0x0f
	point := validRistrettoPoint()
	y, err := crypto.RistrettoScalarMult(k, point)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(y) != 32 {
		t.Errorf("expected 32-byte output, got %d", len(y))
	}
}
func TestRistrettoScalarMult_Deterministic(t *testing.T) {
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		t.Fatal(err)
	}
	k[31] &= 0x0f
	point := validRistrettoPoint()
	y1, err := crypto.RistrettoScalarMult(k, point)
	if err != nil {
		t.Fatal(err)
	}
	y2, err := crypto.RistrettoScalarMult(k, point)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(y1, y2) {
		t.Error("RistrettoScalarMult is not deterministic")
	}
}
func TestRistrettoScalarMult_DifferentKeys_DifferentOutputs(t *testing.T) {
	k1 := make([]byte, 32)
	k2 := make([]byte, 32)
	k1[0] = 1
	k2[0] = 2
	point := validRistrettoPoint()
	y1, err := crypto.RistrettoScalarMult(k1, point)
	if err != nil {
		t.Fatal(err)
	}
	y2, err := crypto.RistrettoScalarMult(k2, point)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(y1, y2) {
		t.Error("different scalars should produce different outputs")
	}
}
func TestRistrettoScalarMult_OneTimesG_RoundTrip(t *testing.T) {
	one := make([]byte, 32)
	one[0] = 1
	g := validRistrettoPoint()
	y, err := crypto.RistrettoScalarMult(one, g)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bytes.Equal(y, g) {
		t.Errorf("1*G should equal G\n got: %x\nwant: %x", y, g)
	}
}
func TestRistrettoScalarMult_InvalidPoint(t *testing.T) {
	k := make([]byte, 32)
	k[0] = 1
	badPoint := bytes.Repeat([]byte{0xFF}, 32)
	_, err := crypto.RistrettoScalarMult(k, badPoint)
	if err == nil {
		t.Fatal("expected error for invalid Ristretto point")
	}
	if !errors.Is(err, crypto.ErrInvalidPoint) {
		t.Errorf("want ErrInvalidPoint, got %v", err)
	}
}
func TestRistrettoScalarMult_InvalidScalar(t *testing.T) {
	badScalar := bytes.Repeat([]byte{0xFF}, 32)
	_, err := crypto.RistrettoScalarMult(badScalar, validRistrettoPoint())
	if err == nil {
		t.Fatal("expected error for non-canonical scalar")
	}
	if !errors.Is(err, crypto.ErrInvalidScalar) {
		t.Errorf("want ErrInvalidScalar, got %v", err)
	}
}
func TestRistrettoScalarMult_WrongScalarLength(t *testing.T) {
	_, err := crypto.RistrettoScalarMult(make([]byte, 16), validRistrettoPoint())
	if !errors.Is(err, crypto.ErrWrongLength) {
		t.Errorf("want ErrWrongLength for short scalar, got %v", err)
	}
}
func TestRistrettoScalarMult_WrongPointLength(t *testing.T) {
	k := make([]byte, 32)
	k[0] = 1
	_, err := crypto.RistrettoScalarMult(k, make([]byte, 16))
	if !errors.Is(err, crypto.ErrWrongLength) {
		t.Errorf("want ErrWrongLength for short point, got %v", err)
	}
}
func TestRistrettoScalarMult_IdentityPoint_IsValid(t *testing.T) {
	k := make([]byte, 32)
	k[0] = 1
	identity := make([]byte, 32)
	_, err := crypto.RistrettoScalarMult(k, identity)
	if errors.Is(err, crypto.ErrInvalidPoint) {
		t.Error("all-zeros is the Ristretto255 identity point and must be accepted")
	}
}
