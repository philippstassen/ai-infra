## Ticket 002: Implement carshare persistence agent harness slice

### Goal
Implement the configured single-agent carshare path and target Carshare client methods needed by tests.

### Model References
- ADR-0005
- `architecture/contracts/carshare-agent-skill.md`
- `architecture/contracts/carshare-service-http.md`

### Scope
- In scope: `agent-systems/carshare/*`, runtime graph runner/client.
- Out of scope: Carshare Service DB/API implementation.

### Expected Files Or Modules
- `agent-systems/carshare/graph.yaml`
- `agent-systems/carshare/tools.yaml`
- `runtime/src/langgraph/graph-runner.js`
- `runtime/src/tools/carshare-client.js`

### Allowed Changes
- Bounded deterministic starter harness that satisfies required body gathering and read-back for common operations.

### Forbidden Changes
- Do not add direct database access from runtime to carshare tables.
- Do not introduce new deployable services.

### Tests And Checks
- `npm test` in `runtime`.

### Dependencies
- Ticket 001.

### Completion Criteria
- Contract tests pass and code conforms to target architecture with documented service-API caveat.

### Escalation Conditions
- If full service implementation is necessary for tests.
