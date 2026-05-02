## Ticket 002: Service API and DB implementation

### Goal
Implement replacement-obligation HTTP API and schema.

### Model References
- `architecture/contracts/carshare-service-http.md`
- `architecture/implementation-contracts/0002-carshare-replacement-obligation-ledger.md`

### Scope
- SQL schema init + migration.
- Express endpoints.
- Recalculation on mutating interval/refill/obligation operations.

### Completion Criteria
- Carshare tests and runtime tests pass.
