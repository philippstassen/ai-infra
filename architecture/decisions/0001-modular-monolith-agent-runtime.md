# 0001 Modular Monolith Agent Runtime

Status: Accepted
Date: 2026-05-01

## Context

The target runtime is intended to run on a small Oracle VM. The starter DIY runtime concerns for channel handling, routing, session management, synchronous graph execution, permissions, tools, model clients, and persistence adapters are tightly coupled at this stage, so separate deployable services would add premature distributed boundaries. LangGraph and LangChain are libraries/frameworks used inside the application rather than independently deployed platforms. The existing Carshare domain API may also support future clients, such as a web app, beyond agent workflows.

## Decision

Use one deployable `Agent Runtime App` container for DIY runtime logic. Keep `Carshare Service` and `Postgres` as separate runtime boundaries. Model starter agents and agent systems as versioned graph configuration, prompts, and graph nodes hosted by the runtime app, not as independently deployed containers. Do not introduce filesystem artifact storage or a model gateway as initial separate boundaries; ADR-0002 keeps the gateway deferred, and ADR-0003 defines the intentionally thin starter scope.

## Consequences

- Deployment, debugging, and operations remain simple for the small VM target.
- Internal module boundaries must stay clear inside the broader app container.
- Carshare Service keeps an explicit HTTP/API boundary and ownership of carshare domain behavior.
- Future extraction or new storage/gateway boundaries remain possible when lifecycle, scaling, security, or ownership needs prove them.
- The Agent Runtime App has broader responsibility and will need fitness checks around permissions, data ownership, and module coupling.

## Related

- Structurizr: `container`, `agent-runtime-app-components`, `carshare-agent-graph`
- Decisions: ADR-0002, ADR-0003
- Rules: AR-001, AR-002, AR-003, AR-004, AR-005, AR-006
