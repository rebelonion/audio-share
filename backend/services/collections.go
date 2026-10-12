package services

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

// SourceIdentity deliberately has no platform-specific normalization. Producers
// and the external request normalizer must supply the same canonical hostname.
func SourceIdentity(channelURL, channelID string) (string, error) {
	host, err := channelHostname(channelURL)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(channelID) == "" {
		return "", fmt.Errorf("missing channel ID")
	}
	return host + ":" + strings.TrimSpace(channelID), nil
}

func channelHostname(channelURL string) (string, error) {
	u, err := url.Parse(channelURL)
	if err != nil || u.Hostname() == "" || u.User != nil || u.Port() != "" || (u.Scheme != "https" && u.Scheme != "http") {
		return "", fmt.Errorf("invalid channel URL")
	}
	return strings.ToLower(u.Hostname()), nil
}

type collectionObservation struct{ Name, URL, ID, Date string }

// Choose the majority, except when the newest three dated observations agree.
// Input is ordered by upload date descending, then path for deterministic ties.
func preferredCollectionValue(rows []collectionObservation, value func(collectionObservation) string) string {
	counts := map[string]int{}
	first := map[string]int{}
	var recent []string
	for i, row := range rows {
		v := strings.TrimSpace(value(row))
		if v == "" {
			continue
		}
		if counts[v] == 0 {
			first[v] = i
		}
		counts[v]++
		if len(recent) < 3 && validUploadDate(row.Date) {
			recent = append(recent, v)
		}
	}
	if len(recent) == 3 && recent[0] == recent[1] && recent[1] == recent[2] {
		return recent[0]
	}
	best := ""
	for v, n := range counts {
		if n > counts[best] || n == counts[best] && first[v] < first[best] {
			best = v
		}
	}
	return best
}

func (s *indexJob) refreshCollections() error {
	ctx := context.Background()
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT parent_path, COALESCE(meta_artist,''), channel_url, channel_id, COALESCE(upload_date,'')
 FROM audio_files WHERE deleted=0 ORDER BY upload_date DESC NULLS LAST, path`)
	if err != nil {
		return err
	}
	groups := map[string][]collectionObservation{}
	for rows.Next() {
		var parent string
		var o collectionObservation
		if err := rows.Scan(&parent, &o.Name, &o.URL, &o.ID, &o.Date); err != nil {
			rows.Close()
			return err
		}
		parts := strings.Split(parent, "/")
		if len(parts) < 2 {
			continue
		}
		path := strings.Join(parts[:2], "/")
		groups[path] = append(groups[path], o)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	paths := make([]string, 0, len(groups))
	for path := range groups {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	for _, path := range paths {
		observations := groups[path]
		name := preferredCollectionValue(observations, func(o collectionObservation) string { return o.Name })
		if name == "" {
			name = strings.Split(path, "/")[1]
		}
		channelURL := preferredCollectionValue(observations, func(o collectionObservation) string {
			if _, err := channelHostname(o.URL); err != nil {
				return ""
			}
			return o.URL
		})
		var id int64
		if err := tx.QueryRowContext(ctx, `INSERT INTO collections(path,name,channel_url) VALUES($1,$2,$3)
   ON CONFLICT(path) DO UPDATE SET name=excluded.name,channel_url=excluded.channel_url RETURNING id`, path, name, channelURL).Scan(&id); err != nil {
			return err
		}
		names, keys := map[string]bool{}, map[string]bool{}
		for _, o := range observations {
			if o.Name != "" {
				names[o.Name] = true
			}
			if key, err := SourceIdentity(o.URL, o.ID); err == nil {
				keys[key] = true
				keys["url:"+strings.TrimRight(o.URL, "/")] = true
			}
		}
		for alias := range names {
			if _, err := tx.ExecContext(ctx, `INSERT INTO collection_names VALUES($1,$2) ON CONFLICT DO NOTHING`, id, alias); err != nil {
				return err
			}
		}
		for key := range keys {
			if _, err := tx.ExecContext(ctx, `INSERT INTO collection_keys VALUES($1,$2) ON CONFLICT DO NOTHING`, id, key); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE folders SET name=$2,original_url=$3 WHERE path=$1`, path, name, channelURL); err != nil {
			return err
		}

	}
	if _, err := tx.ExecContext(ctx, `UPDATE audio_files SET source_path=split_part(parent_path,'/',1) || '/' || split_part(parent_path,'/',2)
     WHERE position('/' in parent_path)>0 AND source_path IS DISTINCT FROM split_part(parent_path,'/',1) || '/' || split_part(parent_path,'/',2)`); err != nil {
		return err
	}
	// Empty directories have no browse entry; wrapper directories with audio
	// descendants remain. Deferred scans retain their previous active records.
	if _, err := tx.ExecContext(ctx, `DELETE FROM folders f WHERE NOT EXISTS (
  SELECT 1 FROM audio_files a WHERE a.deleted=0 AND (a.parent_path=f.path OR starts_with(a.parent_path,f.path || '/')))`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE source_requests sr SET collection_id=matches.collection_id FROM (
  SELECT sr2.id, MIN(k.collection_id) collection_id FROM source_requests sr2 JOIN collection_keys k
  ON k.key=sr2.source_key OR k.key='url:' || RTRIM(sr2.submitted_url,'/')
  JOIN collections c ON c.id=k.collection_id JOIN folders f ON f.path=c.path
  GROUP BY sr2.id HAVING COUNT(DISTINCT k.collection_id)=1
 ) matches WHERE sr.id=matches.id AND (sr.collection_id IS NULL OR NOT EXISTS (
   SELECT 1 FROM collections c JOIN folders f ON f.path=c.path WHERE c.id=sr.collection_id
 ))`); err != nil {
		return err
	}
	// Preserve earlier request keys alongside the new identities. A renamed
	// account's old request must continue to reach the same archive collection.
	if _, err := tx.ExecContext(ctx, `INSERT INTO collection_keys SELECT collection_id,source_key FROM source_requests
  WHERE collection_id IS NOT NULL AND NULLIF(source_key,'') IS NOT NULL ON CONFLICT DO NOTHING`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE source_requests sr SET status='added',updated_at=CURRENT_TIMESTAMP
     FROM collections c JOIN folders f ON f.path=c.path
     WHERE sr.collection_id=c.id AND sr.status='indexing'
     AND NOT EXISTS (
       SELECT 1 FROM unnest($1::text[]) AS deferred(path)
       WHERE deferred.path=c.path OR starts_with(deferred.path,c.path || '/')
     )`, s.deferredFolders); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE folders SET item_count=(SELECT COUNT(*) FROM folders child WHERE starts_with(child.path,folders.path || '/')) +
     (SELECT COUNT(*) FROM audio_files a WHERE a.deleted=0 AND (a.parent_path=folders.path OR starts_with(a.parent_path,folders.path || '/')))`); err != nil {
		return err
	}
	return tx.Commit()
}

func validUploadDate(value string) bool {
	_, err := time.Parse("20060102", value)
	return len(value) == 8 && err == nil
}

// normalizedUploadDateSQL returns a calendar-valid YYYYMMDD value or SQL NULL.
// Column names are supplied by query builders, never by request input.
func normalizedUploadDateSQL(column string) string {
	return fmt.Sprintf(`CASE WHEN %[1]s ~ '^[0-9]{8}$' AND pg_input_is_valid(
  substr(%[1]s,1,4) || '-' || substr(%[1]s,5,2) || '-' || substr(%[1]s,7,2), 'date')
  THEN %[1]s END`, column)
}
