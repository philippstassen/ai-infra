# Carshare Persistence Agent Implementation Contract

Source architecture:
- `architecture/decisions/0005-distinguish-agents-from-llm-calls.md`
- `architecture/contracts/carshare-agent-skill.md`
- `architecture/contracts/agent-graph-schema-v1.md`
- `architecture/contracts/carshare-service-http.md`
- `architecture/workspace.dsl` elements `goalDirectedAgentHarness`, `carsharePersistenceAgent`, `carshareApiSkill`, `toolClientLayer`.

Scope:
- Migrate current carshare runtime behavior from pseudo multi-agent parser/refill/handover graph to a single configured `carshare_persistence` agent node.
- Implement a deterministic starter agent harness that can gather required fields, ask clarifying questions, call Carshare Service client methods, and perform read-back for supported operations.
- Keep Agent Runtime as the only caller of Carshare Service; no direct runtime writes to `carshare.*`.

Out of scope:
- Implementing the full replacement-obligation Carshare Service API and database model.
- Adding a new deployable container.
- Long-term memory, checkpoint/resume, or approval flows.

Readiness: Ready with caveats. The target Carshare Service replacement API is documented but not yet implemented, so runtime must expose target client methods and may receive service errors until service implementation follows.
