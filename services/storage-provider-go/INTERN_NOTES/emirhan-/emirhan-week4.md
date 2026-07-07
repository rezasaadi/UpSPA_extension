# Week 4 Progress

Here is what I did this week:

---

**1. OpenAPI Specification (`docs/openapi/sp.yaml`)**

* Wrote a full OpenAPI 3.0.3 description of our Storage Provider API.
* It covers all 9 endpoints: `/v1/health`, `/v1/setup`, `/v1/setup/{uid_b64}`, `/v1/toprf/eval`, `/v1/records`, `/v1/records/{suid_b64}` (GET / PUT / DELETE), and `/v1/password-update`.
* For each endpoint I listed the exact request body shape, every possible response status code (200, 201, 400, 401, 404, 409), and the JSON schema for each response body.
* All reusable types (like `CtBlob`, `SetupRequest`, `ErrorResponse`) are defined once in the `components/schemas` section and referenced with `$ref` so there is no duplication.
* This file is the single source of truth for what the API looks like. If someone wants to know "what fields does `/v1/setup` accept?", they open this file.

---

**2. Dependency (`go.mod`)**

* Added `github.com/getkin/kin-openapi v0.135.0` as a direct dependency.
* This library can load an OpenAPI spec file and then check whether a real HTTP request/response pair matches the shapes described in it. We use it in the contract tests below.

---

**3. Contract Tests (`internal/api/contract_test.go`)**

* Copied `sp.yaml` into `internal/api/testdata/sp.yaml` and embedded it into the test binary with Go's `//go:embed` directive, so the tests work without needing the file path to exist at runtime.
* Built a small helper (`contractHarness`) that loads the spec and creates a kin-openapi router. For each test, this helper:
  1. Runs the request through the real handler using `httptest`.
  2. Checks the HTTP status code matches what we expected.
  3. Validates the request body against the spec schema.
  4. Validates the response body against the spec schema.
* If a handler ever returns a wrong JSON key, a missing required field, or an undocumented status code, the test fails immediately with a clear message.
* **9 test cases** are covered:

| Test | What it checks |
|---|---|
| `TestContract_Health` | `GET /v1/health` returns `{"ok": true}` |
| `TestContract_SetupCreate_201` | `POST /v1/setup` happy path returns 201 |
| `TestContract_SetupCreate_200_Idempotent` | Second identical POST returns 200 |
| `TestContract_SetupGet_200` | `GET /v1/setup/{uid}` returns full `SetupResponse` shape |
| `TestContract_SetupGet_404` | Unknown uid returns 404 with error shape |
| `TestContract_SetupGet_400_BadBase64` | Malformed base64 uid returns 400 |
| `TestContract_RecordCreate_201` | `POST /v1/records` happy path |
| `TestContract_RecordCreate_409_Conflict` | Duplicate record returns 409 |
| `TestContract_RecordGet_200` | `GET /v1/records/{suid}` returns full `RecordResponse` shape |

* These tests use the `FakeStore` from `api_unit_test.go` so they need no database or Docker.
* Run with: `go test ./internal/api/ -run TestContract -v`

---

**4. Black-Box Integration Tests (`internal/api/api_blackbox_test.go`)**

* These tests go one step further than the contract tests: they use the **real database** (`db.Store`) instead of a fake one.
* Each test automatically starts a fresh temporary Postgres container using Sina's `testutil.StartPostgresContainer` helper, connects to it, runs the test, and cleans up the container when done.
* If Docker is not available, the tests skip automatically (same behavior as the DB layer tests).
* I added a **retry loop** (up to 10 attempts, 2 seconds apart) when opening the database connection. This is needed because Docker maps the port before Postgres finishes starting inside the container, so the first connection attempt usually fails with "connection reset". After one retry (about 2 seconds) it always succeeds.
* **6 test cases** are covered:

| Test | What it checks |
|---|---|
| `TestBlackbox_Health` | Server is reachable end-to-end |
| `TestBlackbox_Setup_CreateAndGet` | POST setup → GET setup round trip, response has correct JSON keys |
| `TestBlackbox_Setup_IdempotentReturns200` | Second identical POST setup returns 200 not 201 |
| `TestBlackbox_Setup_NotFoundReturns404` | GET for unknown uid returns 404 |
| `TestBlackbox_Record_CRUDLifecycle` | POST → GET → PUT → DELETE → GET (404) full lifecycle |
| `TestBlackbox_Record_DuplicateReturns409` | Second identical POST record returns 409 |

* Run with: `go test ./internal/api/ -run TestBlackbox -v -timeout 180s`

---

**5. How to run everything**

```bash
# Only contract tests (no Docker needed, fast):
go test ./internal/api/ -run TestContract -v

# Black-box integration tests (Docker required):
go test ./internal/api/ -run TestBlackbox -v -timeout 180s

# Full test suite across all packages:
go test ./... -timeout 180s
```

Expected result when Docker is available:

```
ok  upspa/internal/api
ok  upspa/internal/crypto
ok  upspa/internal/db
```

---

**6. Lessons learned**

* **OpenAPI first.** Writing the spec before writing tests made the test cases obvious — I just had to pick representative status codes from each endpoint's response table.
* **Port mapped ≠ Postgres ready.** Docker maps the host port almost immediately after the container starts, but Postgres inside the container takes a few more seconds to finish its initialization. Always retry the first connection when using ephemeral containers.
* **Two copies of the spec.** Because `docs/openapi/sp.yaml` lives outside the Go module boundary, Go's `//go:embed` cannot reach it. The solution is to keep a copy in `internal/api/testdata/sp.yaml`. If the spec ever changes, both files must be updated together.
