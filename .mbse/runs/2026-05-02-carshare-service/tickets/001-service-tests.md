## Ticket 001: Service accounting tests

### Goal
Test replacement-obligation accounting independent of Postgres.

### Model References
- ADR-0004
- BR-003, BR-004, BR-005, BR-006

### Scope
- Add carshare Node tests for pure allocation logic.

### Expected Files Or Modules
- `carshare/src/accounting.js`
- `carshare/test/accounting.test.mjs`
- `carshare/package.json`

### Completion Criteria
- Tests cover own-first, cross-user booking, expensive-surplus-first, insufficient refill rejection.
