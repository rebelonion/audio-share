package services

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"log"
	"time"
)

// Jobs must use conn for all database work: it cannot reconnect without its lock.
func withJobLock(db *sql.DB, name string, run func(conn *sql.Conn) error) (err error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	var acquired bool
	if err := conn.QueryRowContext(ctx, `SELECT pg_try_advisory_lock(hashtextextended($1, 0))`, "audio-share/job/"+name).Scan(&acquired); err != nil {
		conn.Raw(func(any) error { return driver.ErrBadConn })
		return err
	}
	if !acquired {
		log.Printf("Job %s already running, skipping", name)
		return nil
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, unlockErr := conn.ExecContext(ctx, `SELECT pg_advisory_unlock(hashtextextended($1, 0))`, "audio-share/job/"+name); unlockErr != nil {
			// Never return a connection with an unreleased session lock to the pool.
			conn.Raw(func(any) error { return driver.ErrBadConn })
			if err == nil {
				err = fmt.Errorf("release job lock %s: %w", name, unlockErr)
			}
		}
	}()
	if err := run(conn); err != nil {
		return fmt.Errorf("job %s: %w", name, err)
	}
	return nil
}
