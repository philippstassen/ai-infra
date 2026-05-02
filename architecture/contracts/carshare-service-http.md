# Carshare Service HTTP and Data Contract

Status: Existing documented

## Boundary

Carshare Service exposes the canonical Carshare domain boundary as HTTP/JSON. Agent Runtime App clients call this API for carshare project, ledger event, and summary behavior. An MCP server for Carshare is out of scope for the initial architecture.

## Conventions

- Request bodies use JSON with camelCase fields.
- Current `project` and `event` rows returned from write/list endpoints are DB-shaped with snake_case fields because they are returned from `RETURNING *` or `SELECT *`.
- The current `summary` response uses API-shaped camelCase fields from `carshare/src/summary.js`.
- v1 clients must handle the current mixed response shape. A future API version may normalize response casing.
- Validation errors use `400 { "error": "..." }`. Unknown project is currently a `400` validation error.

## HTTP Endpoints

### `GET /health`

Returns service health.

Response:

```json
{ "ok": true }
```

Status codes:

- `200`: service and database are reachable.
- `500`: unexpected server/database error with `{ "error": "..." }`.

### `POST /v1/projects/ensure`

Ensures a project exists, creating or updating it by slug.

Request fields:

- `slug` (required string): trimmed and lowercased.
- `name` (optional string): defaults to `slug` when blank or omitted.
- `currency` (optional string): uppercased; defaults to `EUR`.
- `baselinePricePerLiter` (optional number/string): non-negative; defaults from service environment when omitted.

Example request:

```json
{
  "slug": "shared-car",
  "name": "Shared Car",
  "currency": "EUR",
  "baselinePricePerLiter": 1.85
}
```

Example response:

```json
{
  "project": {
    "slug": "shared-car",
    "name": "Shared Car",
    "currency": "EUR",
    "baseline_price_per_liter": "1.8500",
    "created_at": "2026-05-01T12:00:00.000Z",
    "updated_at": "2026-05-01T12:00:00.000Z"
  }
}
```

Status codes:

- `200`: project ensured.
- `400`: invalid `slug` or `baselinePricePerLiter`.

### `POST /v1/projects/:slug/handover`

Records a handover event for project `slug`.

Request fields:

- `holder` (required string): current holder; trimmed and must be non-empty.
- `litersRemaining` (required number/string): non-negative.
- `occurredAt` (optional timestamp): parses as a JavaScript `Date`; defaults to now.
- `recordedBy` (optional string)
- `note` (optional string)
- `rawText` (optional string)

Example request:

```json
{
  "holder": "Ada",
  "litersRemaining": 18.5,
  "occurredAt": "2026-05-01T12:00:00Z",
  "recordedBy": "telegram:42",
  "note": "handover at station",
  "rawText": "Ada has the car with 18.5 L"
}
```

Example response:

```json
{
  "event": {
    "id": 101,
    "project_slug": "shared-car",
    "kind": "handover",
    "occurred_at": "2026-05-01T12:00:00.000Z",
    "holder": "Ada",
    "payer": null,
    "liters_remaining": "18.500",
    "liters_added": null,
    "total_cost": null,
    "price_per_liter": null,
    "recorded_by": "telegram:42",
    "note": "handover at station",
    "raw_text": "Ada has the car with 18.5 L",
    "created_at": "2026-05-01T12:00:01.000Z"
  }
}
```

Status codes:

- `201`: event recorded.
- `400`: unknown project, missing `holder`, invalid `litersRemaining`, or invalid `occurredAt`.

### `POST /v1/projects/:slug/refill`

Records a refill event for project `slug`.

Request fields:

- `payer` (required string): payer; trimmed and must be non-empty.
- `litersAdded` (required number/string): positive.
- `totalCost` (required number/string): non-negative.
- `occurredAt` (optional timestamp): parses as a JavaScript `Date`; defaults to now.
- `recordedBy` (optional string)
- `note` (optional string)
- `rawText` (optional string)

Example request:

```json
{
  "payer": "Bruno",
  "litersAdded": 35.2,
  "totalCost": 67.5,
  "occurredAt": "2026-05-02T08:30:00Z",
  "recordedBy": "telegram:42"
}
```

Example response:

```json
{
  "event": {
    "id": 102,
    "project_slug": "shared-car",
    "kind": "refill",
    "occurred_at": "2026-05-02T08:30:00.000Z",
    "holder": null,
    "payer": "Bruno",
    "liters_remaining": null,
    "liters_added": "35.200",
    "total_cost": "67.50",
    "price_per_liter": "1.9176",
    "recorded_by": "telegram:42",
    "note": null,
    "raw_text": null,
    "created_at": "2026-05-02T08:30:01.000Z"
  }
}
```

Status codes:

- `201`: event recorded.
- `400`: unknown project, missing `payer`, invalid `litersAdded`, invalid `totalCost`, or invalid `occurredAt`.

### `GET /v1/projects/:slug/events?limit=20`

Returns recent events for project `slug`, ordered newest first.

Query parameters:

- `limit` (optional integer): default `20`, valid range `1..500`.

Example response:

```json
{
  "events": [
    {
      "id": 102,
      "project_slug": "shared-car",
      "kind": "refill",
      "occurred_at": "2026-05-02T08:30:00.000Z",
      "payer": "Bruno",
      "liters_added": "35.200",
      "total_cost": "67.50",
      "price_per_liter": "1.9176"
    }
  ]
}
```

Status codes:

- `200`: events returned.
- `400`: unknown project or invalid `limit`.

### `GET /v1/projects/:slug/summary`

Returns calculated project summary data from existing events.

Example response shape:

```json
{
  "project": {
    "slug": "shared-car",
    "name": "Shared Car",
    "currency": "EUR",
    "baselinePricePerLiter": 1.85
  },
  "balances": [
    { "name": "Ada", "balance": -12.34, "status": "owes" },
    { "name": "Bruno", "balance": 12.34, "status": "should_receive" }
  ],
  "state": {
    "currentHolder": "Ada",
    "tankLiters": 18.5,
    "estimatedTankValue": 35.48,
    "estimatedPricePerLiter": 1.9176,
    "startingTankLiters": 20,
    "startingTankValue": 37,
    "tankDeltaLiters": -1.5,
    "tankDeltaValue": -1.52
  },
  "warnings": []
}
```

Status codes:

- `200`: summary returned.
- `400`: unknown project.

The implemented route and validation behavior is in `carshare/src/server.js`; summary calculation is in `carshare/src/summary.js`.

## Data Ownership

Carshare Service owns the `carshare` Postgres schema. Agent Runtime App must not write these tables directly during normal operation.

### `carshare.projects`

- `slug text primary key`
- `name text not null`
- `currency text not null default 'EUR'`
- `baseline_price_per_liter numeric(12,4)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `carshare.events`

- `id bigserial primary key`
- `project_slug text not null references carshare.projects(slug) on delete cascade`
- `kind text not null check (kind in ('handover', 'refill'))`
- `occurred_at timestamptz not null`
- `holder text`
- `payer text`
- `liters_remaining numeric(12,3)`
- `liters_added numeric(12,3)`
- `total_cost numeric(12,2)`
- `price_per_liter numeric(12,4)`
- `recorded_by text`
- `note text`
- `raw_text text`
- `created_at timestamptz not null default now()`

Index: `carshare_events_project_occurred_idx` on `(project_slug, occurred_at, id)`.

Source of truth for current DDL: `postgres/init/10-schema.sql`.
