-- Enqueue only the listens inserted by this request without scanning old history.
CREATE INDEX scrobble_listens_ingestion ON scrobble_listens(account,ingestion_id);
