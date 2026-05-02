# Implementation Plan

## Scope

- Runtime DB schema and grants for `runtime.channel_bindings`, `runtime.sessions`, `runtime.messages`, `runtime.runs`, and `runtime.tool_invocations`.
- Node.js Agent Runtime App under `runtime/` with module boundaries matching the C4 component model.
- Graph/config loading for `scratch` and `carshare` starter systems.
- Synchronous per-message graph execution without checkpoint/resume.
- Telegram polling adapter, disabled unless explicitly enabled.
- Direct AWS Bedrock model client with deterministic local fallback only when model access is not configured or fails.
- Carshare HTTP/JSON tool client and permission/audit enforcement.
- Contract and architecture fitness tests.

## Boundaries

Allowed dependencies: Postgres runtime schema, Carshare Service HTTP API, direct AWS Bedrock, Telegram Bot API.

Forbidden dependencies: GitHub writes, Carshare MCP, model gateway, checkpoint tables, approvals, artifacts, promoted knowledge, direct runtime writes to `carshare.*`.

## Tickets

1. Runtime conformance tests and fitness checks.
2. Runtime DB migration and bootstrap grants.
3. Agent Runtime App modules and graph execution.
4. Docker Compose/env/docs integration.

Tickets 1 and 2 are independent. Tickets 3 and 4 depend on 2 and partially on 1.

## Verification

- `docker compose config --quiet`
- `docker run --rm -v "$PWD:/workspace" -w /workspace/runtime node:24-bookworm-slim npm test`
- `docker compose build agent-runtime`
- Structurizr DSL validation.

## Escalation Conditions

- Missing Carshare business semantics beyond handover/refill/summary.
- Need for public webhook ingress or Discord production behavior.
- Requirement to use a model gateway, approvals, checkpointing, artifacts, or durable memory.
