package crypto_test
import (
	"bytes"
	"testing"
	"upspa/internal/crypto"
)
func TestGenerateScalarKi_Length(t *testing.T) {
	ki, err := crypto.GenerateScalarKi()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ki) != crypto.LenScalarKi {
		t.Errorf("want %d bytes, got %d", crypto.LenScalarKi, len(ki))
	}
}
func TestGenerateScalarKi_IsCanonical(t *testing.T) {
	basePoint := validRistrettoPoint()
	for i := 0; i < 100; i++ {
		ki, err := crypto.GenerateScalarKi()
		if err != nil {
			t.Fatalf("iter %d: GenerateScalarKi error: %v", i, err)
		}
		_, err = crypto.RistrettoScalarMult(ki, basePoint)
		if err != nil {
			t.Fatalf("iter %d: generated k_i rejected by RistrettoScalarMult: %v", i, err)
		}
	}
}
func TestGenerateScalarKi_Unique(t *testing.T) {
	ki1, err1 := crypto.GenerateScalarKi()
	ki2, err2 := crypto.GenerateScalarKi()
	if err1 != nil || err2 != nil {
		t.Fatalf("generation error: %v / %v", err1, err2)
	}
	if bytes.Equal(ki1, ki2) {
		t.Error("two independently generated k_i values are identical (RNG failure?)")
	}
}
func TestGenerateScalarKi_NotAllZeros(t *testing.T) {
	for i := 0; i < 20; i++ {
		ki, _ := crypto.GenerateScalarKi()
		if bytes.Equal(ki, make([]byte, 32)) {
			t.Fatal("generated zero scalar — catastrophic RNG failure")
		}
	}
}
