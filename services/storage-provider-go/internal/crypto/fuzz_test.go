package crypto_test
import (
	"encoding/base64"
	"testing"
	"upspa/internal/crypto"
)
func FuzzCanonicalB64(f *testing.F) {
	seeds := []string{
		"",
		"YQ",
		"YWI",
		"YWJj",
		"AAAA",
		"AAECBA",
		"YQ==",
		"YWI=",
		"!!!not-base64!!!",
		"dGVzdA",
		"dGVzdA==",
		" dGVzdA",
		"dGVz dA",
		"dGVz\ndA",
		"+/8=",
		"\x00\x00",
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
	}
	for _, s := range seeds {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, input string) {
		canon, raw, err := crypto.CanonicalB64(input)
		if err != nil {
			return
		}
		raw2, err2 := base64.RawURLEncoding.DecodeString(canon)
		if err2 != nil {
			t.Errorf("canonical string %q failed to re-decode: %v", canon, err2)
		}
		if string(raw) != string(raw2) {
			t.Errorf("round-trip byte mismatch for input %q", input)
		}
		canon2, _, err3 := crypto.CanonicalB64(canon)
		if err3 != nil {
			t.Errorf("re-canonicalizing already-canonical string %q returned error: %v", canon, err3)
		}
		if canon != canon2 {
			t.Errorf("not idempotent: input %q → %q → %q", input, canon, canon2)
		}
	})
}
func FuzzDecodeFixedB64(f *testing.F) {
	f.Add(base64.RawURLEncoding.EncodeToString(make([]byte, 32)), 32)
	f.Add(base64.RawURLEncoding.EncodeToString(make([]byte, 64)), 64)
	f.Add(base64.RawURLEncoding.EncodeToString(make([]byte, 24)), 24)
	f.Add(base64.RawURLEncoding.EncodeToString(make([]byte, 16)), 16)
	f.Add(base64.RawURLEncoding.EncodeToString(make([]byte, 31)), 32)
	f.Add("!!!bad!!!", 32)
	f.Add("", 32)
	f.Add("", 0)
	f.Fuzz(func(t *testing.T, input string, n int) {
		if n < 0 || n > 4096 {
			return
		}
		raw, _, err := crypto.DecodeFixedB64(input, n)
		if err != nil {
			return
		}
		if len(raw) != n {
			t.Errorf("DecodeFixedB64(%q, %d) returned %d bytes, want %d",
				input, n, len(raw), n)
		}
	})
}
