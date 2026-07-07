package config
import (
	"log"
	"os"
	"strconv"
)
type Config struct {
	Port        string
	DatabaseURL string
	SpID        uint32
}
func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/upspa?sslmode=disable"
	}
	spIDStr := os.Getenv("SP_ID")
	var spID uint32 = 1
	if spIDStr != "" {
		parsedID, err := strconv.ParseUint(spIDStr, 10, 32)
		if err != nil {
			log.Printf("Warning: invalid SP_ID setting (%s). Default value (1) will be used.\n", spIDStr)
		} else {
			spID = uint32(parsedID)
		}
	}
	return &Config{
		Port:        port,
		DatabaseURL: dbURL,
		SpID:        spID,
	}
}
