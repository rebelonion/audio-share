package services

type AudioDayStat struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type AudioStats struct {
	Total int            `json:"total"`
	Days  []AudioDayStat `json:"days"`
}

type SourceDayStat struct {
	Date    string   `json:"date"`
	Count   int      `json:"count"`
	Sources []string `json:"sources"`
}

type SourcesStats struct {
	Total int             `json:"total"`
	Days  []SourceDayStat `json:"days"`
}

func (s *SearchService) GetAudioStats() (*AudioStats, error) {
	rows, err := s.db.DB().Query(`
		SELECT DATE(downloaded_at) as date, COUNT(*) as count
		FROM audio_files
		WHERE downloaded_at IS NOT NULL
		GROUP BY date
		ORDER BY date
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
		SELECT DATE(s.first_seen) as date, f.name as source_name
		FROM (
			SELECT source_path, MIN(downloaded_at) as first_seen
			FROM audio_files
			WHERE downloaded_at IS NOT NULL AND source_path IS NOT NULL
			GROUP BY source_path
		) s
		JOIN folders f ON f.path = s.source_path
		ORDER BY date, source_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dayMap := make(map[string][]string)
	var dateOrder []string
	for rows.Next() {
		var date, sourceName string
		if err := rows.Scan(&date, &sourceName); err != nil {
			return nil, err
		}
		if _, exists := dayMap[date]; !exists {
			dateOrder = append(dateOrder, date)
		}
		dayMap[date] = append(dayMap[date], sourceName)
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
