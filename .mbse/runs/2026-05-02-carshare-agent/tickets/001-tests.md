## Ticket 001: Runtime contract tests for carshare persistence agent

### Goal
Encode architecture expectations for one carshare persistence agent, node type distinction, target carshare client endpoints, clarification behavior, and success read-back.

### Model References
- ADR-0005
- `architecture/contracts/carshare-agent-skill.md`
- `architecture/contracts/agent-graph-schema-v1.md`

### Scope
- In scope: runtime tests and graph contract tests.
- Out of scope: production implementation.

### Expected Files Or Modules
- `runtime/test/agent-graph-contract.test.mjs`
- `runtime/test/public-runtime-contracts.test.mjs`

### Allowed Changes
- Add/adjust tests to the new target architecture.

### Forbidden Changes
- Do not weaken permission/idempotency checks.

### Tests And Checks
- `npm test` in `runtime`.

### Dependencies
- None.

### Completion Criteria
- Tests fail on current implementation for missing target behavior.

### Escalation Conditions
- If architecture contract is ambiguous.
