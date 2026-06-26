// Package api_test contains black-box integration tests that wire the real HTTP
// router against a real db.Store backed by an ephemeral Postgres container.
// Tests are skipped automatically when Docker is unavailable and DATABASE_URL is
// not set, matching the behaviour of the DB layer integration tests.
package api_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"upspa/internal/api"
	"upspa/internal/db"
	"upspa/internal/testutil"
)

// newBlackboxServer starts an ephemeral Postgres container (or uses DATABASE_URL),
// applies schema migrations, and returns an httptest.Server wired to the real router.
// When Docker is used, each call creates a brand-new container so tests are isolated.
// Server and DB pool are closed automatically via t.Cleanup.
//
// The store creation is retried with backoff because the Postgres container may
// have its port mapped before the database process is ready to accept connections.
func newBlackboxServer(t *testing.T) *httptest.Server {
	t.Helper()
	ctx := context.Background()

	dsn := os.Getenv("DATABASE_URL")
	var cleanup func()
	if dsn == "" {
		var err error
		dsn, cleanup, err = testutil.StartPostgresContainer(ctx)
		if err != nil {
			t.Skipf("DATABASE_URL not set and Docker unavailable: %v", err)
		}
		t.Cleanup(cleanup)
	}

	// Retry connecting to Postgres with exponential backoff. The container port
	// is mapped before Postgres finishes its startup sequence, so the first
	// connection attempt often fails with "connection reset by peer".
	const maxAttempts = 10
	const baseDelay = 2 * time.Second
	var store *db.Store
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		store, lastErr = db.NewWithDSN(ctx, dsn)
		if lastErr == nil {
			break
		}
		if attempt < maxAttempts {
			t.Logf("blackbox: postgres not ready (attempt %d/%d): %v — retrying in %v",
				attempt, maxAttempts, lastErr, baseDelay)
			time.Sleep(baseDelay)
		}
	}
	if lastErr != nil {
		t.Fatalf("blackbox: open store after %d attempts: %v", maxAttempts, lastErr)
	}
	t.Cleanup(func() { store.Close() })

	handler := api.NewHandler(store)
	srv := httptest.NewServer(api.NewRouter(handler))
	t.Cleanup(srv.Close)
	return srv
}

// testUID returns a canonical base64url-no-pad string that encodes n bytes all
// set to the given seed value. Using a different seed per test avoids key
// collisions when DATABASE_URL points at a shared database.
func testUID(n int, seed byte) string {
	buf := make([]byte, n)
	for i := range buf {
		buf[i] = seed
	}
	return base64.RawURLEncoding.EncodeToString(buf)
}

func doJSON(t *testing.T, srv *httptest.Server, method, path string, body any) *http.Response {
	t.Helper()
	var bodyReader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("blackbox: marshal body: %v", err)
		}
		bodyReader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, srv.URL+path, bodyReader)
	if err != nil {
		t.Fatalf("blackbox: new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("blackbox: %s %s: %v", method, path, err)
	}
	return resp
}

func assertStatus(t *testing.T, resp *http.Response, want int) {
	t.Helper()
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != want {
		t.Errorf("status = %d, want %d (body: %s)", resp.StatusCode, want, body)
	}
}

func decodeJSON(t *testing.T, resp *http.Response, dst any) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(dst); err != nil {
		t.Fatalf("blackbox: decode response: %v", err)
	}
}

// --- test cases ---

func TestBlackbox_Health(t *testing.T) {
	srv := newBlackboxServer(t)
	resp := doJSON(t, srv, http.MethodGet, "/v1/health", nil)
	assertStatus(t, resp, http.StatusOK)
}

func TestBlackbox_Setup_CreateAndGet(t *testing.T) {
	srv := newBlackboxServer(t)

	uid := testUID(8, 0x01)
	setupBody := map[string]any{
		"uid_b64":    uid,
		"sig_pk_b64": testUID(32, 0x02),
		"cid": map[string]string{
			"nonce": testUID(24, 0x03),
			"ct":    testUID(96, 0x04),
			"tag":   testUID(16, 0x05),
		},
		"k_i_b64": testUID(32, 0x06),
	}

	// POST /v1/setup → 201
	resp := doJSON(t, srv, http.MethodPost, "/v1/setup", setupBody)
	assertStatus(t, resp, http.StatusCreated)

	// GET /v1/setup/{uid_b64} → 200 with correct shape
	resp = doJSON(t, srv, http.MethodGet, fmt.Sprintf("/v1/setup/%s", uid), nil)
	var got map[string]any
	decodeJSON(t, resp, &got)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET setup: status = %d, want 200", resp.StatusCode)
	}
	if got["uid_b64"] == nil {
		t.Error("GET setup response missing uid_b64")
	}
	if got["sig_pk_b64"] == nil {
		t.Error("GET setup response missing sig_pk_b64")
	}
	if got["cid"] == nil {
		t.Error("GET setup response missing cid")
	}
}

func TestBlackbox_Setup_IdempotentReturns200(t *testing.T) {
	srv := newBlackboxServer(t)

	uid := testUID(8, 0x11)
	setupBody := map[string]any{
		"uid_b64":    uid,
		"sig_pk_b64": testUID(32, 0x12),
		"cid": map[string]string{
			"nonce": testUID(24, 0x13),
			"ct":    testUID(96, 0x14),
			"tag":   testUID(16, 0x15),
		},
		"k_i_b64": testUID(32, 0x16),
	}

	resp := doJSON(t, srv, http.MethodPost, "/v1/setup", setupBody)
	assertStatus(t, resp, http.StatusCreated)

	// Second call with identical body → idempotent 200.
	resp = doJSON(t, srv, http.MethodPost, "/v1/setup", setupBody)
	assertStatus(t, resp, http.StatusOK)
}

func TestBlackbox_Setup_NotFoundReturns404(t *testing.T) {
	srv := newBlackboxServer(t)
	resp := doJSON(t, srv, http.MethodGet, "/v1/setup/"+testUID(8, 0x21), nil)
	assertStatus(t, resp, http.StatusNotFound)
}

func TestBlackbox_Record_CRUDLifecycle(t *testing.T) {
	srv := newBlackboxServer(t)

	suid := testUID(32, 0x31)
	cj := map[string]string{
		"nonce": testUID(24, 0x32),
		"ct":    testUID(40, 0x33),
		"tag":   testUID(16, 0x34),
	}
	createBody := map[string]any{"suid_b64": suid, "cj": cj}

	// POST → 201
	resp := doJSON(t, srv, http.MethodPost, "/v1/records", createBody)
	assertStatus(t, resp, http.StatusCreated)

	// GET → 200 with correct JSON shape
	resp = doJSON(t, srv, http.MethodGet, fmt.Sprintf("/v1/records/%s", suid), nil)
	var got map[string]any
	decodeJSON(t, resp, &got)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET record: status = %d, want 200", resp.StatusCode)
	}
	if got["suid_b64"] == nil {
		t.Error("GET record response missing suid_b64")
	}
	if got["cj"] == nil {
		t.Error("GET record response missing cj")
	}

	// PUT → 200
	newCj := map[string]string{
		"nonce": testUID(24, 0x35),
		"ct":    testUID(40, 0x36),
		"tag":   testUID(16, 0x37),
	}
	resp = doJSON(t, srv, http.MethodPut, fmt.Sprintf("/v1/records/%s", suid), map[string]any{"cj": newCj})
	assertStatus(t, resp, http.StatusOK)

	// DELETE → 200
	resp = doJSON(t, srv, http.MethodDelete, fmt.Sprintf("/v1/records/%s", suid), nil)
	assertStatus(t, resp, http.StatusOK)

	// GET after DELETE → 404
	resp = doJSON(t, srv, http.MethodGet, fmt.Sprintf("/v1/records/%s", suid), nil)
	assertStatus(t, resp, http.StatusNotFound)
}

func TestBlackbox_Record_DuplicateReturns409(t *testing.T) {
	srv := newBlackboxServer(t)

	suid := testUID(32, 0x41)
	body := map[string]any{
		"suid_b64": suid,
		"cj": map[string]string{
			"nonce": testUID(24, 0x42),
			"ct":    testUID(40, 0x43),
			"tag":   testUID(16, 0x44),
		},
	}

	resp := doJSON(t, srv, http.MethodPost, "/v1/records", body)
	assertStatus(t, resp, http.StatusCreated)

	resp = doJSON(t, srv, http.MethodPost, "/v1/records", body)
	assertStatus(t, resp, http.StatusConflict)
}
