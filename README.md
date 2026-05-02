# AI Infra

Small Oracle Free Tier stack for a self-hosted Agent Runtime App, shared Postgres data layer, and task-specific agent systems with version-controlled behavior.

## What this is

- Terraform for a single Oracle ARM VM.
- Docker Compose for Agent Runtime App, Carshare Service, and Postgres.
- Version-controlled agent systems under `agent-systems/`.
- Cross-system routing, model, resource, and permission config under `config/`.
- One concrete custom domain service: `carshare` for the shared-car fuel ledger.

## What this is not

- Not Kubernetes.
- Not a model gateway deployment.
- Not a checkpoint/resume platform.
- Not a durable-memory or artifact-management system.
- Not a general plugin framework before there are enough workloads to justify one.

The point is to keep the setup small, inspectable, and easy to rebuild.

## Layout

```text
.
├── .env.example
├── docker-compose.yml
├── architecture/                  # Structurizr/C4, ADRs, rules, contracts
├── agent-systems/                 # Git-versioned agent system definitions
│   ├── scratch/
│   └── carshare/
├── config/                        # Routing, models, resources, permissions
├── runtime/                       # Agent Runtime App
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── carshare/                      # Carshare HTTP domain service
├── postgres/
│   ├── init/                      # Fresh DB bootstrap
│   └── migrations/                # Existing DB migrations
├── infra/                         # Oracle VM Terraform
└── scripts/
```

Directory ownership rules:

- `agent-systems/` contains versioned behavior: workflow metadata, graph shape, prompts, tool declarations, and resource policies.
- `runtime/` contains generic execution code. It should not contain carshare-specific prompts or hidden runtime state.
- `config/` contains cross-system routing and policy. It must not contain secrets.
- `postgres/migrations/` contains explicit schema evolution for existing databases.
- Runtime artifacts are not a starter architecture concern; add storage only if future workflows need generated files, diffs, or reports.
- Long-term memory and knowledge promotion are not in the starter runtime; any durable memory requires a future ADR with explicit provenance.

## Services

### Agent Runtime App

- Compose service: `agent-runtime`.
- Private HTTP API: `127.0.0.1:${AGENT_RUNTIME_PORT:-19080}`.
- Health endpoint: `GET /health`.
- Direct test endpoint: `POST /messages`.
- Optional Telegram polling controlled by `AGENT_RUNTIME_TELEGRAM_ENABLED`.
- Loads local graph, prompt, tool, routing, model, resource, and permission config from the repo checkout.
- Persists channel bindings, sessions, messages, runs, and tool invocation audit to the `runtime` Postgres schema.
- Calls AWS Bedrock directly; no LiteLLM/Bifrost/model-gateway deployment is part of the starter stack.
- Calls Carshare Service over HTTP/JSON; it does not directly write `carshare.*` tables during normal operation.

Direct local smoke request:

```bash
curl -s http://127.0.0.1:${AGENT_RUNTIME_PORT:-19080}/messages \
  -H 'content-type: application/json' \
  -d '{"channel":"direct","channelChatId":"test","agentSystemId":"scratch","message":{"id":"local-1","text":"hello"}}'
```

### Carshare Service

- Compose service: `carshare`.
- Owns the `carshare` Postgres schema.
- Exposes HTTP/JSON endpoints for project ensure, handover, refill, recent events, and summary.
- The `carshare` agent system parses chat messages and writes durable domain facts only through this service.

### Postgres

- Compose service: `postgres`.
- Uses `pgvector/pgvector:pg16` so vector support is available later, but no embedding pipeline is forced now.
- Fresh bootstrap creates active schemas: `shared`, `carshare`, and `runtime`.
- Active roles: `role_tooling`, `role_runtime`, and `role_readonly`.

## First Bring-Up

1. Fill `infra/terraform.tfvars` from `infra/terraform.tfvars.example`.
2. Run `terraform -chdir=infra init`.
3. Run `terraform -chdir=infra apply`.
4. SSH to the VM as `ubuntu`.
5. Clone this repo to `/opt/ai-infra`.
6. Fill `.env` from `.env.example`.
7. Run `docker compose build`.
8. Run `docker compose up -d`.
9. Check services with `docker compose ps`.

## Existing Server Cutover

If an older checkout had an OpenClaw container and you do not need any existing Postgres data, use a clean volume reset. This is also the right recovery path after a failed first boot, because Postgres init scripts only run when the data directory is empty.

On the server after pulling this repo:

```bash
cd /opt/ai-infra
docker compose down --volumes --remove-orphans
docker compose build postgres carshare agent-runtime
docker compose up -d postgres carshare agent-runtime
docker compose ps
```

If keeping an existing Postgres volume instead, apply the runtime migration once:

```bash
docker compose exec -T postgres psql \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -f /dev/stdin < postgres/migrations/001-runtime-schema.sql
```

The old host directory `/srv/openclaw/state` can be deleted manually on the server if it exists and has no useful data.

## Runtime Env

Required operational values in `.env`:

```env
POSTGRES_DB=ai_infra
POSTGRES_USER=postgres
POSTGRES_PASSWORD=...
ROLE_TOOLING_PASSWORD=...
ROLE_RUNTIME_PASSWORD=...
ROLE_READONLY_PASSWORD=...

AWS_REGION=eu-north-1
AWS_DEFAULT_REGION=eu-north-1
AWS_BEARER_TOKEN_BEDROCK=...

TELEGRAM_BOT_TOKEN=...
TELEGRAM_USER_ID=...
TELEGRAM_CARSHARE_GROUP_ID=...
AGENT_RUNTIME_TELEGRAM_ENABLED=true
```

Keep `AGENT_RUNTIME_TELEGRAM_ENABLED=false` until direct HTTP health and message smoke tests pass.

### Updating Server Env

Keep real secrets in local `.env` and the server `/opt/ai-infra/.env`; do not commit them. The helper script reads connection details from the gitignored `.deploy.env` file.

First-time local setup:

```bash
cp .deploy.env.example .deploy.env
```

Update the server env:

```bash
scripts/update-env.sh
```

Update and recreate services:

```bash
scripts/update-env.sh --restart
```

The script copies `.env` over SSH/SCP, installs it as `/opt/ai-infra/.env` with mode `600`, and runs `docker compose config --quiet` remotely.

`--restart` recreates `carshare` and `agent-runtime`. If you change Postgres database names or role passwords for an existing volume, reset the volume or update the database roles manually; Postgres init scripts only run on an empty data directory.

## Telegram Setup

1. Create a bot in `@BotFather`.
2. Put the token into `.env` as `TELEGRAM_BOT_TOKEN`.
3. Put your numeric Telegram user ID into `.env` as `TELEGRAM_USER_ID`.
4. Start the stack and test direct HTTP first.
5. Add the bot to the car-sharing group.
6. Put the group ID into `.env` as `TELEGRAM_CARSHARE_GROUP_ID`.
7. Set `AGENT_RUNTIME_TELEGRAM_ENABLED=true`.
8. Restart the runtime with `docker compose up -d --force-recreate agent-runtime`.

Direct chats route to `scratch`; the configured car-sharing group routes to `carshare`.

## Carshare Workflow

Example messages in the bound group:

- `handover to Anna, 23 liters left`
- `I filled up 31.4 liters for 56.21 euro`
- `tank is at 17l, your turn now`
- `what is the current balance?`

The `carshare` agent should parse the message, store a structured event through Carshare Service when fields are complete, ask one clarification question when fields are missing, and answer summary questions from the same ledger.

## Verification

Because the local host may not have Node installed, run runtime tests in Docker:

```bash
docker run --rm -v "$PWD:/workspace:ro" -w /tmp node:24-bookworm-slim sh -lc \
  "cp -a /workspace/runtime /tmp/runtime && cp -a /workspace/config /tmp/config && cp -a /workspace/agent-systems /tmp/agent-systems && cp -a /workspace/postgres /tmp/postgres && cd /tmp/runtime && npm ci && npm test"
docker compose config --quiet
docker compose build agent-runtime
```

## Access Model

- Keep the Agent Runtime App bound to loopback unless you intentionally add an ingress layer.
- Keep Postgres internal to Docker only.
- Put channel secrets outside git.
- Use allowlists for personal channels when possible.

## Backups

`scripts/backup.sh` writes compressed Postgres dumps to `./backup/`.

Off-host backup to Oracle Object Storage is a reasonable later step, but it is not forced into the starter stack.
