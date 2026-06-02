package crypto
const (
	LenEd25519PublicKey = 32
	LenEd25519Signature = 64
	LenCtBlobNonce = 24
	LenCtBlobTag = 16
	LenRistretto = 32
	LenScalarKi = 32
)
const (
	LenTimestamp = 8
	LenSpID = 4
	PwdUpdateSigMsgFixedLen = LenCtBlobNonce + LenCtBlobTag + LenScalarKi + LenTimestamp + LenSpID
)
