## Ticket 001: Accounting Contract Tests

### Goal
Update pure domain tests to encode revised surplus allocation and Handover Fuel Delta split-fill behavior.

### Model References
- ADR-0007 Allow Handover Fuel Deltas
- BR-004/BR-005/BR-007
- `architecture/implementation-contracts/0002-carshare-replacement-obligation-ledger.md`

### Scope
- In scope: `carshare/test/accounting.test.js` and test-only assertions.
- Out of scope: production implementation.

### Expected Files Or Modules
- `carshare/test/accounting.test.js`

### Allowed Changes
- Add/update tests for cheapest-first own surplus, remaining-most-expensive cross-user fills, positive and negative handover delta booking helper semantics.

### Forbidden Changes
- Do not weaken existing deficit/refill sufficiency expectations.

### Tests And Checks
- `npm test` from `carshare` should be the target command, though failures are expected until implementation ticket completes.

### Dependencies
- None.

### Completion Criteria
- Tests clearly fail against old most-expensive-first behavior and pass once implementation is corrected.

### Escalation Conditions
- Missing domain semantics beyond the approved architecture.
