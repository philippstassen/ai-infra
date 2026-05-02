# Runtime DB Schema v1

Status: Proposed

## Purpose

Agent Runtime App owns the `runtime` Postgres schema for starter runtime channel bindings, sessions, messages, runs, and tool invocation audit. Carshare domain tables remain owned by Carshare Service.

This starter contract intentionally excludes approval requests, graph checkpoints, artifacts, and promoted knowledge. Add those tables only through a future ADR/contract if resumable workflows, approval gates, generated durable files, or durable memory become required.

## Status Enums

Use text columns with check constraints unless migrations introduce Postgres enum types.

- Session status: `active`, `closed`, `archived`.
- Run status: `running`, `completed`, `failed`, `cancelled`.
- Tool invocation status: `pending`, `running`, `succeeded`, `failed`, `skipped`.

## Tables

### `runtime.channel_bindings`

- `id uuid primary key`
- `channel text not null`
- `channel_chat_id text not null`
- `agent_system_id text not null`
- `default_session_id uuid references runtime.sessions(id) deferrable initially deferred`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints/indexes:

- `unique(channel, channel_chat_id)`.
- Index on `(agent_system_id)`.
- Index on `(default_session_id)` when not null.

### `runtime.sessions`

- `id uuid primary key`
- `binding_id uuid references runtime.channel_bindings(id)`
- `agent_system_id text not null`
- `status text not null default 'active' check (status in ('active', 'closed', 'archived'))`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints/indexes:

- Index on `(binding_id)`.
- Index on `(status)`.
- Index on `(agent_system_id)`.

### `runtime.messages`

- `id uuid primary key`
- `session_id uuid not null references runtime.sessions(id)`
- `channel_message_id text`
- `direction text not null check (direction in ('inbound', 'outbound', 'internal'))`
- `sender_ref text`
- `content jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Constraints/indexes:

- Index on `(session_id, created_at)`.
- Unique `(session_id, channel_message_id)` where `channel_message_id is not null`.

### `runtime.runs`

- `id uuid primary key`
- `session_id uuid not null references runtime.sessions(id)`
- `graph_id text not null`
- `graph_version text`
- `status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled'))`
- `started_at timestamptz not null default now()`
- `completed_at timestamptz`

Constraints/indexes:

- Index on `(session_id, started_at)`.
- Index on `(status)`.

### `runtime.tool_invocations`

- `id uuid primary key`
- `run_id uuid not null references runtime.runs(id)`
- `node_id text not null`
- `tool_name text not null`
- `permission_class text`
- `idempotency_key text`
- `status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'skipped'))`
- `request jsonb not null default '{}'::jsonb`
- `response jsonb`
- `created_at timestamptz not null default now()`
- `completed_at timestamptz`

Constraints/indexes:

- Index on `(run_id, created_at)`.
- Index on `(status)`.
- Unique `(run_id, tool_name, idempotency_key)` where `idempotency_key is not null`.

The idempotency uniqueness is scoped by `run_id` and `tool_name` so unrelated runs can reuse stable domain/message identifiers while retries inside the same run cannot duplicate a tool side effect.
