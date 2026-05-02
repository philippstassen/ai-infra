CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS carshare AUTHORIZATION role_tooling;
CREATE SCHEMA IF NOT EXISTS runtime AUTHORIZATION role_runtime;
CREATE SCHEMA IF NOT EXISTS shared AUTHORIZATION postgres;

GRANT USAGE ON SCHEMA carshare TO role_tooling;
GRANT USAGE ON SCHEMA carshare TO role_readonly;
GRANT USAGE ON SCHEMA runtime TO role_runtime;
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

CREATE TABLE IF NOT EXISTS carshare.projects (
  slug                      text PRIMARY KEY,
  name                      text NOT NULL,
  currency                  text NOT NULL DEFAULT 'EUR',
  baseline_price_per_liter  numeric(12,4),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carshare.users (
  id              bigserial PRIMARY KEY,
  project_slug    text NOT NULL REFERENCES carshare.projects(slug) ON DELETE CASCADE,
  name            text NOT NULL,
  canonical_name  text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_slug, canonical_name)
);

CREATE TABLE IF NOT EXISTS carshare.driver_intervals (
  id            bigserial PRIMARY KEY,
  project_slug  text NOT NULL REFERENCES carshare.projects(slug) ON DELETE CASCADE,
  user_id       bigint NOT NULL REFERENCES carshare.users(id),
  started_at    timestamptz NOT NULL,
  start_liters  numeric(12,3) NOT NULL CHECK (start_liters >= 0),
  end_liters    numeric(12,3) CHECK (end_liters >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carshare_driver_intervals_project_started_idx
  ON carshare.driver_intervals (project_slug, started_at, id);

CREATE TABLE IF NOT EXISTS carshare.obligations (
  id            bigserial PRIMARY KEY,
  project_slug  text NOT NULL REFERENCES carshare.projects(slug) ON DELETE CASCADE,
  user_id       bigint NOT NULL REFERENCES carshare.users(id),
  interval_id   bigint REFERENCES carshare.driver_intervals(id) ON DELETE CASCADE,
  liters_total  numeric(12,3) NOT NULL CHECK (liters_total > 0),
  liters_open   numeric(12,3) NOT NULL CHECK (liters_open >= 0),
  occurred_at   timestamptz NOT NULL,
  source        text NOT NULL CHECK (source IN ('interval', 'manual')),
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carshare_obligations_project_occurred_idx
  ON carshare.obligations (project_slug, occurred_at, id);

CREATE TABLE IF NOT EXISTS carshare.refills (
  id                bigserial PRIMARY KEY,
  project_slug      text NOT NULL REFERENCES carshare.projects(slug) ON DELETE CASCADE,
  interval_id       bigint NOT NULL REFERENCES carshare.driver_intervals(id) ON DELETE CASCADE,
  paid_by_user_id   bigint NOT NULL REFERENCES carshare.users(id),
  liters            numeric(12,3) NOT NULL CHECK (liters > 0),
  price_per_liter   numeric(12,4) NOT NULL CHECK (price_per_liter > 0),
  total_cost        numeric(12,2) NOT NULL CHECK (total_cost >= 0),
  occurred_at       timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carshare_refills_project_occurred_idx
  ON carshare.refills (project_slug, occurred_at, id);

CREATE TABLE IF NOT EXISTS carshare.handover_fuel_deltas (
  id                   bigserial PRIMARY KEY,
  project_slug         text NOT NULL REFERENCES carshare.projects(slug) ON DELETE CASCADE,
  interval_before_id   bigint NOT NULL REFERENCES carshare.driver_intervals(id) ON DELETE CASCADE,
  interval_after_id    bigint NOT NULL REFERENCES carshare.driver_intervals(id) ON DELETE CASCADE,
  amount_liters        numeric(12,3) NOT NULL,
  abs_liters           numeric(12,3) NOT NULL CHECK (abs_liters > 0),
  filled_liters        numeric(12,3) NOT NULL DEFAULT 0 CHECK (filled_liters >= 0),
  status               text NOT NULL CHECK (status IN ('pending', 'accepted', 'filled')),
  auto_accepted        boolean NOT NULL DEFAULT false,
  accepted_at          timestamptz,
  filled_at            timestamptz,
  reason               text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_slug, interval_before_id, interval_after_id)
);

CREATE INDEX IF NOT EXISTS carshare_handover_fuel_deltas_project_status_idx
  ON carshare.handover_fuel_deltas (project_slug, status, updated_at, id);

CREATE INDEX IF NOT EXISTS carshare_handover_fuel_deltas_before_after_idx
  ON carshare.handover_fuel_deltas (interval_before_id, interval_after_id);

CREATE TABLE IF NOT EXISTS carshare.settlements (
  id            bigserial PRIMARY KEY,
  project_slug  text NOT NULL REFERENCES carshare.projects(slug) ON DELETE CASCADE,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carshare.ledger_bookings (
  id                 bigserial PRIMARY KEY,
  project_slug       text NOT NULL REFERENCES carshare.projects(slug) ON DELETE CASCADE,
  debit_user_id      bigint NOT NULL REFERENCES carshare.users(id),
  credit_user_id     bigint NOT NULL REFERENCES carshare.users(id),
  obligation_id      bigint REFERENCES carshare.obligations(id) ON DELETE CASCADE,
  handover_fuel_delta_id bigint REFERENCES carshare.handover_fuel_deltas(id) ON DELETE CASCADE,
  refill_id          bigint REFERENCES carshare.refills(id) ON DELETE SET NULL,
  liters             numeric(12,3) NOT NULL CHECK (liters > 0),
  price_per_liter    numeric(12,4) NOT NULL CHECK (price_per_liter > 0),
  amount             numeric(12,2) NOT NULL CHECK (amount >= 0),
  settlement_id      bigint REFERENCES carshare.settlements(id) ON DELETE SET NULL,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carshare_ledger_bookings_project_status_idx
  ON carshare.ledger_bookings (project_slug, settlement_id, occurred_at, id);

CREATE TABLE IF NOT EXISTS runtime.channel_bindings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel            text NOT NULL,
  channel_chat_id    text NOT NULL,
  agent_system_id    text NOT NULL,
  default_session_id uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, channel_chat_id)
);

CREATE TABLE IF NOT EXISTS runtime.sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id      uuid REFERENCES runtime.channel_bindings(id),
  agent_system_id text NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DO
$$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'channel_bindings_default_session_id_fkey'
      AND conrelid = 'runtime.channel_bindings'::regclass
  ) THEN
    ALTER TABLE runtime.channel_bindings
      ADD CONSTRAINT channel_bindings_default_session_id_fkey
      FOREIGN KEY (default_session_id)
      REFERENCES runtime.sessions(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS runtime.messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES runtime.sessions(id),
  channel_message_id text,
  direction          text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  sender_ref         text,
  content            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime.runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES runtime.sessions(id),
  graph_id     text NOT NULL,
  graph_version text,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS runtime.tool_invocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES runtime.runs(id),
  node_id         text NOT NULL,
  tool_name       text NOT NULL,
  permission_class text,
  idempotency_key text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  request         jsonb NOT NULL DEFAULT '{}'::jsonb,
  response        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS runtime_channel_bindings_agent_system_id_idx
  ON runtime.channel_bindings (agent_system_id);
CREATE INDEX IF NOT EXISTS runtime_channel_bindings_default_session_id_idx
  ON runtime.channel_bindings (default_session_id)
  WHERE default_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS runtime_sessions_binding_id_idx
  ON runtime.sessions (binding_id);
CREATE INDEX IF NOT EXISTS runtime_sessions_status_idx
  ON runtime.sessions (status);
CREATE INDEX IF NOT EXISTS runtime_sessions_agent_system_id_idx
  ON runtime.sessions (agent_system_id);

CREATE INDEX IF NOT EXISTS runtime_messages_session_id_created_at_idx
  ON runtime.messages (session_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS runtime_messages_session_id_channel_message_id_idx
  ON runtime.messages (session_id, channel_message_id)
  WHERE channel_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS runtime_runs_session_id_started_at_idx
  ON runtime.runs (session_id, started_at);
CREATE INDEX IF NOT EXISTS runtime_runs_status_idx
  ON runtime.runs (status);

CREATE INDEX IF NOT EXISTS runtime_tool_invocations_run_id_created_at_idx
  ON runtime.tool_invocations (run_id, created_at);
CREATE INDEX IF NOT EXISTS runtime_tool_invocations_status_idx
  ON runtime.tool_invocations (status);
CREATE UNIQUE INDEX IF NOT EXISTS runtime_tool_invocations_run_id_tool_name_idempotency_key_idx
  ON runtime.tool_invocations (run_id, tool_name, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE shared.kv_store TO role_tooling;
GRANT SELECT ON TABLE shared.kv_store TO role_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE carshare.projects TO role_tooling;
GRANT SELECT ON TABLE carshare.projects TO role_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA carshare TO role_tooling;
GRANT SELECT ON ALL TABLES IN SCHEMA carshare TO role_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA runtime TO role_runtime;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA carshare TO role_tooling;

ALTER DEFAULT PRIVILEGES IN SCHEMA shared
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_tooling;

ALTER DEFAULT PRIVILEGES IN SCHEMA shared
  GRANT SELECT ON TABLES TO role_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA carshare
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_tooling;

ALTER DEFAULT PRIVILEGES IN SCHEMA carshare
  GRANT SELECT ON TABLES TO role_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA runtime
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_runtime;
