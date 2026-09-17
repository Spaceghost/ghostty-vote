-- The page is now a static asset (public/), so the copies once loaded into D1 for
-- an API-based deploy are unused. IF EXISTS makes this a no-op on databases that
-- never had them. No other table, trigger, vote, suggestion or tally is touched.
DROP TABLE IF EXISTS site_assets;
DROP TABLE IF EXISTS deploy_sources;
