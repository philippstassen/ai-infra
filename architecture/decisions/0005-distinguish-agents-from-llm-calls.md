# 0005 Distinguish Agents From LLM Calls

Status: Accepted
Date: 2026-05-02

## Context

The architecture and scaffold configuration have used `Agent` for parser, response composer, scratch assistant, and carshare graph nodes even though the current runtime does not execute iterative LLM/tool agent loops for those paths. Carshare currently uses deterministic classification/parsing, service tool calls, and response composition, while Scratch uses a single model call. This makes the target behavior and implementation gaps unclear.

## Decision

Reserve `Agent` for a goal-directed LLM/tool loop that can inspect state, decide the next action, call tools, observe results, ask clarifying questions, and continue until the task is complete or blocked. Name one-shot model calls as LLM Calls or Prompt Steps, and deterministic graph logic as Functions or Steps.

Carshare persistence and query workflows will be represented as one Carshare Persistence Agent hosted by the Agent Runtime App goal-directed agent harness. The agent consumes a Carshare API skill/instructions contract and uses the Tool Client Layer to call the Carshare Service HTTP API. Do not split the target design into parser, accountant, and responder pseudo-agents.

## Consequences

- C4 diagrams and contracts can explicitly show true agents, one-shot LLM calls, deterministic steps, skills, and tool clients as different responsibilities.
- The current carshare graph labels and runtime behavior are stale/misaligned until implementation adds the agent harness loop and updates graph/tool/prompt configuration.
- Carshare writes require conversational data gathering before service calls and operation-specific read-backs after successful writes.
- Existing deployable topology does not change; the harness, agent, prompt steps, and skill remain hosted inside the Agent Runtime App.

## Related

- Structurizr: `agent-runtime-app-components`, `carshare-agent-graph`, `dynamic-carshare-flow`
- Rules: AR-002, AR-007
- Contracts: `architecture/contracts/agent-graph-schema-v1.md`, `architecture/contracts/carshare-agent-skill.md`, `architecture/contracts/carshare-service-http.md`
