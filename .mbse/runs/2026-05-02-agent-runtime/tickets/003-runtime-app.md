## Ticket 003: Agent Runtime App

### Goal
Implement the Agent Runtime App modules and synchronous scratch/carshare graph execution.

### Model References
- `architecture/workspace.dsl` Agent Runtime App components.
- `architecture/implementation-contracts/0001-agent-runtime-app.md`.
- `agent-systems/*` and `config/*`.

### Scope
- In scope: runtime package, config/graph loader, Telegram adapter, session persistence, graph runner, model client, Carshare tools, permission/audit.
- Out of scope: Discord production adapter, checkpoint/resume, approval gates, artifacts, long-term memory.

### Expected Files Or Modules
- `runtime/package.json`
- `runtime/src/**`
- `runtime/Dockerfile`

### Allowed Changes
- Add modular Node.js implementation and focused unit tests.

### Forbidden Changes
- Do not make agents separate containers.
- Do not directly write `carshare.*` from runtime code.

### Tests And Checks
- `npm test` in `runtime/`.

### Dependencies
- Ticket 002 for DB schema shape.

### Completion Criteria
- Runtime can process direct message envelopes and Telegram updates, route scratch/carshare, persist runtime records, audit tools, and call Carshare HTTP API.

### Escalation Conditions
- Need for unmodeled business parsing semantics.
