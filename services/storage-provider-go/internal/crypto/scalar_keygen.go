package crypto
import (
	"crypto/rand"
	"fmt"
	"github.com/gtank/ristretto255"
)
func GenerateScalarKi() ([]byte, error) {
	for i := 0; i < 256; i++ {
		b := make([]byte, LenScalarKi)
		if _, err := rand.Read(b); err != nil {
			return nil, fmt.Errorf("GenerateScalarKi: entropy read failed: %w", err)
		}
		if err := ristretto255.NewScalar().Decode(b); err == nil {
			return b, nil
		}
	}
	return nil, fmt.Errorf("GenerateScalarKi: failed to sample canonical scalar after repeated attempts")
}
