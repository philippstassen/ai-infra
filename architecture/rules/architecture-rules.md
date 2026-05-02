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
