# Architecture

Architecture diagrams are modeled in Structurizr DSL.

- [`workspace.dsl`](workspace.dsl): source-of-truth C4 model for the target LangGraph/LangChain runtime architecture.
- [`decisions/`](decisions/): accepted architecture decisions, including the modular-monolith runtime decision.
- [`rules/`](rules/): durable architecture rules for future changes, including deployable boundary, risky-write, and memory rules.
- [`contracts/`](contracts/): HTTP, data, and internal interaction contracts for implementation readiness.
- [`implementation-contracts/`](implementation-contracts/): concise code-facing contracts derived from accepted architecture decisions.

Start with `workspace.dsl` for diagrams, then read ADRs for decisions, rules for durable constraints, and implementation contracts for code-facing follow-up obligations.

The initial architecture is intentionally thin: scratch and carshare agent systems only, direct AWS Bedrock, Carshare Service over HTTP/JSON, and Postgres for starter runtime records plus carshare-owned data.

There is no starter artifact manager/store, checkpointing, approval/resume flow, knowledge promotion component, repo-maintenance agent, or model gateway. Artifact storage is intentionally omitted because no starter workflow generates durable files/diffs/reports; normal app logs and Carshare/Postgres data are sufficient. ADR-0002 documents the deferred model gateway, and ADR-0003 documents the starter scope exclusions.

Generated Structurizr cache/output files are ignored by Git.
