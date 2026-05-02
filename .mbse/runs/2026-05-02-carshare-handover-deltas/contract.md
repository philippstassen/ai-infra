# Carshare Handover Fuel Deltas Implementation Contract

Source architecture:
- `architecture/implementation-contracts/0002-carshare-replacement-obligation-ledger.md`
- `architecture/contracts/carshare-service-http.md`
- `architecture/rules/business-rules.md`
- ADR-0004 and ADR-0007

Scope:
- Remove old event compatibility endpoints and schema from the Carshare Service target implementation.
- Treat the Carshare domain schema as a fresh baseline; update `postgres/init/10-schema.sql` directly and do not require carshare migrations.
- Derive persisted Handover Fuel Deltas for adjacent explicit interval tank mismatches instead of rejecting them.
- Support listing, accepting, and filling Handover Fuel Deltas.
- Update surplus allocation so own prior obligations use cheapest refill liters first; remaining cross-user fills use most-expensive remaining liters.

Forbidden:
- Do not change the approved architecture model.
- Do not add deployable services or direct Agent Runtime writes to carshare tables.
- Do not retain `/handover`, `/refill`, `/events`, or `/summary` compatibility endpoints.

Verification:
- Carshare unit/domain tests pass.
- Syntax checks pass.
- Docker Compose configuration remains valid.
