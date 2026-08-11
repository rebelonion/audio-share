package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/onion/audio-share-backend/services"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
)

const (
	maxSnapshotItems       = 100
	maxInitialResponseSize = 512 * 1024
)

type snapshotSearchService interface {
	directoryBrowser
	statsService
	searchExecutor
}

type snapshotRequestsService interface {
	GetAllGroupedByStatus() (*services.RequestsByStatus, error)
}

type snapshotPage struct {
	SiteTitle       string
	SiteDescription string
	Body            template.HTML
}

type snapshotLink struct {
	Name        string
	URL         string
	Description string
}

type snapshotListPage struct {
	Heading     string
	Description string
	Items       []snapshotLink
	MoreItems   int
}

type initialResponse struct {
	Status int             `json:"status"`
	Body   json.RawMessage `json:"body"`
}

type initialResponses map[string]initialResponse

var snapshotShellTemplate = template.Must(template.New("snapshot-shell").Parse(`
<div data-server-snapshot>
  <header class="bg-[var(--card)] border-b border-[var(--border)]">
    <div class="px-4 sm:px-6 lg:px-8 py-4">
      <a href="/" class="text-xl font-semibold text-[var(--foreground)]">{{.SiteTitle}}</a>
      <nav aria-label="Primary" class="mt-3 flex flex-wrap gap-4">
        <a href="/likes">Likes</a>
        <a href="/about">About</a>
        <a href="/stats">Stats</a>
        <a href="/requests">Requests</a>
        <a href="/contact">Contact</a>
      </nav>
    </div>
  </header>
  <main class="w-full px-4 sm:px-6 lg:px-8 py-8">
    <aside class="max-w-4xl mx-auto mb-6 p-4 border border-[var(--border)] rounded-lg" aria-label="Limited site notice">
      <p><strong>This is the limited, read-only version of the site.</strong> Enable JavaScript to play audio and use the full interactive experience.</p>
    </aside>
    {{.Body}}
  </main>
  <footer class="px-4 sm:px-6 lg:px-8 py-5 border-t border-[var(--border)]">
    <p>{{.SiteDescription}}</p>
  </footer>
</div>`))

var snapshotListTemplate = template.Must(template.New("snapshot-list").Parse(`
<article class="max-w-4xl mx-auto">
  <h1 class="text-4xl font-bold mb-4 text-[var(--foreground)]">{{.Heading}}</h1>
  {{if .Description}}<p class="text-[var(--muted-foreground)] mb-6">{{.Description}}</p>{{end}}
  {{if .Items}}
    <ul class="space-y-3">
      {{range .Items}}
        <li>
          {{if .URL}}<a href="{{.URL}}" class="text-[var(--primary)]">{{.Name}}</a>{{else}}<span>{{.Name}}</span>{{end}}
          {{if .Description}}<p class="text-sm text-[var(--muted-foreground)]">{{.Description}}</p>{{end}}
        </li>
      {{end}}
    </ul>
    {{if .MoreItems}}<p class="mt-6 text-sm text-[var(--muted-foreground)]">{{.MoreItems}} more items are available in the interactive site.</p>{{end}}
  {{else}}
    <p>No items are available.</p>
  {{end}}
</article>`))

var snapshotMarkdown = goldmark.New(goldmark.WithExtensions(extension.GFM))

func executeSnapshotTemplate(t *template.Template, data any) template.HTML {
	var output bytes.Buffer
	if err := t.Execute(&output, data); err != nil {
		log.Printf("server snapshot template failed: %v", err)
		return ""
	}
	return template.HTML(output.String())
}

func (responses initialResponses) add(path string, status int, body any) {
	data, err := json.Marshal(body)
	if err != nil {
		log.Printf("server initial data marshal failed for %q: %v", path, err)
		return
	}
	if len(data) > maxInitialResponseSize {
		return
	}
	responses[path] = initialResponse{Status: status, Body: data}
}

func renderInitialResponses(responses initialResponses) string {
	if len(responses) == 0 {
		return ""
	}
	data, err := json.Marshal(responses)
	if err != nil {
		log.Printf("server initial data script failed: %v", err)
		return ""
	}
	return `<script id="server-initial-data" type="application/json">` + string(data) + `</script>`
}

func cappedSnapshotItems(total int) (int, int) {
	if total <= maxSnapshotItems {
		return total, 0
	}
	return maxSnapshotItems, total - maxSnapshotItems
}

func (h *SPAHandler) renderPageSnapshot(r *http.Request, meta pageMeta, shareRow *audioRow, shareLookupErr error) (string, string) {
	responses := initialResponses{}
	body := h.renderSnapshotBody(r, meta, shareRow, shareLookupErr, responses)
	page := snapshotPage{
		SiteTitle:       h.config.DefaultTitle,
		SiteDescription: h.config.DefaultDescription,
		Body:            body,
	}
	return string(executeSnapshotTemplate(snapshotShellTemplate, page)), renderInitialResponses(responses)
}

func (h *SPAHandler) renderSnapshotBody(r *http.Request, meta pageMeta, shareRow *audioRow, shareLookupErr error, responses initialResponses) template.HTML {
	path := strings.TrimSuffix(r.URL.Path, "/")
	if path == "" || path == "/index.html" {
		return h.renderDirectorySnapshot("", h.config.DefaultTitle, h.config.DefaultDescription, responses)
	}

	switch {
	case path == "/about":
		return h.renderAboutSnapshot(responses)
	case path == "/contact":
		return executeSnapshotTemplate(snapshotListTemplate, snapshotListPage{
			Heading:     "Contact us",
			Description: "Send us a comment, question, or report. The interactive contact form is available when JavaScript is enabled.",
		})
	case path == "/stats":
		return h.renderStatsSnapshot(responses)
	case path == "/requests":
		return h.renderRequestsSnapshot(responses)
	case path == "/search":
		return h.renderSearchSnapshot(r, responses)
	case path == "/likes":
		return executeSnapshotTemplate(snapshotListTemplate, snapshotListPage{
			Heading:     "Your likes",
			Description: "Liked tracks are tied to an anonymous browser profile and are available when JavaScript is enabled.",
		})
	case path == "/recover":
		return executeSnapshotTemplate(snapshotListTemplate, snapshotListPage{
			Heading:     "Recover your likes",
			Description: "Use a recovery key in the interactive application to restore an anonymous profile and its liked tracks.",
		})
	case isBrowseRoute(path):
		browsePath := strings.Trim(strings.TrimPrefix(path, "/browse"), "/")
		heading := "Root"
		if browsePath != "" {
			segments := strings.Split(browsePath, "/")
			heading = segments[len(segments)-1]
		}
		return h.renderDirectorySnapshot(browsePath, heading, "Browse audio and folders in this collection.", responses)
	case strings.HasPrefix(path, "/share/"):
		key, _ := shareKeyFromPath(path)
		return h.renderShareSnapshot(r, key, meta, shareRow, shareLookupErr, responses)
	default:
		return executeSnapshotTemplate(snapshotListTemplate, snapshotListPage{
			Heading:     "Page not found",
			Description: "The page you are looking for does not exist or has been moved.",
			Items:       []snapshotLink{{Name: "Back to home", URL: "/"}},
		})
	}
}

func (h *SPAHandler) renderAboutSnapshot(responses initialResponses) template.HTML {
	content := []byte("# About\n\nPlease create a `content/about.md` file to customize this page.")
	if h.contentDir != "" {
		if fileContent, err := os.ReadFile(filepath.Join(h.contentDir, "about.md")); err == nil {
			content = fileContent
		}
	}
	responses.add("/api/about", http.StatusOK, map[string]string{"content": string(content)})

	var output bytes.Buffer
	if err := snapshotMarkdown.Convert(content, &output); err != nil {
		log.Printf("server snapshot markdown failed: %v", err)
		return executeSnapshotTemplate(snapshotListTemplate, snapshotListPage{Heading: "About"})
	}
	return template.HTML(`<article class="snapshot-markdown max-w-4xl mx-auto">` + output.String() + `</article>`)
}

func browseAPIPath(path string) string {
	if path == "" {
		return "/api/browse"
	}
	return "/api/browse/" + encodePath(path)
}

func (h *SPAHandler) renderDirectorySnapshot(path, heading, description string, responses initialResponses) template.HTML {
	page := snapshotListPage{Heading: heading, Description: description}
	if h.searchService == nil {
		return executeSnapshotTemplate(snapshotListTemplate, page)
	}

	contents, err := browseDirectoryContents(h.searchService, path)
	if err != nil {
		log.Printf("server snapshot browse failed for %q: %v", path, err)
		return executeSnapshotTemplate(snapshotListTemplate, page)
	}
	responses.add(browseAPIPath(path), http.StatusOK, contents)
	limit, more := cappedSnapshotItems(len(contents.Items))
	page.MoreItems = more
	for _, item := range contents.Items[:limit] {
		name := item.Title
		if name == "" {
			name = item.Name
		}
		link := snapshotLink{Name: name, Description: item.ModifiedAt}
		if item.Type == "folder" {
			link.URL = "/browse/" + encodePath(item.Path)
		} else if item.ShareKey != "" {
			link.URL = "/share/" + url.PathEscape(item.ShareKey)
		}
		page.Items = append(page.Items, link)
	}
	return executeSnapshotTemplate(snapshotListTemplate, page)
}

func (h *SPAHandler) renderStatsSnapshot(responses initialResponses) template.HTML {
	page := snapshotListPage{
		Heading:     "Statistics",
		Description: "Summary statistics for this audio collection.",
	}
	if h.searchService == nil {
		return executeSnapshotTemplate(snapshotListTemplate, page)
	}

	stats, err := loadStats(h.searchService)
	if err != nil {
		log.Printf("server snapshot stats failed: %v", err)
		return executeSnapshotTemplate(snapshotListTemplate, page)
	}
	responses.add("/api/stats", http.StatusOK, stats)
	page.Items = []snapshotLink{
		{Name: "Total files", Description: fmt.Sprintf("%d", stats.Summary.TotalFiles)},
		{Name: "Total sources", Description: fmt.Sprintf("%d", stats.Summary.TotalSources)},
		{Name: "Total duration", Description: formatSnapshotDuration(stats.Summary.TotalDuration)},
		{Name: "Storage used", Description: formatSnapshotStorage(stats.Summary.TotalStorage)},
		{Name: "Unavailable", Description: fmt.Sprintf("%d", stats.Summary.TotalUnavailable)},
	}
	return executeSnapshotTemplate(snapshotListTemplate, page)
}

func (h *SPAHandler) renderRequestsSnapshot(responses initialResponses) template.HTML {
	page := snapshotListPage{
		Heading:     "Source requests",
		Description: "Public requests for sources to add to this audio collection.",
	}
	if h.requestsService == nil {
		return executeSnapshotTemplate(snapshotListTemplate, page)
	}

	requests, err := h.requestsService.GetAllGroupedByStatus()
	if err != nil {
		log.Printf("server snapshot requests failed: %v", err)
		return executeSnapshotTemplate(snapshotListTemplate, page)
	}
	responses.add("/api/requests", http.StatusOK, requests)
	groups := []struct {
		label string
		items []services.SourceRequest
	}{
		{"Requested", requests.Requested},
		{"Downloading", requests.Downloading},
		{"Indexing", requests.Indexing},
		{"Added", requests.Added},
		{"Rejected", requests.Rejected},
	}
	total := 0
	for _, group := range groups {
		total += len(group.items)
	}
	limit, more := cappedSnapshotItems(total)
	page.MoreItems = more
	for _, group := range groups {
		for _, request := range group.items {
			if len(page.Items) == limit {
				return executeSnapshotTemplate(snapshotListTemplate, page)
			}
			description := group.label
			if len(request.CreatedAt) >= 10 {
				description += " · " + request.CreatedAt[:10]
			}
			page.Items = append(page.Items, snapshotLink{
				Name:        request.Title,
				URL:         request.SubmittedURL,
				Description: description,
			})
		}
	}
	return executeSnapshotTemplate(snapshotListTemplate, page)
}

func searchAPIValuesFromPage(values url.Values) (url.Values, bool) {
	apiValues := url.Values{"q": {values.Get("q")}, "limit": {strconv.Itoa(maxSearchLimit)}}
	hasSearch := len(values.Get("q")) >= 2
	if page, err := strconv.Atoi(values.Get("page")); err == nil && page > 1 {
		apiValues.Set("offset", strconv.Itoa((page-1)*maxSearchLimit))
	}
	if value := values.Get("type"); value == "audio" || value == "folder" {
		apiValues.Set("type", value)
		hasSearch = true
	}
	for _, key := range []string{"dateFrom", "dateTo"} {
		if value := values.Get(key); value != "" {
			apiValues.Set(key, value)
			hasSearch = true
		}
	}
	if value := values.Get("sort"); value == "name_asc" || value == "name_desc" || value == "date_asc" || value == "date_desc" {
		apiValues.Set("sort", value)
		hasSearch = true
	}
	for _, key := range []string{"durationMin", "durationMax"} {
		if value := values.Get(key); value != "" {
			if parsed, err := strconv.ParseFloat(value, 64); err == nil && parsed > 0 {
				apiValues.Set(key, value)
				hasSearch = true
			}
		}
	}
	if value := values.Get("fields"); value != "" {
		valid := map[string]bool{"filename": true, "title": true, "artist": true, "description": true}
		fields := make([]string, 0, 4)
		for _, field := range strings.Split(value, ",") {
			if valid[field] {
				fields = append(fields, field)
			}
		}
		if len(fields) > 0 {
			apiValues.Set("fields", strings.Join(fields, ","))
			hasSearch = true
		}
	}
	if value := values.Get("root"); value != "" {
		apiValues.Set("root", value)
		hasSearch = true
	}
	for _, key := range []string{"unavailableOnly", "includeMature"} {
		if values.Get(key) == "true" {
			apiValues.Set(key, "true")
			hasSearch = true
		}
	}
	return apiValues, hasSearch
}

func (h *SPAHandler) renderSearchSnapshot(r *http.Request, responses initialResponses) template.HTML {
	page := snapshotListPage{
		Heading:     "Search",
		Description: "Search this audio collection by filename, title, artist, or description.",
	}
	if h.searchService == nil {
		return executeSnapshotTemplate(snapshotListTemplate, page)
	}
	values, hasSearch := searchAPIValuesFromPage(r.URL.Query())
	if !hasSearch {
		return executeSnapshotTemplate(snapshotListTemplate, page)
	}
	response, err := searchResponseForValues(h.searchService, values)
	if err != nil {
		log.Printf("server snapshot search failed: %v", err)
		return executeSnapshotTemplate(snapshotListTemplate, page)
	}
	responses.add("/api/search?"+values.Encode(), http.StatusOK, response)
	page.Description = fmt.Sprintf("%d results for %q.", response.Total, response.Query)
	limit, more := cappedSnapshotItems(len(response.Results))
	page.MoreItems = more
	for _, result := range response.Results[:limit] {
		link := snapshotLink{Name: result.Name, Description: result.Artist}
		if result.Type == "folder" {
			link.URL = "/browse/" + encodePath(result.Path)
		} else if result.ShareKey != "" {
			link.URL = "/share/" + url.PathEscape(result.ShareKey)
		}
		page.Items = append(page.Items, link)
	}
	return executeSnapshotTemplate(snapshotListTemplate, page)
}

func (h *SPAHandler) renderShareSnapshot(r *http.Request, key string, meta pageMeta, row *audioRow, lookupErr error, responses initialResponses) template.HTML {
	apiPath := "/api/audio/key/" + key + "/meta"
	if row != nil {
		responses.add(apiPath, http.StatusOK, audioMetaFromRow(r, h.sessionSecret, row))
	} else if errors.Is(lookupErr, sql.ErrNoRows) {
		responses.add(apiPath, http.StatusNotFound, map[string]string{"error": "Not found"})
	}

	page := snapshotListPage{Heading: meta.h1, Description: meta.description}
	if row == nil || row.deleted || key == "" || meta.notFound {
		return executeSnapshotTemplate(snapshotListTemplate, page)
	}
	page.Heading = filepath.Base(row.path)
	if row.title.Valid && row.title.String != "" {
		page.Heading = row.title.String
	}
	if row.artist.Valid && row.artist.String != "" {
		page.Description = "By " + row.artist.String
	}
	if !row.isMature() && row.description.Valid && row.description.String != "" {
		page.Items = append(page.Items, snapshotLink{Name: "Description", Description: row.description.String})
	}
	if row.uploadDate.Valid && row.uploadDate.String != "" {
		page.Items = append(page.Items, snapshotLink{Name: "Published", Description: row.uploadDate.String})
	}
	if row.parentPath.Valid && row.parentPath.String != "" {
		page.Items = append(page.Items, snapshotLink{Name: "Browse parent folder", URL: "/browse/" + encodePath(row.parentPath.String)})
	}
	if row.webpageURL.Valid && row.webpageURL.String != "" {
		page.Items = append(page.Items, snapshotLink{Name: "Original source", URL: row.webpageURL.String})
	}
	return executeSnapshotTemplate(snapshotListTemplate, page)
}

func formatSnapshotDuration(seconds float64) string {
	if seconds >= 365*24*60*60 {
		return fmt.Sprintf("%.1f years", seconds/(365*24*60*60))
	}
	if seconds >= 24*60*60 {
		return fmt.Sprintf("%.1f days", seconds/(24*60*60))
	}
	return fmt.Sprintf("%.1f hours", seconds/(60*60))
}

func formatSnapshotStorage(bytes int64) string {
	switch {
	case bytes >= 1_000_000_000_000:
		return fmt.Sprintf("%.1f TB", float64(bytes)/1_000_000_000_000)
	case bytes >= 1_000_000_000:
		return fmt.Sprintf("%.1f GB", float64(bytes)/1_000_000_000)
	case bytes >= 1_000_000:
		return fmt.Sprintf("%.1f MB", float64(bytes)/1_000_000)
	default:
		return fmt.Sprintf("%.1f KB", float64(bytes)/1_000)
	}
}
