## Ticket 002: Runtime DB Schema

### Goal
Implement starter runtime DB schema and role grants without adding excluded tables.

### Model References
- `architecture/contracts/runtime-db-schema-v1.md`
- ADR-0003 thin starter runtime scope.

### Scope
- In scope: SQL migration and init bootstrap updates.
- Out of scope: carshare domain schema redesign.

### Expected Files Or Modules
- `postgres/init/00-init.sh`
- `postgres/init/10-schema.sql`
- `postgres/migrations/001-runtime-schema.sql`
- `.env.example`

### Allowed Changes
- Add `role_runtime`, runtime schema/tables/indexes/grants.

### Forbidden Changes
- Do not add approvals, checkpoints, artifacts, or knowledge tables.

### Tests And Checks
- SQL contract tests in runtime test suite.

### Dependencies
- None.

### Completion Criteria
- Fresh Postgres init creates documented runtime tables and grants runtime role.

### Escalation Conditions
- Need for existing-volume migration runner beyond this starter bootstrap.
