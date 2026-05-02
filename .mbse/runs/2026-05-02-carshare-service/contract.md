# Carshare Service Replacement-Obligation Implementation Contract

Sources:
- `architecture/contracts/carshare-service-http.md`
- `architecture/contracts/carshare-agent-skill.md`
- ADR-0004 replacement-obligation accounting
- Business rules BR-001..BR-006

Scope:
- Implement Carshare Service HTTP API and schema for participants, driver intervals, obligations, refills, ledger bookings, and settlements.
- Preserve service boundary: Carshare Service owns `carshare.*`; Agent Runtime calls HTTP only.
- Keep legacy endpoints compatible where feasible.

Out of scope:
- Rich UI; full LLM-driven extraction; direct DB writes from runtime.

Readiness: Ready. Domain rules are specified; service can implement deterministic replacement-obligation accounting.
