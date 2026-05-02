## Ticket 003: Service Schema and API

### Goal
Update the Carshare Service fresh schema and HTTP implementation for Handover Fuel Deltas and remove legacy compatibility.

### Model References
- `architecture/contracts/carshare-service-http.md`
- `architecture/implementation-contracts/0002-carshare-replacement-obligation-ledger.md`
- ADR-0007 and AR-009

### Scope
- In scope: `postgres/init/10-schema.sql`, `carshare/src/server.js`, removing obsolete carshare migration file if present.
- Out of scope: runtime DB migrations, deployable topology.

### Expected Files Or Modules
- `postgres/init/10-schema.sql`
- `carshare/src/server.js`
- `postgres/migrations/002-carshare-replacement-ledger.sql` removal if present and unneeded.

### Allowed Changes
- Remove legacy event table/endpoints/summary import.
- Add handover fuel delta table to baseline schema.
- Replace hard adjacent interval equality with delta derivation.
- Add list/accept/fill delta endpoints.
- Update ledger bookings to reference delta fills when applicable.

### Forbidden Changes
- Do not implement legacy endpoints.
- Do not add carshare migration requirements.

### Tests And Checks
- Add service or domain tests if local harness exists; otherwise syntax/build checks.

### Dependencies
- Ticket 002 preferred.

### Completion Criteria
- Server syntax passes and contract endpoints are implemented.

### Escalation Conditions
- Settled delta recalculation semantics require a larger reversal model.
