CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO
$$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_runtime') THEN
    CREATE ROLE role_runtime LOGIN;
  ELSE
    ALTER ROLE role_runtime WITH LOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS runtime AUTHORIZATION role_runtime;

GRANT USAGE ON SCHEMA runtime TO role_runtime;

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
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES runtime.sessions(id),
  graph_id      text NOT NULL,
  graph_version text,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE TABLE IF NOT EXISTS runtime.tool_invocations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid NOT NULL REFERENCES runtime.runs(id),
  node_id          text NOT NULL,
  tool_name        text NOT NULL,
  permission_class text,
  idempotency_key  text,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  request          jsonb NOT NULL DEFAULT '{}'::jsonb,
  response         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
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

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA runtime TO role_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA runtime
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_runtime;
