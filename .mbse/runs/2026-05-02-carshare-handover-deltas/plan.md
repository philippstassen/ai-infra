# Implementation Plan

1. Test ticket: update pure accounting tests for cheapest-first own surplus, remaining-most-expensive cross-user fills, and handover delta fill helper expectations.
2. Code ticket: update accounting implementation to match revised surplus ordering and expose pure Handover Fuel Delta fill booking helper.
3. Code ticket: update schema/server to remove legacy endpoints/events, persist derived deltas, add delta list/accept/fill endpoints, and update recalculation.
4. Supervisor integration: reconcile reports, remove carshare migration file if present, run checks, and summarize conformance.

Parallelization:
- Ticket 1 and Ticket 2 overlap test/implementation files and run sequentially.
- Ticket 3 overlaps server/schema only but depends on contract interpretation; run after pure accounting changes.

Escalation:
- Stop if implementation requires changing API semantics not covered by the contract.
