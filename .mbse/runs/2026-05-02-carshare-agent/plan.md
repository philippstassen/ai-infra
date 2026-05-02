# Implementation Plan

1. Test slice: update graph contract and public runtime tests for `llm_call`, single carshare persistence agent path, Carshare client target endpoints, and clarification/read-back behavior.
2. Runtime/config slice: update carshare graph/tools/skill config and implement a bounded carshare persistence harness in `graph-runner.js`.
3. Client slice: add Carshare Service client methods for users, driver intervals, obligations, refills, ledger bookings, and settlements while preserving old methods as compatibility aliases where tests still require them.
4. Verify with runtime tests and contract tests.

Boundaries:
- Agent Runtime may call Carshare Service over HTTP/JSON only.
- Graph config may contain one `type: agent` node for the carshare persistence agent; one-shot model calls use `llm_call`.
- Deterministic helpers must not be labeled as agents.

Escalation:
- If implementing target behavior requires the unimplemented Carshare Service DB semantics, stop at client/contract/harness and report caveat.
