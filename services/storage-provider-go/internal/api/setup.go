package api
import (
	"context"
	"errors"
	"net/http"
	spcrypto "upspa/internal/crypto"
	"upspa/internal/model"
)
const (
	lenUIDMin     = 1
	lenSUID       = 32
	lenCipherIDCt = 96
	lenCipherSpCt = 40
)
var (
	ErrInvalidBase64 = errors.New("invalid base64url encoding")
	ErrInvalidLength = errors.New("invalid decoded byte length")
	ErrNotFound      = errors.New("record not found")
	ErrConflict      = errors.New("record conflict")
)
type Store interface {
	PutSetup(ctx context.Context, uid, sigPk, cidNonce, cidCt, cidTag, kI string) (bool, error)
	GetSetup(ctx context.Context, uid string) (sigPk, cidNonce, cidCt, cidTag, kI string, lastTs int64, found bool, err error)
	GetKi(ctx context.Context, uid string) (kI string, found bool, err error)
	CreateRecord(ctx context.Context, suid, cjNonce, cjCt, cjTag string) (bool, error)
	GetRecord(ctx context.Context, suid string) (cjNonce, cjCt, cjTag string, found bool, err error)
	UpdateRecord(ctx context.Context, suid, cjNonce, cjCt, cjTag string) (bool, error)
	DeleteRecord(ctx context.Context, suid string) (bool, error)
	ApplyPasswordUpdate(ctx context.Context, uid string, ts int64, cidNonceNew, cidCtNew, cidTagNew, kINew string) (bool, error)
}
type Handler struct {
	store Store
	spID  uint32
}
func NewHandler(s Store, spID ...uint32) *Handler {
	id := uint32(1)
	if len(spID) > 0 && spID[0] != 0 {
		id = spID[0]
	}
	return &Handler{store: s, spID: id}
}
func decodeCanonicalNonEmpty(s string) (raw []byte, canon string, err error) {
	raw, canon, err = spcrypto.DecodeFixedB64(s, -1)
	if err != nil {
		return nil, "", err
	}
	if len(raw) < lenUIDMin {
		return nil, "", ErrInvalidLength
	}
	return raw, canon, nil
}
func decodeFixed(s string, n int) (raw []byte, canon string, err error) {
	return spcrypto.DecodeFixedB64(s, n)
}
func badField(w http.ResponseWriter, code, field string) {
	WriteError(w, http.StatusBadRequest, code, "invalid field", map[string]any{"field": field})
}
func canonicalCtBlob(b model.CtBlob, ctLen int) (nonceRaw, ctRaw, tagRaw []byte, canon model.CtBlob, err error) {
	nonceRaw, canon.Nonce, err = decodeFixed(b.Nonce, spcrypto.LenCtBlobNonce)
	if err != nil {
		return nil, nil, nil, canon, err
	}
	ctRaw, canon.Ct, err = decodeFixed(b.Ct, ctLen)
	if err != nil {
		return nil, nil, nil, canon, err
	}
	tagRaw, canon.Tag, err = decodeFixed(b.Tag, spcrypto.LenCtBlobTag)
	if err != nil {
		return nil, nil, nil, canon, err
	}
	return nonceRaw, ctRaw, tagRaw, canon, nil
}
func (h *Handler) Setup(w http.ResponseWriter, r *http.Request) {
	var req model.SetupRequest
	if err := ReadJSON(w, r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json_body", "invalid JSON body", map[string]any{"error": err.Error()})
		return
	}
	_, uidCanon, err := decodeCanonicalNonEmpty(req.UIDB64)
	if err != nil {
		badField(w, "invalid_uid", "uid_b64")
		return
	}
	_, sigCanon, err := decodeFixed(req.SigPkB64, spcrypto.LenEd25519PublicKey)
	if err != nil {
		badField(w, "invalid_sig_pk", "sig_pk_b64")
		return
	}
	_, _, _, cidCanon, err := canonicalCtBlob(req.CID, lenCipherIDCt)
	if err != nil {
		badField(w, "invalid_cid", "cid")
		return
	}
	_, kICanon, err := decodeFixed(req.KIB64, spcrypto.LenScalarKi)
	if err != nil {
		badField(w, "invalid_k_i", "k_i_b64")
		return
	}
	created, err := h.store.PutSetup(r.Context(), uidCanon, sigCanon, cidCanon.Nonce, cidCanon.Ct, cidCanon.Tag, kICanon)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
		return
	}
	if created {
		_ = WriteJSON(w, http.StatusCreated, map[string]bool{"ok": true})
	} else {
		_ = WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}
