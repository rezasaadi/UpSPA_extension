package model
type CtBlob struct {
	Nonce string `json:"nonce"`
	Ct    string `json:"ct"`
	Tag   string `json:"tag"`
}
type SetupRequest struct {
	UIDB64   string `json:"uid_b64"`
	SigPkB64 string `json:"sig_pk_b64"`
	CID      CtBlob `json:"cid"`
	KIB64    string `json:"k_i_b64"`
}
type SetupResponse struct {
	UIDB64   string `json:"uid_b64"`
	SigPkB64 string `json:"sig_pk_b64"`
	CID      CtBlob `json:"cid"`
}
type ToprfEvalRequest struct {
	UIDB64     string `json:"uid_b64"`
	BlindedB64 string `json:"blinded_b64"`
}
type ToprfEvalResponse struct {
	SpID uint32 `json:"sp_id"`
	YB64 string `json:"y_b64"`
}
type RecordCreateRequest struct {
	SUIDB64 string `json:"suid_b64"`
	CJ      CtBlob `json:"cj"`
}
type RecordUpdateRequest struct {
	CJ CtBlob `json:"cj"`
}
type RecordResponse struct {
	SUIDB64 string `json:"suid_b64"`
	CJ      CtBlob `json:"cj"`
}
type PasswordUpdateRequest struct {
	UIDB64    string `json:"uid_b64"`
	SpID      uint32 `json:"sp_id"`
	Timestamp uint64 `json:"timestamp"`
	SigB64    string `json:"sig_b64"`
	CIDNew    CtBlob `json:"cid_new"`
	KINewB64  string `json:"k_i_new_b64"`
}
type ErrorDetail struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}
type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}
