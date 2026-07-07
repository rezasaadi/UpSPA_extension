package api
import (
	"math"
	"net/http"
	spcrypto "upspa/internal/crypto"
	"upspa/internal/model"
)
func (h *Handler) PasswordUpdate(w http.ResponseWriter, r *http.Request) {
	var req model.PasswordUpdateRequest
	if err := ReadJSON(w, r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", "invalid JSON body", nil)
		return
	}
	if req.SpID != h.spID {
		WriteError(w, http.StatusBadRequest, "invalid_sp_id", "request sp_id does not match this SP", nil)
		return
	}
	if req.Timestamp > uint64(math.MaxInt64) {
		WriteError(w, http.StatusBadRequest, "invalid_timestamp", "timestamp too large", nil)
		return
	}
	_, uidCanon, err := decodeCanonicalNonEmpty(req.UIDB64)
	if err != nil {
		badField(w, "invalid_uid", "uid_b64")
		return
	}
	sigRaw, _, err := decodeFixed(req.SigB64, spcrypto.LenEd25519Signature)
	if err != nil {
		badField(w, "invalid_sig", "sig_b64")
		return
	}
	cidNonceRaw, cidCtRaw, cidTagRaw, cidCanon, err := canonicalCtBlob(req.CIDNew, lenCipherIDCt)
	if err != nil {
		badField(w, "invalid_cid_new", "cid_new")
		return
	}
	kINewRaw, kINewCanon, err := decodeFixed(req.KINewB64, spcrypto.LenScalarKi)
	if err != nil {
		badField(w, "invalid_k_i_new", "k_i_new_b64")
		return
	}
	sigPkB64, _, _, _, _, lastTs, found, err := h.store.GetSetup(r.Context(), uidCanon)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
		return
	}
	if !found {
		WriteError(w, http.StatusNotFound, "not_found", "user setup not found", nil)
		return
	}
	if int64(req.Timestamp) <= lastTs {
		WriteError(w, http.StatusConflict, "replay", "stale password update timestamp", nil)
		return
	}
	sigPkRaw, _, err := decodeFixed(sigPkB64, spcrypto.LenEd25519PublicKey)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "stored_invalid_sig_pk", "stored public key is invalid", nil)
		return
	}
	msg := spcrypto.BuildPwdUpdateSigMsg(cidNonceRaw, cidCtRaw, cidTagRaw, kINewRaw, req.Timestamp, req.SpID)
	if !spcrypto.VerifyEd25519(sigPkRaw, msg, sigRaw) {
		WriteError(w, http.StatusUnauthorized, "invalid_signature", "invalid password update signature", nil)
		return
	}
	applied, err := h.store.ApplyPasswordUpdate(r.Context(), uidCanon, int64(req.Timestamp), cidCanon.Nonce, cidCanon.Ct, cidCanon.Tag, kINewCanon)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
		return
	}
	if !applied {
		WriteError(w, http.StatusConflict, "replay", "stale password update timestamp", nil)
		return
	}
	_ = WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
