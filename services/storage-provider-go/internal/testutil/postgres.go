package testutil

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// StartPostgresContainer starts a postgres container using the docker CLI.
// It returns a DATABASE_URL-style DSN and a cleanup function that stops/removes the container.
// This avoids depending on testcontainers-go in environments where module versions cause build issues.
func StartPostgresContainer(ctx context.Context) (string, func(), error) {
	// Ensure docker CLI is available
	if _, err := exec.LookPath("docker"); err != nil {
		return "", nil, fmt.Errorf("docker CLI not found in PATH: %w", err)
	}

	// Generate a deterministic container name with timestamp
	name := fmt.Sprintf("upspa_test_pg_%d", time.Now().UnixNano())
	// Start container
	// - password/test db/test user/test db
	cmd := exec.CommandContext(ctx, "docker", "run", "--rm", "-d", "-p", "0:5432", "--name", name,
		"-e", "POSTGRES_USER=test", "-e", "POSTGRES_PASSWORD=test", "-e", "POSTGRES_DB=test", "postgres:15-alpine")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", nil, fmt.Errorf("docker run failed: %v: %s", err, string(out))
	}
	// out contains container id
	containerID := strings.TrimSpace(string(out))

	// Determine mapped port (docker port)
	// Using `docker port <container> 5432` yields e.g. 0.0.0.0:32768
	var hostPort string
	deadline := time.After(60 * time.Second)
	tick := time.Tick(200 * time.Millisecond)
	for {
		select {
		case <-deadline:
			// cleanup and return error
			_ = exec.Command("docker", "rm", "-f", containerID).Run()
			return "", nil, errors.New("timeout waiting for container port mapping")
		case <-tick:
			out, _ := exec.Command("docker", "port", containerID, "5432").CombinedOutput()
			if len(out) == 0 {
				continue
			}
			// output like 0.0.0.0:32768
			parts := strings.Split(strings.TrimSpace(string(out)), ":")
			hostPort = parts[len(parts)-1]
			if hostPort != "" {
				goto READY
			}
		}
	}
READY:

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", "test", "test", "127.0.0.1", hostPort, "test")

	cleanup := func() {
		// best effort stop/remove container
		_ = exec.Command("docker", "rm", "-f", containerID).Run()
	}

	return dsn, cleanup, nil
}
