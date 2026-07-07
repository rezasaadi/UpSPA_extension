package crypto_test
import (
	"bytes"
	"encoding/binary"
	"testing"
	"upspa/internal/crypto"
)
func fixedMsg(ct []byte) ([]byte, int) {
	nonce := bytes.Repeat([]byte{0x01}, crypto.LenCtBlobNonce)
	tag := bytes.Repeat([]byte{0x03}, crypto.LenCtBlobTag)
	ki := bytes.Repeat([]byte{0x04}, crypto.LenScalarKi)
	ts := uint64(0x0102030405060708)
	spID := uint32(0x0A0B0C0D)
	msg := crypto.BuildPwdUpdateSigMsg(nonce, ct, tag, ki, ts, spID)
	return msg, len(ct)
}
func offsets(n int) (nonce, ct, tag, ki, ts, spID int) {
	nonce = 0
	ct = nonce + crypto.LenCtBlobNonce
	tag = ct + n
	ki = tag + crypto.LenCtBlobTag
	ts = ki + crypto.LenScalarKi
	spID = ts + 8
	return
}
func TestBuildPwdUpdateSigMsg_TotalLength_EmptyCt(t *testing.T) {
	msg, _ := fixedMsg([]byte{})
	want := crypto.LenCtBlobNonce + crypto.LenCtBlobTag + crypto.LenScalarKi + 8 + 4
	if len(msg) != want {
		t.Errorf("want %d bytes, got %d", want, len(msg))
	}
}
func TestBuildPwdUpdateSigMsg_TotalLength_NonEmptyCt(t *testing.T) {
	ct := bytes.Repeat([]byte{0x02}, 48)
	msg, n := fixedMsg(ct)
	want := crypto.LenCtBlobNonce + n + crypto.LenCtBlobTag + crypto.LenScalarKi + 8 + 4
	if len(msg) != want {
		t.Errorf("want %d bytes, got %d", want, len(msg))
	}
}
func TestBuildPwdUpdateSigMsg_Nonce_Offset(t *testing.T) {
	ct := bytes.Repeat([]byte{0x02}, 18)
	msg, n := fixedMsg(ct)
	oNonce, _, _, _, _, _ := offsets(n)
	got := msg[oNonce : oNonce+crypto.LenCtBlobNonce]
	want := bytes.Repeat([]byte{0x01}, crypto.LenCtBlobNonce)
	if !bytes.Equal(got, want) {
		t.Errorf("cidNonce at offset %d: got %x, want %x", oNonce, got, want)
	}
}
func TestBuildPwdUpdateSigMsg_Ct_Offset(t *testing.T) {
	ct := bytes.Repeat([]byte{0x02}, 18)
	msg, n := fixedMsg(ct)
	_, oCt, _, _, _, _ := offsets(n)
	got := msg[oCt : oCt+n]
	if !bytes.Equal(got, ct) {
		t.Errorf("cidCt at offset %d: got %x, want %x", oCt, got, ct)
	}
}
func TestBuildPwdUpdateSigMsg_Ct_Empty(t *testing.T) {
	msg, n := fixedMsg([]byte{})
	_, _, oTag, _, _, _ := offsets(n)
	if oTag != crypto.LenCtBlobNonce {
		t.Errorf("with empty ct, tag offset should be %d, got %d",
			crypto.LenCtBlobNonce, oTag)
	}
	got := msg[oTag : oTag+crypto.LenCtBlobTag]
	want := bytes.Repeat([]byte{0x03}, crypto.LenCtBlobTag)
	if !bytes.Equal(got, want) {
		t.Errorf("cidTag (empty ct): got %x, want %x", got, want)
	}
}
func TestBuildPwdUpdateSigMsg_Tag_Offset(t *testing.T) {
	ct := bytes.Repeat([]byte{0x02}, 18)
	msg, n := fixedMsg(ct)
	_, _, oTag, _, _, _ := offsets(n)
	got := msg[oTag : oTag+crypto.LenCtBlobTag]
	want := bytes.Repeat([]byte{0x03}, crypto.LenCtBlobTag)
	if !bytes.Equal(got, want) {
		t.Errorf("cidTag at offset %d: got %x, want %x", oTag, got, want)
	}
}
func TestBuildPwdUpdateSigMsg_KiNew_Offset(t *testing.T) {
	ct := bytes.Repeat([]byte{0x02}, 18)
	msg, n := fixedMsg(ct)
	_, _, _, oKi, _, _ := offsets(n)
	got := msg[oKi : oKi+crypto.LenScalarKi]
	want := bytes.Repeat([]byte{0x04}, crypto.LenScalarKi)
	if !bytes.Equal(got, want) {
		t.Errorf("kINew at offset %d: got %x, want %x", oKi, got, want)
	}
}
func TestBuildPwdUpdateSigMsg_Timestamp_LittleEndian(t *testing.T) {
	ct := bytes.Repeat([]byte{0x02}, 18)
	msg, n := fixedMsg(ct)
	_, _, _, _, oTs, _ := offsets(n)
	got := msg[oTs : oTs+8]
	ts := uint64(0x0102030405060708)
	want := make([]byte, 8)
	binary.LittleEndian.PutUint64(want, ts)
	if !bytes.Equal(got, want) {
		t.Errorf("timestamp at offset %d: got %x, want %x", oTs, got, want)
	}
}
func TestBuildPwdUpdateSigMsg_Timestamp_KnownBytes(t *testing.T) {
	ct := []byte{}
	msg, n := fixedMsg(ct)
	_, _, _, _, oTs, _ := offsets(n)
	wantBytes := []byte{0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01}
	got := msg[oTs : oTs+8]
	if !bytes.Equal(got, wantBytes) {
		t.Errorf("timestamp bytes (empty ct): got %x, want %x", got, wantBytes)
	}
}
func TestBuildPwdUpdateSigMsg_Timestamp_Zero(t *testing.T) {
	nonce := make([]byte, crypto.LenCtBlobNonce)
	tag := make([]byte, crypto.LenCtBlobTag)
	ki := make([]byte, crypto.LenScalarKi)
	msg := crypto.BuildPwdUpdateSigMsg(nonce, nil, tag, ki, 0, 0)
	oTs := crypto.LenCtBlobNonce + crypto.LenCtBlobTag + crypto.LenScalarKi
	got := msg[oTs : oTs+8]
	want := make([]byte, 8)
	if !bytes.Equal(got, want) {
		t.Errorf("timestamp=0: got %x, want %x", got, want)
	}
}
func TestBuildPwdUpdateSigMsg_SpID_LittleEndian(t *testing.T) {
	ct := bytes.Repeat([]byte{0x02}, 18)
	msg, n := fixedMsg(ct)
	_, _, _, _, _, oSpID := offsets(n)
	got := msg[oSpID : oSpID+4]
	spID := uint32(0x0A0B0C0D)
	want := make([]byte, 4)
	binary.LittleEndian.PutUint32(want, spID)
	if !bytes.Equal(got, want) {
		t.Errorf("spID at offset %d: got %x, want %x", oSpID, got, want)
	}
}
func TestBuildPwdUpdateSigMsg_SpID_KnownBytes(t *testing.T) {
	ct := []byte{}
	msg, n := fixedMsg(ct)
	_, _, _, _, _, oSpID := offsets(n)
	wantBytes := []byte{0x0D, 0x0C, 0x0B, 0x0A}
	got := msg[oSpID : oSpID+4]
	if !bytes.Equal(got, wantBytes) {
		t.Errorf("spID bytes (empty ct): got %x, want %x", got, wantBytes)
	}
}
func TestBuildPwdUpdateSigMsg_SpID_Zero(t *testing.T) {
	nonce := make([]byte, crypto.LenCtBlobNonce)
	tag := make([]byte, crypto.LenCtBlobTag)
	ki := make([]byte, crypto.LenScalarKi)
	msg := crypto.BuildPwdUpdateSigMsg(nonce, nil, tag, ki, 0, 0)
	oSpID := crypto.LenCtBlobNonce + crypto.LenCtBlobTag + crypto.LenScalarKi + 8
	got := msg[oSpID : oSpID+4]
	want := make([]byte, 4)
	if !bytes.Equal(got, want) {
		t.Errorf("spID=0: got %x, want %x", got, want)
	}
}
func TestBuildPwdUpdateSigMsg_GoldenVector(t *testing.T) {
	nonce := bytes.Repeat([]byte{0x01}, crypto.LenCtBlobNonce)
	tag := bytes.Repeat([]byte{0x03}, crypto.LenCtBlobTag)
	ki := bytes.Repeat([]byte{0x04}, crypto.LenScalarKi)
	msg := crypto.BuildPwdUpdateSigMsg(nonce, []byte{}, tag, ki, 1, 2)
	var want []byte
	want = append(want, bytes.Repeat([]byte{0x01}, 24)...)
	want = append(want, bytes.Repeat([]byte{0x03}, 16)...)
	want = append(want, bytes.Repeat([]byte{0x04}, 32)...)
	tsWant := make([]byte, 8)
	binary.LittleEndian.PutUint64(tsWant, 1)
	want = append(want, tsWant...)
	spWant := make([]byte, 4)
	binary.LittleEndian.PutUint32(spWant, 2)
	want = append(want, spWant...)
	if !bytes.Equal(msg, want) {
		t.Errorf("golden vector mismatch:\ngot  %x\nwant %x", msg, want)
	}
}
func TestBuildPwdUpdateSigMsg_NoAlias(t *testing.T) {
	nonce := bytes.Repeat([]byte{0xAA}, crypto.LenCtBlobNonce)
	ct := []byte{0xBB, 0xCC}
	tag := bytes.Repeat([]byte{0xDD}, crypto.LenCtBlobTag)
	ki := bytes.Repeat([]byte{0xEE}, crypto.LenScalarKi)
	msg := crypto.BuildPwdUpdateSigMsg(nonce, ct, tag, ki, 999, 888)
	snapshot := make([]byte, len(msg))
	copy(snapshot, msg)
	for i := range nonce {
		nonce[i] = 0x00
	}
	for i := range ct {
		ct[i] = 0x00
	}
	for i := range tag {
		tag[i] = 0x00
	}
	for i := range ki {
		ki[i] = 0x00
	}
	if !bytes.Equal(msg, snapshot) {
		t.Error("BuildPwdUpdateSigMsg output was mutated after input slices changed (aliasing bug)")
	}
}
