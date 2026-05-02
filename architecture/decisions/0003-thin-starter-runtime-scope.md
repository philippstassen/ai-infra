# 0003 Thin Starter Runtime Scope

Status: Accepted
Date: 2026-05-02

## Context

The first implementation slice needs a scratch agent for safe testing and a carshare agent for real HTTP/JSON tool usage. Earlier target models included repo-maintenance, GitHub write approvals, artifact storage, checkpoint/resume persistence, and explicit knowledge promotion before a starter workflow required them.

## Decision

Limit the initial Agent Runtime App scope to scratch and carshare agent systems. Use synchronous per-message LangGraph execution, direct AWS Bedrock model calls, Carshare Service over HTTP/JSON, and starter runtime Postgres tables for channel bindings, sessions, messages, runs, and tool invocation audit.

Exclude repo-maintenance, GitHub write/approval flows, approval/resume contracts, checkpoint persistence, artifact manager/store, and explicit knowledge promotion from the starter architecture. Reintroduce any of these through a future ADR and contract only when a workflow needs generated durable files, risky external writes, resumable long-running runs, or durable memory.

## Consequences

- The first runtime is smaller and has fewer migrations, contracts, and deployment concerns.
- Scratch and carshare can validate graph loading, routing, direct Bedrock, and HTTP tool usage without approval/resume complexity.
- Starter workflows rely on normal application logs and Carshare/Postgres-owned data rather than a durable artifact store.
- Repo-maintenance and risky GitHub writes remain out of scope until a future approval design is accepted.

## Related

- Structurizr: `container`, `agent-runtime-app-components`, `dynamic-message-response`, `dynamic-carshare-flow`
- Rules: AR-003, AR-004, AR-006
- Contracts: `architecture/contracts/runtime-db-schema-v1.md`, `architecture/contracts/agent-graph-schema-v1.md`
