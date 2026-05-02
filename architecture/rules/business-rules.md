# Business Rules

## BR-001 Participant Removal Constraints

Status: Accepted
Type: Constraint
Applies To: Carshare participants

Statement:
Participants can only be removed when they have no open obligations and no unsettled debit or credit ledger bookings.

Rationale:
Removal must not hide unresolved fuel debts or credits.

Related:
- ADR-0004
- Contract: `architecture/contracts/carshare-service-http.md`

## BR-002 Driver Interval Tank Consistency

Status: Accepted
Type: Policy
Applies To: Driver intervals

Statement:
When an interval's explicit end tank liters and the next interval's explicit start tank liters are both known and differ, the system derives or updates a Handover Fuel Delta rather than rejecting the intervals; inference from the next interval start remains permitted when the prior end is omitted.

Rationale:
Adjacent participants may report different explicit readings, and the domain needs a traceable shared discrepancy instead of a hard equality invariant.

Related:
- ADR-0007
- Contract: `architecture/contracts/carshare-service-http.md`

## BR-003 Interval Delta Creates Obligation Or Surplus

Status: Accepted
Type: Invariant
Applies To: Driver intervals, obligations, surplus

Statement:
A completed interval's `endTankLiters - startTankLiters` creates unpriced owed liters when negative, no obligation or surplus when zero, and priced surplus liters when positive; refills never settle same-interval deficits directly.

Rationale:
Replacement responsibility is determined by the possession interval's net tank change rather than by tank inventory accounting.

Related:
- ADR-0004
- Contract: `architecture/contracts/carshare-service-http.md`

## BR-004 Surplus Refill Pricing

Status: Accepted
Type: Constraint
Applies To: Refills, surplus

Statement:
Surplus requires sufficient refill lots in the interval; the same participant's previous obligations consume the cheapest available surplus refill liters first, and remaining refill liters used for cross-participant fills are consumed most-expensive-first.

Rationale:
Surplus value must be backed by actual paid fuel, repair a participant's own prior obligations at the cheapest available replacement cost first, and credit cross-participant surplus providers at the highest remaining replacement cost deterministically.

Related:
- ADR-0007
- Contract: `architecture/contracts/carshare-service-http.md`

## BR-005 Surplus Allocation Order

Status: Accepted
Type: Policy
Applies To: Obligations, surplus allocation

Statement:
Surplus fills the same participant's previous open obligations first, then other participants' previous open obligations; obligations are unpriced and selected oldest-first within each scope, while refill lot ordering is governed by BR-004.

Rationale:
Participants should first repair their own prior deficits, and remaining allocation must be deterministic and explainable.

Related:
- ADR-0004
- ADR-0007
- Contract: `architecture/contracts/carshare-service-http.md`

## BR-006 Ledger Bookings And Settlements

Status: Accepted
Type: Policy
Applies To: Ledger bookings, settlements

Statement:
Cross-participant obligation and Handover Fuel Delta fills create monetary ledger bookings from debtor to creditor, and settlements mark included ledger bookings settled.

Rationale:
Money owed between participants must remain traceable until explicitly settled.

Related:
- ADR-0004
- ADR-0007
- Contract: `architecture/contracts/carshare-service-http.md`

## BR-007 Handover Fuel Delta Responsibility

Status: Accepted
Type: Policy
Applies To: Driver intervals, Handover Fuel Deltas, ledger bookings

Statement:
A Handover Fuel Delta uses `amountLiters = next.startLiters - previous.endLiters`; both positive and negative deltas are fillable by `abs(amountLiters)`, responsibility is split 50/50 between the previous interval user and the next interval user, deltas with `absLiters <= 1` may be auto-accepted without proactively bothering the user, and deltas with `absLiters > 1` require user attention to correct either linked reading or accept the delta.

Rationale:
Handover discrepancies should be handled symmetrically, small measurement differences should not interrupt users, and larger discrepancies require an explicit correction-or-acceptance choice.

Related:
- ADR-0007
- Contract: `architecture/contracts/carshare-service-http.md`
