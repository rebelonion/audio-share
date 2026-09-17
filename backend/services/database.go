package services

import (
	"context"
	"database/sql"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type Database struct {
	db     *sql.DB
	Errors *ErrorReporter
}

// OpenDatabase connects without changing the schema.
func OpenDatabase(ctx context.Context, dsn string) (*Database, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxIdleTime(5 * time.Minute)
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return &Database{db: db}, nil
}

func (d *Database) DB() *sql.DB  { return d.db }
func (d *Database) Close() error { return d.db.Close() }
