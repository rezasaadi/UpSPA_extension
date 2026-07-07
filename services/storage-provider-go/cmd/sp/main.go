package main
import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"
	"upspa/internal/api"
	"upspa/internal/config"
	"upspa/internal/db"
)
func main() {
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	store, err := db.NewWithDSN(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer store.Close()
	h := api.NewHandler(store, cfg.SpID)
	router := api.NewRouter(h)
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%s", cfg.Port),
		Handler:           router,
		ReadTimeout:       5 * time.Second,
		ReadHeaderTimeout: 3 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       15 * time.Second,
	}
	log.Printf("Storage Provider server starting on :%s (SP_ID=%d)", cfg.Port, cfg.SpID)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server failed: %v", err)
	}
}
