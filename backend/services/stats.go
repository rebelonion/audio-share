package services

type SummaryStats struct {
	TotalFiles    int     `json:"totalFiles"`
	TotalSources  int     `json:"totalSources"`
	TotalDuration float64 `json:"totalDuration"`
	TotalStorage  int64   `json:"totalStorage"`
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

func (s *SearchService) GetAudioStats() (*AudioStats, error) {
	rows, err := s.db.DB().Query(`
		SELECT LEFT(downloaded_at, 10) as day, COUNT(*) as count
		FROM audio_files
		WHERE downloaded_at IS NOT NULL AND deleted = 0
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
