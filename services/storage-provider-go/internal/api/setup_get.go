package api
import (
	"net/http"
	"upspa/internal/model"
)
func (h *Handler) SetupGet(w http.ResponseWriter, r *http.Request) {
	_, uidCanon, err := decodeCanonicalNonEmpty(r.PathValue("uid_b64"))
	if err != nil {
		badField(w, "invalid_uid", "uid_b64")
		return
	}
	sigPk, cidNonce, cidCt, cidTag, _, _, found, err := h.store.GetSetup(r.Context(), uidCanon)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
		return
	}
	if !found {
		WriteError(w, http.StatusNotFound, "not_found", "user setup not found", nil)
		return
	}
	_ = WriteJSON(w, http.StatusOK, model.SetupResponse{UIDB64: uidCanon, SigPkB64: sigPk, CID: model.CtBlob{Nonce: cidNonce, Ct: cidCt, Tag: cidTag}})
}
