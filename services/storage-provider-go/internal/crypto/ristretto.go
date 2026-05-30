package crypto
import (
	"errors"
	"fmt"

	"github.com/gtank/ristretto255"
)
var ErrInvalidPoint = errors.New("invalid_ristretto_point")
var ErrInvalidScalar = errors.New("invalid_ristretto_scalar")
func RistrettoScalarMult(k []byte, blinded []byte) (y []byte, err error) {
	if len(k) != LenScalarKi {
		return nil, fmt.Errorf("%w: scalar k must be %d bytes, got %d",
			ErrWrongLength, LenScalarKi, len(k))
	}
	if len(blinded) != LenRistretto {
		return nil, fmt.Errorf("%w: blinded point must be %d bytes, got %d",
			ErrWrongLength, LenRistretto, len(blinded))
	}
	scalar := ristretto255.NewScalar()
	if err := scalar.Decode(k); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidScalar, err)
	}
	point := ristretto255.NewElement()
	if err := point.Decode(blinded); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidPoint, err)
	}
	result := ristretto255.NewElement().ScalarMult(scalar, point)
	return result.Encode(make([]byte, 0, LenRistretto)), nil
}
