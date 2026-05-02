# 0007 Allow Handover Fuel Deltas

Status: Accepted
Date: 2026-05-02

## Context

ADR-0004 introduced replacement-obligation accounting with adjacent explicit interval readings required to match. That hard equality is too strict when adjacent drivers record different tank readings: rejecting the intervals blocks traceable correction and prevents the system or agent from helping users resolve the discrepancy.

## Decision

Refine ADR-0004 by allowing adjacent explicit readings to differ. When a previous interval's `endLiters` and the next interval's `startLiters` are both known and differ, Carshare Service derives or updates a Handover Fuel Delta instead of rejecting the intervals.

`amountLiters = next.startLiters - previous.endLiters`; both positive and negative amounts are treated symmetrically. The fillable quantity is `abs(amountLiters)`, and responsibility is split 50/50 between the previous interval user and the next interval user. Deltas with `absLiters <= 1` may be auto-accepted as small discrepancies. Deltas with `absLiters > 1` are pending/need attention, and the agent should ask whether to correct the previous end liters, correct the next start liters, or accept the delta.

When a Handover Fuel Delta is filled from a priced source, participant shares are created for half the value each. With the current booking model this means up to two cross-user ledger bookings; a filler's own adjacent share may be self-elided.

Also refine surplus ordering: surplus fills the same participant's previous open obligations first using the cheapest available surplus refill liters first. Remaining surplus then fills other participants' previous open obligations oldest-first using remaining refill liters most-expensive-first for cross-user fills, so the surplus provider is credited at the highest remaining replacement cost. Obligations remain unpriced until filled.

## Consequences

- Adjacent explicit tank mismatches become auditable domain artifacts rather than interval validation failures.
- Agents can suppress small auto-accepted discrepancies and ask focused clarification questions for larger discrepancies.
- Delta fills can create additional cross-user ledger bookings, with possible self-elision when the payer is one adjacent participant.
- Recalculation and tests must cover positive and negative deltas, auto-accept thresholds, delta fills, and revised surplus lot ordering.

## Related

- Refines: ADR-0004
- Structurizr: `carshare-service-components`, `dynamic-carshare-flow`
- Rules: BR-002, BR-004, BR-005, BR-007
- Contracts: `architecture/contracts/carshare-service-http.md`, `architecture/contracts/carshare-agent-skill.md`
