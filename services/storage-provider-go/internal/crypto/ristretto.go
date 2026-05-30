// =============================================================================
// UpSPA - Storage Provider crypto (services/storage-provider-go/internal/crypto)
// Reviewed and annotated by Efe Bektes (intern, ITU), May 2026.
// This file: the SP TOPRF evaluate step, y = k_i * blinded, over ristretto255.
// Change:    rewritten to use ristretto255 consistently; key share decoded canonically (SetCanonicalBytes), not clamped.
// Reviewed with AI assistance; verified against the crypto test suite before commit.
// =============================================================================
// ristretto.go — the heart of the SP: multiply a client's point by this SP's secret
// share (the TOPRF "evaluate" step). The SP never sees the password, only points.

package crypto

import (
	"errors"
	"fmt"

	"github.com/gtank/ristretto255"
)

// ErrInvalidPoint is returned when the 32-byte "blinded" value is not a real point.
var ErrInvalidPoint = errors.New("invalid_ristretto_point")

// ErrInvalidScalar is returned when the stored secret share is not a valid scalar.
var ErrInvalidScalar = errors.New("invalid_ristretto_scalar")

// RistrettoScalarMult computes y = k * blinded on the Ristretto255 curve.
//
// Plain version: the client hides ("blinds") its password as a point on a curve and
// sends it here. Each SP multiplies that point by its own secret number k and sends
// the result back. The client later combines the results from several SPs to finish
// the calculation. Because the input is blinded, the SP learns nothing about the
// password; and because k never leaves the SP, the client can't finish alone.
//
// Anything malformed is refused up front: k and blinded must each be 32 bytes, k must
// be a canonical scalar (a number in the allowed range), and blinded must be a real
// curve point. Each failure returns a specific error so the API can answer HTTP 400.
func RistrettoScalarMult(k []byte, blinded []byte) (y []byte, err error) {
	// Length gate: both values are fixed-size 32-byte encodings.
	if len(k) != LenScalarKi {
		return nil, fmt.Errorf("%w: scalar k must be %d bytes, got %d",
			ErrWrongLength, LenScalarKi, len(k))
	}
	if len(blinded) != LenRistretto {
		return nil, fmt.Errorf("%w: blinded point must be %d bytes, got %d",
			ErrWrongLength, LenRistretto, len(blinded))
	}
	// Turn the 32 bytes into a scalar; Decode rejects out-of-range (non-canonical) values.
	scalar := ristretto255.NewScalar()
	if err := scalar.Decode(k); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidScalar, err)
	}
	// Turn the 32 bytes into a curve point; Decode rejects invalid encodings.
	point := ristretto255.NewElement()
	if err := point.Decode(blinded); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidPoint, err)
	}
	// The actual multiplication, then encode the resulting point back to 32 bytes.
	result := ristretto255.NewElement().ScalarMult(scalar, point)
	return result.Encode(make([]byte, 0, LenRistretto)), nil
}
