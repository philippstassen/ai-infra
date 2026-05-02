## Ticket 002: Accounting Implementation

### Goal
Implement revised pure surplus allocation and a pure Handover Fuel Delta fill booking helper.

### Model References
- BR-004/BR-005/BR-007
- ADR-0007

### Scope
- In scope: `carshare/src/accounting.js`, focused implementation tests if needed.
- Out of scope: Express routes, SQL schema.

### Expected Files Or Modules
- `carshare/src/accounting.js`
- `carshare/test/accounting.test.js` only for implementation-aligned focused tests if unavoidable.

### Allowed Changes
- Change lot ordering to own cheapest-first then cross-user remaining-most-expensive-first.
- Add exported helper for delta fill bookings using abs(amountLiters) and 50/50 adjacent shares, self-eliding payer's own share.

### Forbidden Changes
- Do not remove required test coverage.

### Tests And Checks
- Run `npm test` in `carshare` if possible.

### Dependencies
- Ticket 001.

### Completion Criteria
- Pure accounting tests pass.

### Escalation Conditions
- Disagreement between tests and architecture contract.
