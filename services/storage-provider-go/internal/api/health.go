
package api

import (
	"net/http"
)

func handleHealth(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
