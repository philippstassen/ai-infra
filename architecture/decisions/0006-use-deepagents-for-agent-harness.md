# 0006 Use DeepAgents For Agent Harness

Status: Accepted
Date: 2026-05-02

## Context

The target architecture distinguishes one-shot LLM calls from goal-directed agents, but the generic/custom starter harness direction does not provide a full iterative agent loop or a clear agent/skill runtime model. DeepAgents already provides the goal-directed agent and skill distinction needed for extensible agent runs inside the Agent Runtime App.

## Decision

Use DeepAgents inside the Agent Runtime App as the concrete runtime for `type: agent` graph nodes. Keep LangGraph/workflow graph routing for orchestration and one-shot graph steps; `type: llm_call` nodes remain simple single model calls and are not run through DeepAgents.

DeepAgents owns the iterative plan/act/observe/continue loop and skill-aware prompting/tool use for true agents. The Agent Runtime App continues to own channel normalization/routing, permission enforcement, idempotency, tool invocation audit, model-provider selection, and tool/client boundaries around DeepAgents runs.

## Consequences

- Less custom agent framework code is needed for the starter agent loop.
- Agent and skill mappings are clearer for Carshare Persistence Agent and future goal-directed agents.
- Runtime implementation must register wrapped tools and mediate DeepAgents tool use so permission, idempotency, and audit controls remain outside or around agent execution.
- DeepAgents filesystem, durable memory, subagents, and long-running approval/resume features remain disabled or out of scope unless future ADRs and configuration explicitly enable them.

## Related

- Structurizr: `agentHarness`, `carsharePersistenceAgent`, `dynamic-carshare-flow`
- Rules: AR-002, AR-004, AR-007, AR-008
- Contracts: `architecture/contracts/agent-graph-schema-v1.md`, `architecture/contracts/carshare-agent-skill.md`
