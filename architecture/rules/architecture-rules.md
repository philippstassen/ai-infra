# Architecture Rules

## AR-001 DIY Runtime Logic Boundary

Status: Accepted
Type: Architecture
Applies To: Agent Runtime App

Statement:
DIY runtime logic stays in the Agent Runtime App until a separate deployment lifecycle, scaling need, or security boundary is proven.

Rationale:
The target deployment is a small Oracle VM and the runtime concerns are currently tightly coupled.

Related:
- ADR-0001

## AR-002 Agents As Configuration

Status: Accepted
Type: Architecture
Applies To: Agent systems and agent graph nodes

Statement:
Agents and agent systems are versioned configuration, prompts, and graphs hosted by the runtime, not separate deployable containers unless an ADR introduces a new boundary.

Rationale:
Agent graph definitions should remain easy to version and change without inventing deployment boundaries for configured behavior.

Related:
- ADR-0001
- ADR-0005

## AR-003 Risky Writes Require Future Approval Design

Status: Accepted
Type: Architecture
Applies To: Agent Runtime App, external write integrations

Statement:
Risky external writes, especially GitHub branch, commit, and pull request writes, are out of starter scope; adding them requires an accepted approval design and ADR before execution paths are introduced.

Rationale:
The starter runtime has no approval/resume gate, so risky writes must not be added implicitly or without reviewed control points.

Related:
- ADR-0003

## AR-004 No Implicit Long-Term Memory

Status: Accepted
Type: Architecture
Applies To: Agent Runtime App, persistence adapters, memory features

Statement:
Implicit long-term memory is disabled; the starter runtime has no long-term memory or knowledge-promotion component. Any future durable knowledge or memory feature requires an ADR and explicit provenance.

Rationale:
Durable memory should be auditable and intentional rather than a side effect of ordinary conversations, and no starter workflow has proven the need for a knowledge-promotion feature.

Related:
- ADR-0003

## AR-005 Independent Domain Service APIs

Status: Accepted
Type: Architecture
Applies To: Carshare Service and similar domain services

Statement:
Domain services with independent clients or ownership, such as Carshare Service, expose HTTP APIs and own their data access instead of being hidden runtime internals.

Rationale:
Services that may support non-agent clients need stable boundaries and should retain ownership of their domain behavior and data access.

Related:
- ADR-0001

## AR-006 Direct Bedrock Before Model Gateway

Status: Accepted
Type: Architecture
Applies To: Agent Runtime App, Model Gateway, External Model Providers

Statement:
Initial model-provider integration uses direct AWS Bedrock; LiteLLM, Bifrost, or another model gateway requires an ADR before becoming a deployment dependency.

Rationale:
The initial provider set is Bedrock-only, so a gateway would add deployment and contract complexity before routing or provider-diversity needs are proven.

Related:
- ADR-0002

## AR-007 Agent Naming Discipline

Status: Accepted
Type: Architecture
Applies To: Agent Runtime App, graph configuration, C4 component names, contracts

Statement:
Components and configuration nodes must not be named `Agent` unless they execute a goal-directed LLM/tool loop that can inspect state, decide next actions, call tools, observe results, ask clarifying questions, and continue until complete or blocked. One-shot model calls must be named LLM Call or Prompt Step; deterministic logic must be named Function or Step.

Rationale:
Clear naming prevents parser, composer, and other one-shot graph nodes from being mistaken for true agents and keeps diagrams, contracts, and runtime implementation expectations aligned.

Related:
- ADR-0005
- Structurizr: `agent-runtime-app-components`, `carshare-agent-graph`

## AR-008 DeepAgents Tool Boundary and Feature Controls

Status: Accepted
Type: Architecture
Applies To: Agent Runtime App, Goal-Directed Agent Harness, DeepAgents agents, tool integrations

Statement:
DeepAgents agents must run inside Agent Runtime App controls: tools are runtime-wrapped, tool permission, idempotency, and invocation audit are enforced outside or around DeepAgents calls, Carshare domain writes go through Tool Client Layer and Carshare Service HTTP APIs rather than direct database access, and DeepAgents filesystem, implicit durable memory, subagents, and approval/resume features stay disabled unless an ADR and configuration explicitly enable them.

Rationale:
DeepAgents provides the agent loop, but runtime-owned safety boundaries preserve data ownership, auditability, idempotent writes, and the starter scope limits on memory and approval workflows.

Related:
- ADR-0006
- ADR-0003
- ADR-0004
- Structurizr: `agentHarness`, `toolClientLayer`, `permissionPolicy`

## AR-009 Resettable Carshare Domain Persistence

Status: Accepted
Type: Architecture
Applies To: Carshare Service, Carshare domain schema

Statement:
Carshare domain persistence is resettable and may be changed through the baseline init schema only while there is no production legacy data-retention requirement; do not add Carshare compatibility adapters or migration layers without a future data-retention decision.

Rationale:
The project can wipe the Carshare database and restart from the replacement-obligation schema, so compatibility and migration layers would add unnecessary complexity until production retention is required.

Related:
- ADR-0004
- Structurizr: `carshareService`, `carshare-service-components`
