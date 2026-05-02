## Ticket 004: Deployment And Docs

### Goal
Wire Agent Runtime App into Docker Compose and document operational knobs.

### Model References
- Deployment view `deployment-oracle-compose`.
- ADR-0001 modular monolith runtime.

### Scope
- In scope: Docker Compose, env example, README/runtime README updates.
- Out of scope: public webhook ingress, new domain service containers.

### Expected Files Or Modules
- `docker-compose.yml`
- `.env.example`
- `README.md`
- `runtime/README.md`

### Allowed Changes
- Add `agent-runtime` service and docs.

### Forbidden Changes
- Do not expose Agent Runtime publicly by default.
- Remove the transitional gateway only after an explicit request.

### Tests And Checks
- `docker compose config --quiet`.
- `docker compose build agent-runtime`.

### Dependencies
- Ticket 003.

### Completion Criteria
- Compose can build/run the runtime service with private health endpoint and optional Telegram polling.

### Escalation Conditions
- User requires public Telegram webhooks instead of polling.
