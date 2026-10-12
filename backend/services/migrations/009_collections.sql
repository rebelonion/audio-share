-- Collections are archive locations; a collection may contain several accounts,
-- and an account may occur in several collections. No platform rules live here.
CREATE TABLE collections (
    id BIGSERIAL PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    channel_url TEXT NOT NULL DEFAULT ''
);
CREATE TABLE collection_names (
    collection_id BIGINT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    PRIMARY KEY(collection_id, name)
);
CREATE INDEX collection_names_search ON collection_names USING gin (name gin_trgm_ops);
CREATE TABLE collection_keys (
    collection_id BIGINT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    PRIMARY KEY(collection_id, key)
);
CREATE INDEX collection_keys_lookup ON collection_keys(key);
ALTER TABLE audio_files ADD COLUMN channel_id TEXT NOT NULL DEFAULT '';
ALTER TABLE audio_files ADD COLUMN channel_url TEXT NOT NULL DEFAULT '';
ALTER TABLE source_requests ADD COLUMN collection_id BIGINT REFERENCES collections(id);

-- Import existing names/associations once, before the first sidecar-only index.
INSERT INTO collections(path, name, channel_url)
SELECT path, name, COALESCE(original_url, '') FROM folders
WHERE path ~ '^[^/]+/[^/]+$';
INSERT INTO collection_names(collection_id, name)
SELECT collection_id, REPLACE(name, '\u0026', '&') FROM (
    SELECT id collection_id, name FROM collections
    UNION
    SELECT c.id, a.meta_artist FROM audio_files a JOIN collections c
      ON c.path=split_part(a.path,'/',1) || '/' || split_part(a.path,'/',2)
) names WHERE NULLIF(BTRIM(name), '') IS NOT NULL
AND LOWER(BTRIM(name)) NOT IN ('na', 'n/a', 'null', 'none')
ON CONFLICT DO NOTHING;
INSERT INTO collection_keys(collection_id, key)
SELECT id, 'url:' || RTRIM(channel_url, '/') FROM collections WHERE channel_url <> '';
UPDATE source_requests sr SET collection_id = c.id
FROM folders f, collections c WHERE f.share_key = sr.folder_share_key
AND (f.path = c.path OR starts_with(f.path,c.path || '/'));
INSERT INTO collection_keys(collection_id, key)
SELECT collection_id, source_key FROM source_requests
WHERE collection_id IS NOT NULL AND NULLIF(source_key, '') IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO collection_keys(collection_id, key)
SELECT collection_id, 'url:' || RTRIM(submitted_url, '/') FROM source_requests
WHERE collection_id IS NOT NULL AND submitted_url <> ''
ON CONFLICT DO NOTHING;
