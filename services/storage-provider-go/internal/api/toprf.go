package api
import (
	"errors"
	"net/http"
	spcrypto "upspa/internal/crypto"
	"upspa/internal/model"
)
func (h *Handler) EvalToprf(w http.ResponseWriter, r *http.Request) {
	var req model.ToprfEvalRequest
	if err := ReadJSON(w, r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", "invalid JSON body", nil)
		return
	}
	_, uidCanon, err := decodeCanonicalNonEmpty(req.UIDB64)
	if err != nil {
		badField(w, "invalid_uid", "uid_b64")
		return
	}
	blindedRaw, _, err := decodeFixed(req.BlindedB64, spcrypto.LenRistretto)
	if err != nil {
		badField(w, "invalid_blinded", "blinded_b64")
		return
	}
	kIB64, found, err := h.store.GetKi(r.Context(), uidCanon)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
		return
	}
	if !found {
		WriteError(w, http.StatusNotFound, "not_found", "user setup not found", nil)
		return
	}
	kIRaw, _, err := decodeFixed(kIB64, spcrypto.LenScalarKi)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "stored_invalid_k_i", "stored scalar is invalid", nil)
		return
	}
	y, err := spcrypto.RistrettoScalarMult(kIRaw, blindedRaw)
	if err != nil {
		if errors.Is(err, spcrypto.ErrInvalidPoint) || errors.Is(err, spcrypto.ErrInvalidScalar) || errors.Is(err, spcrypto.ErrWrongLength) {
			WriteError(w, http.StatusBadRequest, "invalid_toprf_input", "invalid TOPRF input", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
		return
	}
	_ = WriteJSON(w, http.StatusOK, model.ToprfEvalResponse{SpID: h.spID, YB64: spcrypto.EncodeB64(y)})
}
