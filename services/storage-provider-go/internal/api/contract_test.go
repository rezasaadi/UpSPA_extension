package api

import (
	_ "embed"
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/legacy"
)

//go:embed testdata/sp.yaml
var contractSpec []byte

// contractHarness holds the parsed OpenAPI document and a kin-openapi router
// used to locate a route and then validate a request/response pair against
// the sp.yaml contract. It is created once per test file via newContractHarness.
type contractHarness struct {
	doc    *openapi3.T
	router routers.Router
}

func newContractHarness(t *testing.T) *contractHarness {
	t.Helper()
	loader := openapi3.NewLoader()
	doc, err := loader.LoadFromData(contractSpec)
	if err != nil {
		t.Fatalf("contract: load spec: %v", err)
	}
	if err := doc.Validate(loader.Context); err != nil {
		t.Fatalf("contract: spec is invalid: %v", err)
	}
	r, err := legacy.NewRouter(doc)
	if err != nil {
		t.Fatalf("contract: build router: %v", err)
	}
	return &contractHarness{doc: doc, router: r}
}

// assertResponse runs the given http.Request through the provided handler function,
// then validates the recorded response against the OpenAPI contract.
// It also validates the outgoing request shape when options.ExcludeRequestBody is false.
func (h *contractHarness) assertResponse(
	t *testing.T,
	req *http.Request,
	serve func(http.ResponseWriter, *http.Request),
	wantStatus int,
) {
	t.Helper()

	// Capture a copy of the body before the handler drains it.
	var bodyBuf []byte
	if req.Body != nil {
		var err error
		bodyBuf, err = io.ReadAll(req.Body)
		if err != nil {
			t.Fatalf("contract: read request body: %v", err)
		}
		req.Body = io.NopCloser(bytes.NewReader(bodyBuf))
	}

	rr := httptest.NewRecorder()
	serve(rr, req)

	if rr.Code != wantStatus {
		t.Errorf("contract: status = %d, want %d (body: %s)", rr.Code, wantStatus, rr.Body.String())
	}

	// Restore body for kin-openapi route matching.
	if bodyBuf != nil {
		req.Body = io.NopCloser(bytes.NewReader(bodyBuf))
	}

	ctx := context.Background()
	route, pathParams, err := h.router.FindRoute(req)
	if err != nil {
		t.Fatalf("contract: FindRoute(%s %s): %v", req.Method, req.URL.Path, err)
	}

	reqInput := &openapi3filter.RequestValidationInput{
		Request:    req,
		PathParams: pathParams,
		Route:      route,
		Options: &openapi3filter.Options{
			AuthenticationFunc: openapi3filter.NoopAuthenticationFunc,
		},
	}
	if err := openapi3filter.ValidateRequest(ctx, reqInput); err != nil {
		t.Errorf("contract: request violates spec: %v", err)
	}

	respInput := &openapi3filter.ResponseValidationInput{
		RequestValidationInput: reqInput,
		Status:                 rr.Code,
		Header:                 rr.Result().Header,
		Body:                   io.NopCloser(bytes.NewReader(rr.Body.Bytes())),
		Options: &openapi3filter.Options{
			IncludeResponseStatus: true,
		},
	}
	if err := openapi3filter.ValidateResponse(ctx, respInput); err != nil {
		t.Errorf("contract: response violates spec: %v", err)
	}
}

// b64nContract produces a canonical base64url-no-pad string of n 0xAA bytes.
// Kept separate from the existing b64n helper so this file is self-contained.
func b64nContract(n int) string { return b64n(n) }

// --- test cases ---

func TestContract_Health(t *testing.T) {
	h := newContractHarness(t)
	req := httptest.NewRequest(http.MethodGet, "/v1/health", nil)
	h.assertResponse(t, req, handleHealth, http.StatusOK)
}

func TestContract_SetupCreate_201(t *testing.T) {
	h := newContractHarness(t)
	handler := NewHandler(NewFakeStore())

	body := `{"uid_b64":"` + b64nContract(8) + `","sig_pk_b64":"` + b64nContract(32) +
		`","cid":{"nonce":"` + b64nContract(24) + `","ct":"` + b64nContract(96) +
		`","tag":"` + b64nContract(16) + `"},"k_i_b64":"` + b64nContract(32) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/setup", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")

	h.assertResponse(t, req, handler.Setup, http.StatusCreated)
}

func TestContract_SetupCreate_200_Idempotent(t *testing.T) {
	h := newContractHarness(t)
	store := NewFakeStore()
	handler := NewHandler(store)

	uid := b64nContract(8)
	body := `{"uid_b64":"` + uid + `","sig_pk_b64":"` + b64nContract(32) +
		`","cid":{"nonce":"` + b64nContract(24) + `","ct":"` + b64nContract(96) +
		`","tag":"` + b64nContract(16) + `"},"k_i_b64":"` + b64nContract(32) + `"}`

	// First call creates the record.
	req1 := httptest.NewRequest(http.MethodPost, "/v1/setup", bytes.NewBufferString(body))
	req1.Header.Set("Content-Type", "application/json")
	httptest.NewRecorder() // discard first response
	handler.Setup(httptest.NewRecorder(), req1)

	// Second call is idempotent → 200.
	req2 := httptest.NewRequest(http.MethodPost, "/v1/setup", bytes.NewBufferString(body))
	req2.Header.Set("Content-Type", "application/json")
	h.assertResponse(t, req2, handler.Setup, http.StatusOK)
}

func TestContract_SetupGet_200(t *testing.T) {
	h := newContractHarness(t)
	store := NewFakeStore()
	handler := NewHandler(store)

	uid := b64nContract(8)
	// Pre-seed the store.
	_, _ = store.PutSetup(context.Background(), uid,
		b64nContract(32), b64nContract(24), b64nContract(96), b64nContract(16), b64nContract(32))

	req := httptest.NewRequest(http.MethodGet, "/v1/setup/"+uid, nil)
	req.SetPathValue("uid_b64", uid)
	h.assertResponse(t, req, handler.SetupGet, http.StatusOK)
}

func TestContract_SetupGet_404(t *testing.T) {
	h := newContractHarness(t)
	handler := NewHandler(NewFakeStore())

	uid := b64nContract(8)
	req := httptest.NewRequest(http.MethodGet, "/v1/setup/"+uid, nil)
	req.SetPathValue("uid_b64", uid)
	h.assertResponse(t, req, handler.SetupGet, http.StatusNotFound)
}

func TestContract_SetupGet_400_BadBase64(t *testing.T) {
	h := newContractHarness(t)
	handler := NewHandler(NewFakeStore())

	req := httptest.NewRequest(http.MethodGet, "/v1/setup/inv!alid", nil)
	req.SetPathValue("uid_b64", "inv!alid")
	h.assertResponse(t, req, handler.SetupGet, http.StatusBadRequest)
}

func TestContract_RecordCreate_201(t *testing.T) {
	h := newContractHarness(t)
	handler := NewHandler(NewFakeStore())

	body := `{"suid_b64":"` + b64nContract(32) + `","cj":{"nonce":"` + b64nContract(24) +
		`","ct":"` + b64nContract(40) + `","tag":"` + b64nContract(16) + `"}}`
	req := httptest.NewRequest(http.MethodPost, "/v1/records", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	h.assertResponse(t, req, handler.RecordCreate, http.StatusCreated)
}

func TestContract_RecordCreate_409_Conflict(t *testing.T) {
	h := newContractHarness(t)
	store := NewFakeStore()
	handler := NewHandler(store)

	suid := b64nContract(32)
	// Pre-seed.
	_, _ = store.CreateRecord(context.Background(), suid, b64nContract(24), b64nContract(40), b64nContract(16))

	body := `{"suid_b64":"` + suid + `","cj":{"nonce":"` + b64nContract(24) +
		`","ct":"` + b64nContract(40) + `","tag":"` + b64nContract(16) + `"}}`
	req := httptest.NewRequest(http.MethodPost, "/v1/records", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	h.assertResponse(t, req, handler.RecordCreate, http.StatusConflict)
}

func TestContract_RecordGet_200(t *testing.T) {
	h := newContractHarness(t)
	store := NewFakeStore()
	handler := NewHandler(store)

	suid := b64nContract(32)
	_, _ = store.CreateRecord(context.Background(), suid, b64nContract(24), b64nContract(40), b64nContract(16))

	req := httptest.NewRequest(http.MethodGet, "/v1/records/"+suid, nil)
	req.SetPathValue("suid_b64", suid)
	h.assertResponse(t, req, handler.RecordGet, http.StatusOK)
}
