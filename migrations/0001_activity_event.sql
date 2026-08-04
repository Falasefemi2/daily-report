-- activity.event stores debounced active-window intervals and optional
-- higher-signal events (shell commands). Timestamps are timestamptz so the
-- machine's local day boundaries are honored when querying (a local-midnight
-- Date sent to Postgres is serialized to the correct UTC instant).

CREATE SCHEMA IF NOT EXISTS activity;

CREATE TABLE IF NOT EXISTS activity.event (
  id BIGSERIAL PRIMARY KEY,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  app TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'window' CHECK (kind IN ('window', 'shell')),
  command TEXT
);

CREATE INDEX IF NOT EXISTS activity_event_start_at_idx ON activity.event (start_at);
CREATE INDEX IF NOT EXISTS activity_event_kind_idx ON activity.event (kind);
