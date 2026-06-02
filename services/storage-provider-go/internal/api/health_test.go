package api
import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)
func TestHandleHealth(t *testing.T) {
	req, err := http.NewRequest("GET", "/v1/health", nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}
	rr := httptest.NewRecorder()
	handleHealth(rr, req)
	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Wrong status code returned! Expected: %v, Got: %v", http.StatusOK, status)
	}
	expected := `{"ok":true}`
	actual := strings.TrimSpace(rr.Body.String())
	if actual != expected {
		t.Errorf("Wrong response body returned! Expected: %s, Got: %s", expected, actual)
	}
}
