## Ticket 001: Runtime Fitness Tests

### Goal
Add tests that encode graph schema, permission, DB-schema, and forbidden dependency constraints.

### Model References
- `architecture/contracts/agent-graph-schema-v1.md`
- `architecture/contracts/runtime-db-schema-v1.md`
- `architecture/rules/architecture-rules.md`

### Scope
- In scope: tests under `runtime/test/`.
- Out of scope: production implementation semantics beyond tested public functions.

### Expected Files Or Modules
- `runtime/test/*.test.js`

### Allowed Changes
- Add or adjust tests and test fixtures.

### Forbidden Changes
- Do not weaken architecture rules or contracts.

### Tests And Checks
- Node `npm test` from `runtime/`.

### Dependencies
- None.

### Completion Criteria
- Tests fail on missing runtime implementation and pass once implementation conforms.

### Escalation Conditions
- Contract ambiguity requiring domain semantics not in the architecture sources.
