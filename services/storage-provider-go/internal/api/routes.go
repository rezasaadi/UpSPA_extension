package api
import (
	"net/http"
)
func NewRouter(h *Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", handleHealth)
	mux.HandleFunc("POST /v1/setup", h.Setup)
	mux.HandleFunc("GET /v1/setup/{uid_b64}", h.SetupGet)
	mux.HandleFunc("POST /v1/toprf/eval", h.EvalToprf)
	mux.HandleFunc("POST /v1/records", h.RecordCreate)
	mux.HandleFunc("GET /v1/records/{suid_b64}", h.RecordGet)
	mux.HandleFunc("PUT /v1/records/{suid_b64}", h.RecordUpdate)
	mux.HandleFunc("DELETE /v1/records/{suid_b64}", h.RecordDelete)
	mux.HandleFunc("POST /v1/password-update", h.PasswordUpdate)
	return withCORS(mux)
}
func handleHealth(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
