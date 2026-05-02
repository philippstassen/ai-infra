# Implementation Contract: Carshare Replacement-Obligation Ledger

Readiness: Proposed

## Boundary

Carshare Service owns the replacement-obligation ledger implementation behind the HTTP/JSON contract in `architecture/contracts/carshare-service-http.md`. Agent Runtime App uses HTTP only and does not write Carshare tables directly.

## Implementation Expectations

- Own the `carshare` schema tables for projects, participants, driver intervals, handover fuel deltas, obligations, refills, ledger bookings, and settlements.
- Use database transactions for interval/refill/obligation edits, deletes, derived recalculation, ledger booking creation, and settlement creation.
- Reject edits/deletes that would alter settled ledger bookings unless a future reversal contract is introduced.
- Implement deterministic allocation: same participant's previous obligations before other participants; oldest obligations first within each scope; cheapest surplus refill liters first for the same participant's previous obligations; remaining refill liters most-expensive-first for cross-participant fills.
- Derive or update `handover_fuel_deltas` or an equivalent table during recalculation instead of rejecting adjacent explicit tank mismatches. Persist conceptual fields for id, amount liters, absolute liters, before/after interval references, status, auto-accepted flag, and timestamps.
- Implement Handover Fuel Delta API support for listing deltas, accepting deltas, and filling deltas. Correcting linked readings uses the existing driver interval edit endpoint.
- Do not implement legacy `/handover`, `/refill`, `/events`, or `/summary` compatibility endpoints or old event summary behavior for this target architecture.
- Fill Handover Fuel Deltas symmetrically for positive and negative `amountLiters`: use `abs(amountLiters)` as fillable liters, split value 50/50 between previous and next interval users, create up to two cross-user ledger bookings, and self-elide a payer's own adjacent share when applicable.
- Treat deltas with `absLiters <= 1` as auto-acceptable small discrepancies that the agent should not proactively surface; mark larger deltas pending/needs attention so the agent asks whether to correct previous end liters, correct next start liters, or accept the delta.
- Validate surplus refill sufficiency, participant deletion constraints, manual correction inputs, Handover Fuel Delta lifecycle constraints, and settled-accounting constraints.

## Fitness Criteria

- Contract tests cover every documented HTTP endpoint and error class.
- Domain tests cover deficit, exact replacement, surplus, refill insufficiency, multi-lot pricing, own-obligation-first allocation, cheapest-first own surplus fill, remaining-most-expensive-first cross-user fill, Handover Fuel Delta derivation, symmetric positive/negative delta fills, auto-accept threshold behavior, cross-user ledger bookings, settlements, and deletion constraints.
- Fresh baseline schema tests prove the Handover Fuel Delta storage exists with references to adjacent intervals and can participate in transactional recalculation without changing settled bookings.
- Fresh baseline schema tests prove Carshare Service owns the carshare tables and Agent Runtime has no normal write path to them.
- Implementation should update the Carshare init schema directly with all current tables, including handover fuel deltas. No carshare migration scripts are needed for this step when a Carshare database reset is acceptable.
