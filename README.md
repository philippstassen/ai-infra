# AI Infra

Minimal Oracle Free Tier structure for a self-hosted OpenClaw gateway, a shared Postgres data layer, and task-specific agents with version-controlled tooling.

## What this is

- Terraform for a single Oracle ARM VM.
- Docker Compose for OpenClaw and Postgres.
- Version-controlled agent workspaces under `openclaw/config/agents/`.
- A shared Postgres layer for future custom tools and agent data.
- One concrete custom tool path: a `carshare` service and CLI for the shared-car use case.

## What this is not

- Not Kubernetes.
- Not Snowflake.
- Not a fully abstract platform before you have real workloads.
- Not a promise that OpenClaw itself should store everything in Postgres.

The point is to keep the setup small, inspectable, and easy to rebuild.

## Layout

```text
.
├── .env.example
├── docker-compose.yml
├── carshare/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── infra/
│   ├── cloud-init.yaml
│   ├── main.tf
│   ├── outputs.tf
│   ├── terraform.tfvars.example
│   ├── variables.tf
│   └── versions.tf
├── openclaw/
│   ├── Dockerfile
│   └── config/
│       ├── agents/
│       ├── openclaw.json5
│       └── skills/
├── postgres/
│   └── init/
│       ├── 00-init.sh
│       └── 10-schema.sql
└── scripts/
    └── backup.sh
```

## Design choices

### Oracle

- One `VM.Standard.A1.Flex` VM.
- Only SSH is opened by default.
- No public database.
- No public OpenClaw dashboard.

This is the simplest setup that still rebuilds cleanly.

### OpenClaw

- One `scratch` agent exists for safe early testing.
- One `carshare` agent exists for a real task-specific workflow.
- The `carshare` agent is meant to be bound to one specific chat, not used as a general assistant.

This is closer to the actual value of multi-agent setups: separate durable contexts for separate jobs.

### Data layer

- Postgres is included from day 1.
- `pgvector` is available, but no embedding pipeline is forced yet.
- Schemas are split into `openclaw`, `agent_data`, and `shared`.
- Roles are split into `role_openclaw`, `role_tooling`, and `role_readonly`.

This gives you a clean shared data plane for future tools without overbuilding a warehouse.

### Custom tooling

- `carshare` is a small HTTP service plus CLI wrapper.
- OpenClaw can use it through a skill with the normal `exec` tool.
- The agent still interprets unstructured chat, but the records and balances live in Postgres.

This is the right abstraction level here. A full plugin framework would be extra overhead too early.

## First bring-up

1. Fill `infra/terraform.tfvars` from `infra/terraform.tfvars.example`.
2. Run `terraform -chdir=infra init`.
3. Run `terraform -chdir=infra apply`.
4. SSH to the VM as `ubuntu`.
5. Clone this repo to `/opt/ai-infra`.
6. Fill `.env` from `.env.example`.
7. Create the OpenClaw runtime state directory with `sudo mkdir -p /srv/openclaw/state && sudo chown -R 1000:1000 /srv/openclaw/state`.
8. Run `docker compose build`.
9. Run `docker compose up -d`.
10. Tunnel the dashboard with `ssh -L 18789:127.0.0.1:18789 ubuntu@<ip>`.

## Overnight A1 capacity retry

Oracle Free Tier ARM capacity is often unavailable. If `terraform apply` fails with `Out of host capacity`, use the conservative retry wrapper:

```bash
scripts/retry-oci-a1.sh
```

The script runs one Terraform apply at a time, checks each availability domain once per round, waits 10 seconds between ADs, waits 2-5 minutes with jitter between rounds, backs off for one hour on `429` rate limits, and stops on non-capacity errors.

Optional overrides:

```bash
RETRY_MAX_HOURS=12 \
RETRY_AD_SLEEP_SECONDS=10 \
RETRY_SLEEP_MIN_SECONDS=120 \
RETRY_SLEEP_MAX_SECONDS=300 \
scripts/retry-oci-a1.sh
```

If availability-domain auto-discovery fails, pass the exact AD names from OCI:

```bash
OCI_ADS="xxxx:EU-FRANKFURT-1-AD-1,xxxx:EU-FRANKFURT-1-AD-2,xxxx:EU-FRANKFURT-1-AD-3" \
scripts/retry-oci-a1.sh
```

## OpenClaw setup notes

- `openclaw/config/openclaw.json5` is the git-tracked source config.
- The running container copies that source config into `/var/lib/openclaw/config/openclaw.json5` before startup.
- Mutable OpenClaw state lives on the host at `/srv/openclaw/state`, mounted as `/var/lib/openclaw` in the container.
- Do not edit OpenClaw config on the server as the source of truth. Edit locally, push, pull on the server, and restart.
- Telegram is the intended first channel.
- The `carshare` agent should be bound to one specific Telegram group once you know the group ID.
- WhatsApp is left as scaffolded config because the plugin install and login flow is interactive.

Good sequence:

1. Start with Telegram.
2. Confirm the dashboard works over SSH tunnel.
3. Bind the car-sharing group to the `carshare` agent.
4. Add WhatsApp only after the first channel is stable.
5. Add more agents only when they need genuinely separate workspaces or identities.

## Telegram-first setup

1. Create a bot in `@BotFather`.
2. Put the token into `.env` as `TELEGRAM_BOT_TOKEN`.
3. Put your numeric Telegram user ID into `.env` as `TELEGRAM_USER_ID`.
4. Start the stack and message the bot directly first.
5. Add the bot to the car-sharing group.
6. Find the group ID from OpenClaw logs or Telegram API updates.
7. Put the group ID into `.env` as `TELEGRAM_CARSHARE_GROUP_ID`.
8. Restart the OpenClaw container.

At that point, direct chats go to `scratch`, while the car-sharing group goes to `carshare`.

## Carshare workflow

The intended workflow is deliberately simple.

Example messages in the bound group:

- `handover to Anna, 23 liters left`
- `I filled up 31.4 liters for 56.21 euro`
- `tank is at 17l, your turn now`
- `what is the current balance?`

The `carshare` agent should:

- parse the unstructured message,
- store a structured event through `carshare-tool`,
- report the updated state when useful,
- answer summary questions from the same ledger.

Important limitation:

- the running balance is relative to the starting tank state.
- if the tank level is very different from when you started tracking, some value is still sitting in the tank and is not yet fully settled between people.

That is reasonable for this use case and much simpler than building full inventory accounting.

## Access model

- Keep the dashboard local to the VM and tunnel it with `ssh -L 18789:127.0.0.1:18789 ubuntu@<ip>`.
- Keep Postgres internal to Docker only.
- Put channel secrets outside git.
- Use allowlists for personal channels when possible.

## Backups

`scripts/backup.sh` writes compressed Postgres dumps to `./backup/`.

This is intentionally local-first. Off-host backup to Oracle Object Storage is a good next step, but it is not forced into the initial structure.

## Reasonable next steps

1. Replace placeholder IDs and tokens in `openclaw/config/openclaw.json5`.
2. Bind the `carshare` agent to the real Telegram group ID.
3. Test the `carshare` workflow with a few example handovers and refills.
4. Add off-host backups after the stack is stable.
5. Add Tailscale when you want cleaner remote access than SSH tunneling.
