package crypto
import (
	"encoding/binary"
)
func BuildPwdUpdateSigMsg(
	cidNonce []byte,
	cidCt []byte,
	cidTag []byte,
	kINew []byte,
	tsU64LE uint64,
	spIDU32LE uint32,
) []byte {
	tsBytes := make([]byte, 8)
	binary.LittleEndian.PutUint64(tsBytes, tsU64LE)
	spIDBytes := make([]byte, 4)
	binary.LittleEndian.PutUint32(spIDBytes, spIDU32LE)
	totalLen := len(cidNonce) + len(cidCt) + len(cidTag) + len(kINew) + 8 + 4
	msg := make([]byte, 0, totalLen)
	msg = append(msg, cidNonce...)
	msg = append(msg, cidCt...)
	msg = append(msg, cidTag...)
	msg = append(msg, kINew...)
	msg = append(msg, tsBytes...)
	msg = append(msg, spIDBytes...)
	return msg
}
