package api
import (
	"net/http"
	"upspa/internal/model"
)
func (h *Handler) RecordCreate(w http.ResponseWriter, r *http.Request) {
	var req model.RecordCreateRequest
	if err := ReadJSON(w, r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", "invalid JSON body", nil)
		return
	}
	_, suidCanon, err := decodeFixed(req.SUIDB64, lenSUID)
	if err != nil {
		badField(w, "invalid_suid", "suid_b64")
		return
	}
	_, _, _, cjCanon, err := canonicalCtBlob(req.CJ, lenCipherSpCt)
	if err != nil {
		badField(w, "invalid_cj", "cj")
		return
	}
	created, err := h.store.CreateRecord(r.Context(), suidCanon, cjCanon.Nonce, cjCanon.Ct, cjCanon.Tag)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
		return
	}
	if !created {
		WriteError(w, http.StatusConflict, "conflict", "record already exists", nil)
		return
	}
	_ = WriteJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}
func (h *Handler) RecordGet(w http.ResponseWriter, r *http.Request) {
	_, suidCanon, err := decodeFixed(r.PathValue("suid_b64"), lenSUID)
	if err != nil {
		badField(w, "invalid_suid", "suid_b64")
		return
	}
	n, c, t, found, err := h.store.GetRecord(r.Context(), suidCanon)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
		return
	}
	if !found {
		WriteError(w, http.StatusNotFound, "not_found", "record not found", nil)
		return
	}
	_ = WriteJSON(w, http.StatusOK, model.RecordResponse{SUIDB64: suidCanon, CJ: model.CtBlob{Nonce: n, Ct: c, Tag: t}})
}
func (h *Handler) RecordUpdate(w http.ResponseWriter, r *http.Request) {
	_, suidCanon, err := decodeFixed(r.PathValue("suid_b64"), lenSUID)
	if err != nil {
		badField(w, "invalid_suid", "suid_b64")
		return
	}
	var req model.RecordUpdateRequest
	if err := ReadJSON(w, r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", "invalid JSON body", nil)
		return
	}
	_, _, _, cjCanon, err := canonicalCtBlob(req.CJ, lenCipherSpCt)
	if err != nil {
		badField(w, "invalid_cj", "cj")
		return
	}
	updated, err := h.store.UpdateRecord(r.Context(), suidCanon, cjCanon.Nonce, cjCanon.Ct, cjCanon.Tag)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
		return
	}
	if !updated {
		WriteError(w, http.StatusNotFound, "not_found", "record not found", nil)
		return
	}
	_ = WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
func (h *Handler) RecordDelete(w http.ResponseWriter, r *http.Request) {
	_, suidCanon, err := decodeFixed(r.PathValue("suid_b64"), lenSUID)
	if err != nil {
		badField(w, "invalid_suid", "suid_b64")
		return
	}
	deleted, err := h.store.DeleteRecord(r.Context(), suidCanon)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
		return
	}
	if !deleted {
		WriteError(w, http.StatusNotFound, "not_found", "record not found", nil)
		return
	}
	_ = WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
