package services

type SummaryStats struct {
	TotalFiles       int     `json:"totalFiles"`
	TotalSources     int     `json:"totalSources"`
	TotalDuration    float64 `json:"totalDuration"`
	TotalStorage     int64   `json:"totalStorage"`
	TotalUnavailable int     `json:"totalUnavailable"`
}

func (s *SearchService) GetSummaryStats() (*SummaryStats, error) {
	var stats SummaryStats

	if err := s.db.DB().QueryRow(`SELECT COUNT(*) FROM audio_files WHERE deleted = 0`).Scan(&stats.TotalFiles); err != nil {
		return nil, err
	}
	if err := s.db.DB().QueryRow(`
		SELECT COUNT(DISTINCT af.source_path)
		FROM audio_files af
		JOIN folders f ON f.path = af.source_path
		WHERE af.source_path IS NOT NULL AND af.deleted = 0
	`).Scan(&stats.TotalSources); err != nil {
		return nil, err
	}
	if err := s.db.DB().QueryRow(`
		SELECT COALESCE(SUM(wc.duration_seconds), 0)
		FROM waveform_cache wc
		JOIN audio_files af ON af.id = wc.audio_file_id
		WHERE af.deleted = 0
	`).Scan(&stats.TotalDuration); err != nil {
		return nil, err
	}
	if err := s.db.DB().QueryRow(`SELECT COALESCE(SUM(size), 0) FROM audio_files WHERE deleted = 0`).Scan(&stats.TotalStorage); err != nil {
		return nil, err
	}
	if err := s.db.DB().QueryRow(`SELECT COUNT(*) FROM audio_files WHERE unavailable_at IS NOT NULL AND deleted = 0`).Scan(&stats.TotalUnavailable); err != nil {
		return nil, err
	}

	return &stats, nil
}

type AudioDayStat struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type AudioStats struct {
	Total int            `json:"total"`
	Days  []AudioDayStat `json:"days"`
}

type SourceEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type SourceDayStat struct {
	Date    string        `json:"date"`
	Count   int           `json:"count"`
	Sources []SourceEntry `json:"sources"`
}

type SourcesStats struct {
	Total int             `json:"total"`
	Days  []SourceDayStat `json:"days"`
}

type DurationBucket struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

type DurationStats struct {
	Buckets []DurationBucket `json:"buckets"`
}

type YearStat struct {
	Year  string `json:"year"`
	Count int    `json:"count"`
}

type PublicationYearStats struct {
	Years []YearStat `json:"years"`
}

type SourceAvailability struct {
	Name        string  `json:"name"`
	Path        string  `json:"path"`
	Total       int     `json:"total"`
	Unavailable int     `json:"unavailable"`
	Ratio       float64 `json:"ratio"`
}

type SourceAvailabilityStats struct {
	Sources []SourceAvailability `json:"sources"`
}

func (s *SearchService) GetAudioStats() (*AudioStats, error) {
	rows, err := s.db.DB().Query(`
		SELECT LEFT(downloaded_at, 10) as day, COUNT(*) as count
		FROM audio_files
		WHERE downloaded_at IS NOT NULL AND deleted = 0
		  AND LEFT(downloaded_at, 4) BETWEEN '1970' AND '2100'
		GROUP BY 1
		ORDER BY 1
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats AudioStats
	for rows.Next() {
		var day AudioDayStat
		if err := rows.Scan(&day.Date, &day.Count); err != nil {
			return nil, err
		}
		stats.Total += day.Count
		stats.Days = append(stats.Days, day)
	}

	if stats.Days == nil {
		stats.Days = []AudioDayStat{}
	}

	return &stats, nil
}

func (s *SearchService) GetSourcesStats() (*SourcesStats, error) {
	rows, err := s.db.DB().Query(`
		SELECT LEFT(s.first_seen, 10) as day, f.name as source_name, f.path as source_path
		FROM (
			SELECT source_path, MIN(downloaded_at) as first_seen
			FROM audio_files
			WHERE downloaded_at IS NOT NULL AND source_path IS NOT NULL AND deleted = 0
			GROUP BY source_path
		) s
		JOIN folders f ON f.path = s.source_path
		ORDER BY 1, source_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dayMap := make(map[string][]SourceEntry)
	var dateOrder []string
	for rows.Next() {
		var date, sourceName, sourcePath string
		if err := rows.Scan(&date, &sourceName, &sourcePath); err != nil {
			return nil, err
		}
		if _, exists := dayMap[date]; !exists {
			dateOrder = append(dateOrder, date)
		}
		dayMap[date] = append(dayMap[date], SourceEntry{Name: sourceName, Path: sourcePath})
	}

	stats := SourcesStats{
		Days: make([]SourceDayStat, 0, len(dateOrder)),
	}
	for _, date := range dateOrder {
		sources := dayMap[date]
		stats.Total += len(sources)
		stats.Days = append(stats.Days, SourceDayStat{
			Date:    date,
			Count:   len(sources),
			Sources: sources,
		})
	}

	return &stats, nil
}

func (s *SearchService) GetDurationStats() (*DurationStats, error) {
	rows, err := s.db.DB().Query(`
		SELECT
			CASE
				WHEN wc.duration_seconds < 300   THEN '0–5m'
				WHEN wc.duration_seconds < 900   THEN '5–15m'
				WHEN wc.duration_seconds < 1800  THEN '15–30m'
				WHEN wc.duration_seconds < 3600  THEN '30m–1h'
				WHEN wc.duration_seconds < 7200  THEN '1–2h'
				WHEN wc.duration_seconds < 14400 THEN '2–4h'
				ELSE '4h+'
			END as bucket,
			CASE
				WHEN wc.duration_seconds < 300   THEN 1
				WHEN wc.duration_seconds < 900   THEN 2
				WHEN wc.duration_seconds < 1800  THEN 3
				WHEN wc.duration_seconds < 3600  THEN 4
				WHEN wc.duration_seconds < 7200  THEN 5
				WHEN wc.duration_seconds < 14400 THEN 6
				ELSE 7
			END as bucket_order,
			COUNT(*) as count
		FROM waveform_cache wc
		JOIN audio_files af ON af.id = wc.audio_file_id
		WHERE af.deleted = 0
		GROUP BY bucket, bucket_order
		ORDER BY bucket_order
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats := &DurationStats{Buckets: []DurationBucket{}}
	for rows.Next() {
		var b DurationBucket
		var order int
		if err := rows.Scan(&b.Label, &order, &b.Count); err != nil {
			return nil, err
		}
		stats.Buckets = append(stats.Buckets, b)
	}
	return stats, nil
}

func (s *SearchService) GetPublicationYearStats() (*PublicationYearStats, error) {
	rows, err := s.db.DB().Query(`
		SELECT LEFT(upload_date, 4) as year, COUNT(*) as count
		FROM audio_files
		WHERE upload_date IS NOT NULL AND upload_date != ''
		  AND deleted = 0
		  AND LEFT(upload_date, 4) BETWEEN '1970' AND '2100'
		GROUP BY year
		ORDER BY year
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats := &PublicationYearStats{Years: []YearStat{}}
	for rows.Next() {
		var y YearStat
		if err := rows.Scan(&y.Year, &y.Count); err != nil {
			return nil, err
		}
		stats.Years = append(stats.Years, y)
	}
	return stats, nil
}

func (s *SearchService) GetSourceAvailabilityStats() (*SourceAvailabilityStats, error) {
	rows, err := s.db.DB().Query(`
		SELECT
			f.name,
			f.path,
			COUNT(*) as total,
			COUNT(CASE WHEN af.unavailable_at IS NOT NULL THEN 1 END) as unavailable
		FROM audio_files af
		JOIN folders f ON f.path = af.source_path
		WHERE af.source_path IS NOT NULL AND af.deleted = 0
		GROUP BY f.name, f.path
		HAVING COUNT(*) >= 3
		ORDER BY total DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats := &SourceAvailabilityStats{Sources: []SourceAvailability{}}
	for rows.Next() {
		var sa SourceAvailability
		if err := rows.Scan(&sa.Name, &sa.Path, &sa.Total, &sa.Unavailable); err != nil {
			return nil, err
		}
		if sa.Total > 0 {
			sa.Ratio = float64(sa.Unavailable) / float64(sa.Total)
		}
		stats.Sources = append(stats.Sources, sa)
	}
	return stats, nil
}
