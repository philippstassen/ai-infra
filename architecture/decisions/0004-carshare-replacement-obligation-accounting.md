# 0004 Carshare Replacement-Obligation Accounting

Status: Accepted
Date: 2026-05-02

## Context

The Carshare Service needs a durable domain model for shared fuel responsibility. The existing event summary approach blends handovers and refills into tank value/account balances, which makes user obligations, paid refill surplus, and settlement state difficult to express as stable API and data contracts.

## Decision

Use replacement-obligation accounting for Carshare Service. A completed driver interval creates obligations or surplus solely from `delta = endTankLiters - startTankLiters`: deficits create unpriced liter obligations, exact replacement creates no obligation or surplus, and surplus creates priced liters backed by refill lots in that interval.

Refills do not settle same-interval deficits directly. Surplus is allocated to the same participant's previous open obligations before other participants' previous open obligations; obligations are selected oldest-first. Cross-participant fills create monetary ledger bookings from debtor to creditor at the refill lot price. ADR-0007 refines adjacent interval mismatch handling and surplus refill lot ordering.

Reject FIFO, LIFO, and average tank-inventory accounting because they model the tank as priced inventory and obscure the simpler domain obligation: each participant either returns the car with less fuel, the same fuel, or more fuel than they received.

## Consequences

- The API and database model can expose driver intervals, obligations, refills, ledger bookings, and settlements directly.
- Allocation is deterministic and testable without pricing open obligations in advance.
- Editing or deleting intervals/refills/obligations requires transactional recalculation for unsettled artifacts and rejection when settled ledger bookings would change.
- Existing event-based v1 implementation must be replaced before it conforms to this contract.
- Legacy event/summary endpoint compatibility is no longer part of the target architecture by user decision; the Carshare database can be reset and started from the replacement-obligation schema for this project unless a future production data-retention decision changes that constraint.

## Related

- Structurizr: `container`, `dynamic-carshare-flow`
- Rules: BR-001 through BR-006
- Contracts: `architecture/contracts/carshare-service-http.md`
- Refined by: ADR-0007
