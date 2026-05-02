# Implementation Contract: Agent Runtime App

Readiness: Ready with caveats

## Boundary

The Agent Runtime App is the deployable application container for starter DIY runtime logic: channel adapters, message normalization, routing, session management, local agent-system loading, synchronous per-message LangGraph graph execution, DeepAgents-backed goal-directed agent hosting, one-shot LLM call hosting, permissions, tool/model clients, and runtime persistence.

## Module Boundaries

- Channel adapters normalize Telegram and Discord events and send channel responses.
- Router/session modules select an agent system and manage runtime session state.
- Graph execution modules load `agent-systems/scratch/graph.yaml` and `agent-systems/carshare/graph.yaml`, run configured nodes synchronously per message, execute `type: agent` nodes through DeepAgents, and keep `type: llm_call` nodes as one-shot model calls outside DeepAgents.
- Client modules isolate calls to Carshare Service, direct AWS Bedrock model providers, and the Postgres runtime schema.
- Permission modules enforce starter tool allowlists and side-effect classes, especially carshare domain writes.

## Allowed Dependencies

- Agent Runtime App may call Carshare Service over HTTP/JSON.
- Agent Runtime App may access Postgres runtime schemas for channel bindings, sessions, messages, runs, and tool invocation audit.
- Agent Runtime App may call AWS Bedrock model providers through configured clients.
- Agent Runtime App may use DeepAgents as an in-process library/runtime capability for goal-directed agent nodes.
- Agent Runtime App may call a model gateway only after a future ADR introduces it as a deployment dependency.
- Carshare Service may access its carshare schema in Postgres.

## Forbidden Dependencies

- Agent graph nodes must not write GitHub in the starter scope.
- Agent Runtime App must not directly write carshare domain tables except administrative bootstrap or future explicitly approved data-retention migrations.
- Runtime flows must not create implicit long-term memory writes.
- Agents and agent systems must not become separate deployable containers without a new ADR.
- Agent Runtime App must not depend on a Carshare MCP server in the initial architecture; Carshare integration uses HTTP/JSON.
- Initial implementation must not require LiteLLM, Bifrost, or another model gateway.
- Initial implementation must not require checkpoint/resume, approval interrupts, artifact storage, or knowledge promotion.
- DeepAgents agents must not use unwrapped tools, direct Carshare database access, implicit durable memory, filesystem access, subagents, or approval/resume features unless a future ADR and configuration explicitly enable them.

## Contract Sources

- Carshare HTTP and data contract source: `architecture/contracts/carshare-service-http.md`, `carshare/src/server.js`, and `postgres/init/10-schema.sql`.
- Agent graph contract source: `architecture/contracts/agent-graph-schema-v1.md`, `agent-systems/scratch/graph.yaml`, and `agent-systems/carshare/graph.yaml`.
- Runtime DB contract source: `architecture/contracts/runtime-db-schema-v1.md`; future migrations must implement or intentionally revise it.
- Model provider contract source: `config/models.yaml` and ADR-0002; initial integration is direct AWS Bedrock, preferably using Bedrock/Mantle-compatible clients if viable.
- DeepAgents migration source: ADR-0006, AR-008, `architecture/contracts/agent-graph-schema-v1.md`, and `architecture/contracts/carshare-agent-skill.md`.

## DeepAgents Migration Handoff

- Replace the deterministic/custom starter harness for `type: agent` nodes with a DeepAgents-based runner.
- Register runtime-wrapped tools matching `agent-systems/*/tools.yaml`; write tools enforce permission and idempotency before execution and record tool invocation audit after execution.
- Invoke DeepAgents with repo-local agent identifiers, skill instructions/resources, wrapped tools, and the runtime Model Client.
- Keep existing deterministic tests by mocking DeepAgents, model calls, and wrapped tools.
- Disable DeepAgents memory, filesystem, subagents, and approval/resume by default unless a future ADR enables them.
- Readiness: Ready with caveats; verify DeepAgents package/runtime compatibility during implementation.

## Fitness Criteria

- Structurizr DSL validates.
- Agent graph configuration tests cover schema conformance, graph loading, graph selection, and synchronous per-message execution when runtime code exists.
- API/contract tests cover the Agent Runtime App client for documented Carshare Service HTTP endpoints.
- Permission tests prove starter carshare write tools use the configured side-effect class and no GitHub write path exists.
- Schema/boundary tests prove runtime and carshare data ownership boundaries are preserved.

## Caveats

- Proposed contracts need implementation tests.
- Runtime code and migrations are not yet built/applied.
- Direct Bedrock client details and Bedrock/Mantle compatibility require implementation verification.
- No checkpoint/resume, artifact storage, knowledge promotion, or repo-maintenance/GitHub write flow is part of the starter implementation.
