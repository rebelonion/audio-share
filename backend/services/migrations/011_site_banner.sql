-- The site-wide notice shown above every page. At most one row; no row means
-- no banner.
CREATE TABLE site_banner (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    message TEXT NOT NULL,
    variant TEXT NOT NULL CHECK (variant IN ('info', 'warning', 'success')),
    link_text TEXT NOT NULL DEFAULT '',
    link_url TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
