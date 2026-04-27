CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS openclaw AUTHORIZATION role_openclaw;
CREATE SCHEMA IF NOT EXISTS agent_data AUTHORIZATION role_tooling;
CREATE SCHEMA IF NOT EXISTS carshare AUTHORIZATION role_tooling;
CREATE SCHEMA IF NOT EXISTS shared AUTHORIZATION postgres;

GRANT USAGE ON SCHEMA openclaw TO role_openclaw;
GRANT USAGE ON SCHEMA agent_data TO role_openclaw;
GRANT USAGE ON SCHEMA agent_data TO role_tooling;
GRANT USAGE ON SCHEMA agent_data TO role_readonly;
GRANT USAGE ON SCHEMA carshare TO role_openclaw;
GRANT USAGE ON SCHEMA carshare TO role_tooling;
GRANT USAGE ON SCHEMA carshare TO role_readonly;
GRANT USAGE ON SCHEMA shared TO role_openclaw;
GRANT USAGE ON SCHEMA shared TO role_tooling;
GRANT USAGE ON SCHEMA shared TO role_readonly;

CREATE TABLE IF NOT EXISTS shared.kv_store (
  namespace  text NOT NULL,
  key        text NOT NULL,
  value      jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, key)
);

CREATE TABLE IF NOT EXISTS agent_data.documents (
  id         bigserial PRIMARY KEY,
  source     text NOT NULL,
  content    text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carshare.projects (
  slug                      text PRIMARY KEY,
  name                      text NOT NULL,
  currency                  text NOT NULL DEFAULT 'EUR',
  baseline_price_per_liter  numeric(12,4),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carshare.events (
  id                bigserial PRIMARY KEY,
  project_slug      text NOT NULL REFERENCES carshare.projects(slug) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('handover', 'refill')),
  occurred_at       timestamptz NOT NULL,
  holder            text,
  payer             text,
  liters_remaining  numeric(12,3),
  liters_added      numeric(12,3),
  total_cost        numeric(12,2),
  price_per_liter   numeric(12,4),
  recorded_by       text,
  note              text,
  raw_text          text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carshare_events_project_occurred_idx
  ON carshare.events (project_slug, occurred_at, id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE shared.kv_store TO role_openclaw;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE shared.kv_store TO role_tooling;
GRANT SELECT ON TABLE shared.kv_store TO role_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE agent_data.documents TO role_openclaw;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE agent_data.documents TO role_tooling;
GRANT SELECT ON TABLE agent_data.documents TO role_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE carshare.projects TO role_openclaw;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE carshare.projects TO role_tooling;
GRANT SELECT ON TABLE carshare.projects TO role_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE carshare.events TO role_openclaw;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE carshare.events TO role_tooling;
GRANT SELECT ON TABLE carshare.events TO role_readonly;

GRANT USAGE, SELECT ON SEQUENCE agent_data.documents_id_seq TO role_openclaw;
GRANT USAGE, SELECT ON SEQUENCE agent_data.documents_id_seq TO role_tooling;

GRANT USAGE, SELECT ON SEQUENCE carshare.events_id_seq TO role_openclaw;
GRANT USAGE, SELECT ON SEQUENCE carshare.events_id_seq TO role_tooling;

ALTER DEFAULT PRIVILEGES IN SCHEMA shared
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_openclaw, role_tooling;

ALTER DEFAULT PRIVILEGES IN SCHEMA shared
  GRANT SELECT ON TABLES TO role_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA agent_data
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_openclaw, role_tooling;

ALTER DEFAULT PRIVILEGES IN SCHEMA agent_data
  GRANT SELECT ON TABLES TO role_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA carshare
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_openclaw, role_tooling;

ALTER DEFAULT PRIVILEGES IN SCHEMA carshare
  GRANT SELECT ON TABLES TO role_readonly;
