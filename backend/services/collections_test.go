package services

import (
	"context"
	"testing"
)

func TestCollectionIdentityAndRecentTrend(t *testing.T) {
	key, err := SourceIdentity("https://media.example/creator/renamed", "123")
	if err != nil || key != "media.example:123" {
		t.Fatalf("%q %v", key, err)
	}
	for _, u := range []string{"/relative", "ftp://media.example/a", "https://user@media.example/a"} {
		if _, err := SourceIdentity(u, "123"); err == nil {
			t.Fatalf("accepted %s", u)
		}
	}
	rows := []collectionObservation{{Name: "New", Date: "20261003"}, {Name: "New", Date: "20261002"}, {Name: "New", Date: "20261001"}}
	for range 10 {
		rows = append(rows, collectionObservation{Name: "Old", Date: "20250101"})
	}
	name := func(o collectionObservation) string { return o.Name }
	if got := preferredCollectionValue(rows, name); got != "New" {
		t.Fatal(got)
	}
	rows[1].Name = "Old"
	if got := preferredCollectionValue(rows, name); got != "Old" {
		t.Fatal(got)
	}
	rows[1].Name = "New"
	rows[0].Date = ""
	if got := preferredCollectionValue(rows, name); got != "Old" {
		t.Fatal(got)
	}
}

func TestIntegrationCollectionsAliasesRequestsAndEmptyWrappers(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	_, err := db.db.Exec(`INSERT INTO folders(path,parent_path,folder_name,name,share_key,original_url,poster_image,upload_date) VALUES
 ('root','','root','Root','root-key','','',''),
 ('root/creator','root','creator','Disk label','creator-key','','',''),
 ('root/creator/year','root/creator','year','Year','year-key','','',''),
 ('root/empty','root','empty','Empty','empty-key','','','');
 INSERT INTO audio_files(path,parent_path,filename,meta_artist,channel_id,channel_url,upload_date,share_key) VALUES
 ('root/creator/year/1','root/creator/year','1','New','123','https://example.com/new','20260103','one'),
 ('root/creator/year/2','root/creator/year','2','New','123','https://example.com/new','20260102','two'),
 ('root/creator/year/3','root/creator/year','3','New','123','https://example.com/new','20260101','three'),
 ('root/creator/year/4','root/creator/year','4','Old','123','https://example.com/old','20250101','four');
 INSERT INTO source_requests(submitted_url,source_key,title,status) VALUES ('https://example.com/old','example.com:123','Old request','added'), ('https://example.com/new','legacy-downloading','Still downloading','downloading')`)
	if err != nil {
		t.Fatal(err)
	}
	conn, err := db.db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	job := indexJob{conn: conn}
	if err := job.refreshCollections(); err != nil {
		t.Fatal(err)
	}
	if err := job.refreshCollections(); err != nil {
		t.Fatal(err)
	}
	var name string
	if err := db.db.QueryRow(`SELECT name FROM folders WHERE path='root/creator'`).Scan(&name); err != nil || name != "New" {
		t.Fatalf("%s %v", name, err)
	}
	var count int
	db.db.QueryRow(`SELECT count(*) FROM folders`).Scan(&count)
	if count != 3 {
		t.Fatal(count)
	}
	search := NewSearchService(db, nil, nil)
	_, total, err := search.Search("Old", 50, 0, SearchOptions{Fields: []string{"artist"}})
	if err != nil || total != 5 {
		t.Fatalf("total %d %v", total, err)
	}
	browse, err := search.BrowseDirectory("root")
	if err != nil {
		t.Fatal(err)
	}
	if len(browse.Items) != 1 || len(browse.Items[0].Metadata.Aliases) != 2 {
		t.Fatalf("%+v", browse)
	}
	req := NewRequestsService(db)
	all, err := req.GetAllGroupedByStatus()
	if err != nil {
		t.Fatal(err)
	}
	if all.Added[0].FolderPath == nil || *all.Added[0].FolderPath != "root/creator" {
		t.Fatalf("%+v", all)
	}
	if len(all.Downloading) != 0 || len(all.Added) != 2 {
		t.Fatalf("indexing must mark a matched download added: %+v", all)
	}
	// A retained collection from a removed directory must not hide its replacement.
	if _, err := db.db.Exec(`INSERT INTO collections(path,name) VALUES ('root/removed','Old location');
 INSERT INTO collection_keys SELECT id,'url:https://example.com/old' FROM collections WHERE path='root/removed';
 UPDATE source_requests SET collection_id=(SELECT id FROM collections WHERE path='root/removed') WHERE status='added'`); err != nil {
		t.Fatal(err)
	}
	if err := job.refreshCollections(); err != nil {
		t.Fatal(err)
	}
	all, err = req.GetAllGroupedByStatus()
	if err != nil || all.Added[0].FolderPath == nil || *all.Added[0].FolderPath != "root/creator" {
		t.Fatalf("replacement collection not linked: %+v %v", all, err)
	}
	// Library lookup must work even if no request row exists.
	db.db.Exec(`DELETE FROM source_requests`)
	created, err := req.Create("New request", "https://example.com/old", "example.com:123", nil, nil)
	if err != nil || created == nil {
		t.Fatalf("create: %+v %v", created, err)
	}
	var linkedPath string
	if err := db.db.QueryRow(`SELECT c.path FROM source_requests sr JOIN collections c ON c.id=sr.collection_id WHERE sr.id=$1`, created.ID).Scan(&linkedPath); err != nil || linkedPath != "root/creator" {
		t.Fatalf("create selected removed collection: %q %v", linkedPath, err)
	}
	db.db.Exec(`DELETE FROM source_requests`)
	existing, err := req.FindExistingSource("example.com:123", "https://example.com/new")
	if err != nil || existing == nil || existing.FolderPath == nil {
		t.Fatalf("%+v %v", existing, err)
	}
	// Historical URL/name associations survive later scans and removals.
	db.db.Exec(`UPDATE audio_files SET meta_artist='New',channel_url='https://example.com/new'`)
	if err := job.refreshCollections(); err != nil {
		t.Fatal(err)
	}
	existing, err = req.FindExistingSource("", "https://example.com/old")
	if err != nil || existing == nil {
		t.Fatalf("%+v %v", existing, err)
	}
}

func TestReindexRepeatedParameter(t *testing.T) {
	if got := reindex("name ILIKE $1 OR alias ILIKE $1 OR path=$2", 6); got != "name ILIKE $6 OR alias ILIKE $6 OR path=$7" {
		t.Fatal(got)
	}
}

func TestIntegrationCollectionMigrationRetainsLegacyAliasesAndKeys(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if _, err := db.db.Exec(initialSchema); err != nil {
		t.Fatal(err)
	}
	if _, err := db.db.Exec(`INSERT INTO folders(path,parent_path,folder_name,name,share_key,original_url) VALUES
 ('root/creator','root','creator','Daily task name','key','https://example.com/old');
 INSERT INTO audio_files(path,parent_path,filename,meta_artist) VALUES ('root/creator/track','root/creator','track','Historical name');
 INSERT INTO source_requests(submitted_url,source_key,title,folder_share_key) VALUES ('https://example.com/old','legacy:123','Request','key')`); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.db.QueryRow(`SELECT COUNT(*) FROM collection_names WHERE name IN ('Daily task name','Historical name')`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("%d %v", count, err)
	}
	if err := db.db.QueryRow(`SELECT COUNT(*) FROM collection_keys WHERE key='legacy:123'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("%d %v", count, err)
	}
	var id *int64
	if err := db.db.QueryRow(`SELECT collection_id FROM source_requests`).Scan(&id); err != nil || id == nil {
		t.Fatalf("%v %v", id, err)
	}
}

func TestIntegrationDeferredCollectionsKeepRequestsIndexing(t *testing.T) {
	db := integrationDatabase(t)
	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	_, err := db.db.Exec(`INSERT INTO folders(path,parent_path,folder_name,name) VALUES
 ('root/direct','root','direct','Direct'),
 ('root/nested','root','nested','Nested'),
 ('root/nested-other','root','nested-other','Other');
 INSERT INTO audio_files(path,parent_path,filename,meta_artist,channel_id,channel_url,upload_date) VALUES
 ('root/direct/old','root/direct','old','Direct','1','https://example.com/direct','20260101'),
 ('root/nested/year/old','root/nested/year','old','Nested','2','https://example.com/nested','20260101'),
 ('root/nested-other/old','root/nested-other','old','Other','3','https://example.com/other','20260101');
 INSERT INTO source_requests(submitted_url,source_key,title,status) VALUES
 ('https://example.com/direct','example.com:1','Direct','indexing'),
 ('https://example.com/nested','example.com:2','Nested','indexing'),
 ('https://example.com/other','example.com:3','Other','indexing')`)
	if err != nil {
		t.Fatal(err)
	}
	conn, err := db.db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	job := indexJob{conn: conn, deferredFolders: []string{"root/direct", "root/nested/year"}}
	if err := job.refreshCollections(); err != nil {
		t.Fatal(err)
	}
	check := func(title, want string) {
		t.Helper()
		var status string
		var linked bool
		if err := db.db.QueryRow(`SELECT status,collection_id IS NOT NULL FROM source_requests WHERE title=$1`, title).Scan(&status, &linked); err != nil {
			t.Fatal(err)
		}
		if status != want || !linked {
			t.Errorf("%s: status=%s linked=%v; want %s and linked", title, status, linked, want)
		}
	}
	check("Direct", "indexing")
	check("Nested", "indexing")
	check("Other", "added")
	job.deferredFolders = nil
	if err := job.refreshCollections(); err != nil {
		t.Fatal(err)
	}
	check("Direct", "added")
	check("Nested", "added")
}

func TestIntegrationRequestLinksUseOnlyCollections(t *testing.T) {
	db := integrationDatabase(t)
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	_, err := db.db.Exec(`INSERT INTO folders(path,parent_path,folder_name,name,share_key) VALUES
 ('root/current','root','current','Current','current-key'),
 ('root/legacy','root','legacy','Legacy','legacy-key');
 INSERT INTO collections(path,name) VALUES ('root/current','Current');
 INSERT INTO source_requests(submitted_url,source_key,title,status,folder_share_key,collection_id) VALUES
 ('https://example.test/linked','linked','Linked','indexing','legacy-key',(SELECT id FROM collections)),
 ('https://example.test/unlinked','unlinked','Unlinked','indexing','legacy-key',NULL)`)
	if err != nil {
		t.Fatal(err)
	}
	service := &RequestsService{db: db}
	for _, key := range []string{"linked", "unlinked"} {
		existing, err := service.FindExistingSource(key, "https://example.test/"+key)
		if err != nil || existing == nil {
			t.Fatalf("%s: %v %v", key, existing, err)
		}
		if key == "linked" {
			if existing.FolderPath == nil || *existing.FolderPath != "root/current" {
				t.Fatalf("wrong linked folder: %+v", existing)
			}
		} else if existing.FolderPath != nil {
			t.Fatalf("legacy link still used: %+v", existing)
		}
		if err := service.UpdateStatus(existing.ID, "added"); err != nil {
			t.Fatal(err)
		}
	}
	grouped, err := service.GetAllGroupedByStatus()
	if err != nil {
		t.Fatal(err)
	}
	if len(grouped.Added) != 2 {
		t.Fatalf("requests: %+v", grouped)
	}
	for _, request := range grouped.Added {
		if request.Title == "Linked" {
			if request.FolderShareKey == nil || *request.FolderShareKey != "current-key" || request.FolderPath == nil || *request.FolderPath != "root/current" {
				t.Fatalf("collection association lost: %+v", request)
			}
		} else if request.FolderShareKey != nil || request.FolderPath != nil {
			t.Fatalf("legacy link still used: %+v", request)
		}
	}
}
