package services

type TrackSummary struct {
	ShareKey         string  `json:"shareKey"`
	Path             string  `json:"path"`
	Filename         string  `json:"filename"`
	Title            *string `json:"title"`
	Artist           *string `json:"artist"`
	ParentPath       *string `json:"parentPath"`
	ParentFolderName *string `json:"parentFolderName"`
	ParentShareKey   *string `json:"parentShareKey"`
	AudioImage       *string `json:"audioImage"`
	PosterImage      *string `json:"posterImage"`
	AgeLimit         *int    `json:"ageLimit,omitempty"`
}
