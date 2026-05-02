# Carshare Service HTTP and Data Contract

Status: Proposed target replacement-obligation API

## Boundary

Carshare Service exposes the canonical Carshare domain boundary as HTTP/JSON. Agent Runtime App clients call this target replacement-obligation API for carshare projects, participants, driver intervals, handover fuel deltas, refills, obligations, ledger bookings, and settlements. Agent Runtime App must not write Carshare-owned Postgres tables directly during normal operation.

This contract does not preserve the previous event/summary API shape. Legacy `/handover`, `/refill`, `/events`, and `/summary` compatibility endpoints are outside the target architecture.

## Accounting Model

A completed driver interval defines fuel responsibility from its net tank delta:

- `delta = endTankLiters - startTankLiters`.
- `delta < 0`: create an unpriced obligation for `abs(delta)` liters owed by the interval driver.
- `delta = 0`: create no obligation or surplus.
- `delta > 0`: create priced surplus liters for `delta`, backed by refill lots recorded in the same interval.

Refills inside an interval never settle that interval's deficit directly. They only price surplus liters when the interval ends with more fuel than it started. If surplus exists, the interval must have enough refill liters to cover the surplus. When multiple refill lots can price surplus, own prior obligations consume the cheapest refill liters first; remaining refill liters used for cross-participant fills are consumed most-expensive-first so the surplus provider is credited at the highest remaining replacement cost.

Surplus allocation fills the same participant's previous open obligations first, then other participants' previous open obligations. Within each scope, candidate obligations are selected oldest first. Obligations are unpriced until filled; pricing belongs to the refill/surplus/fill source lots. Cross-participant fills create ledger bookings from debtor to creditor at the surplus refill lot price.

Adjacent intervals may carry mismatched explicit handover readings. When a previous interval's explicit `endLiters` and the next interval's explicit `startLiters` are both known and differ, the service derives or updates a Handover Fuel Delta instead of rejecting the intervals. `amountLiters = next.startLiters - previous.endLiters`; both positive and negative differences are handled symmetrically using `absLiters = abs(amountLiters)`. Filling a Handover Fuel Delta creates participant shares of half the filled value for the previous interval user and half for the next interval user, with self-elision allowed when the filler is one of the adjacent participants.

## Conventions

- Request and response bodies use JSON with camelCase fields.
- Monetary values and liter quantities are decimal numbers; implementations should persist them with fixed precision and avoid binary floating-point arithmetic in accounting calculations.
- Timestamps are ISO 8601 strings. If an optional timestamp is omitted, the service uses the request time.
- Project `slug` identifies the project path segment and must already exist unless using `POST /v1/projects/ensure`.
- A participant may be identified by `userId` or by `name` only where explicitly documented; if both are supplied they must refer to the same participant.
- Validation errors use `400 { "error": "...", "code": "..." }`. Unknown resources use `404`. Deletion or edit requests that violate settled-accounting constraints use `409`.
- Derived obligations, Handover Fuel Deltas, surplus allocations, and ledger bookings must be recalculated transactionally when an unsettled source edit is allowed.
- Settled ledger bookings are immutable except through an explicit future reversal contract; edits/deletes that would change settled bookings are rejected.
- Write endpoints should support an optional `Idempotency-Key` header for safe client retries. Reusing a key with a different request body is a conflict.

## HTTP Endpoints

### `GET /health`

Returns service health.

Response:

```json
{ "ok": true }
```

Status codes:

- `200`: service and database are reachable.
- `500`: unexpected service/database error.

### `POST /v1/projects/ensure`

Ensures a project exists, creating or updating it by slug.

Request fields:

- `slug` (required string): trimmed and lowercased.
- `name` (optional string): defaults to `slug` when blank or omitted.
- `currency` (optional string): uppercased; defaults to `EUR`.

Response: `{ "project": { "slug", "name", "currency", "createdAt", "updatedAt" } }`.

Status codes: `200`, `400`.

### Users / Participants

Participants are project-scoped people who can drive, owe fuel, pay refills, receive credits, and participate in settlements.

#### `GET /v1/projects/:slug/users`

Lists project participants sorted by name.

Response:

```json
{
  "users": [
    { "id": "usr_1", "name": "Ada", "active": true, "createdAt": "2026-05-02T10:00:00Z" }
  ]
}
```

#### `POST /v1/projects/:slug/users`

Adds a participant.

Request fields:

- `name` (required string): unique within the project after trimming/canonicalization.

Response: `{ "user": { "id", "name", "active", "createdAt" } }`.

Status codes: `201`, `400`, `404`, `409` for duplicate canonical name.

#### `PATCH /v1/projects/:slug/users/:userId`

Edits participant display data or active flag.

Request fields: `name` (optional string), `active` (optional boolean).

Status codes: `200`, `400`, `404`, `409` for duplicate canonical name.

#### `DELETE /v1/projects/:slug/users/:userId`

Removes a participant only when they have no open obligations and no unsettled debit or credit ledger bookings. Historical settled records may retain the participant reference.

Status codes: `204`, `404`, `409`.

### Driver Intervals

A driver interval records possession of the car by one participant and the tank liters at possession start and completion. Adjacent explicit readings may differ; the service reports the interval values as entered and derives a Handover Fuel Delta for the shared discrepancy when both sides are known.

#### `GET /v1/projects/:slug/driver-intervals?limit&from&to`

Lists intervals sorted by `startedAt` ascending, optionally filtered by interval start time.

Response:

```json
{
  "driverIntervals": [
    {
      "id": "int_1",
      "user": { "id": "usr_1", "name": "Ada" },
      "startedAt": "2026-05-02T10:00:00Z",
      "startLiters": 18.5,
      "endLiters": 14.0,
      "endLitersInferred": false,
      "deltaLiters": -4.5,
      "handoverFuelDeltaIds": ["hfd_1"]
    }
  ]
}
```

#### `POST /v1/projects/:slug/driver-intervals`

Creates a driver interval.

Request fields:

- `userId` or `name` (required): participant responsible for the interval. `userId` must reference an existing participant. `name` must resolve exactly one existing active participant after canonicalization; unknown or ambiguous names are rejected. Clients that want to add a new participant must call `POST /users` first.
- `startLiters` (required number): non-negative tank liters at possession start.
- `startedAt` (optional timestamp): defaults to now.
- `endLiters` (optional number): non-negative tank liters at possession completion.

Status codes: `201`, `400`, `404`, `409` for settled-accounting conflicts.

#### `PATCH /v1/projects/:slug/driver-intervals/:intervalId`

Edits interval participant, timing, or tank values.

Request fields: `userId`, `name`, `startLiters`, `startedAt`, `endLiters`.

Consistency rules:

- If this interval's explicit `endLiters` and the next interval's explicit `startLiters` are both known and differ, the service derives or updates a Handover Fuel Delta instead of rejecting the edit.
- If `endLiters` is omitted, it may be inferred from the next interval's `startLiters`.
- Explicit mismatches with `absLiters <= 1` may be auto-accepted as small discrepancies; explicit mismatches with `absLiters > 1` remain pending/need attention until corrected or accepted.
- Edits that affect only unsettled derived obligations/bookings may recalculate them in one transaction.
- Edits that would change settled ledger bookings are rejected.

Status codes: `200`, `400`, `404`, `409`.

#### `DELETE /v1/projects/:slug/driver-intervals/:intervalId`

Deletes an interval only if dependent obligations, Handover Fuel Deltas, refills, and ledger bookings are absent or can be recalculated without changing settled bookings. Otherwise the service rejects the request.

Status codes: `204`, `404`, `409`.

### Handover Fuel Deltas

Handover Fuel Deltas represent shared fillable discrepancies between adjacent explicit interval readings. The preferred domain term is Handover Fuel Delta; storage or API slugs may use `handover-fuel-deltas`.

Fields include:

- `id`: stable delta identifier.
- `amountLiters`: `next.startLiters - previous.endLiters`; positive means the next start reading is higher, negative means it is lower.
- `absLiters`: absolute fillable liters used for pricing and participant shares.
- `intervalBeforeId` and `intervalAfterId`: adjacent interval references.
- `status`: `autoAccepted`, `pending`, `accepted`, `filled`, or equivalent lifecycle states.
- `autoAccepted`: true when `absLiters <= 1` and accepted without proactively bothering the user.
- `createdAt`, `updatedAt`, and optional `acceptedAt`/`filledAt` timestamps.

When `absLiters > 1`, clients should surface the discrepancy and ask whether to correct the previous interval's `endLiters`, correct the next interval's `startLiters`, or accept the Handover Fuel Delta. Correcting linked interval readings uses `PATCH /v1/projects/:slug/driver-intervals/:intervalId`.

#### `GET /v1/projects/:slug/handover-fuel-deltas?status&limit&from&to`

Lists Handover Fuel Deltas sorted by occurrence/update time. `status` may filter pending, accepted, filled, auto-accepted, or all deltas.

Response:

```json
{
  "handoverFuelDeltas": [
    {
      "id": "hfd_1",
      "amountLiters": -2.0,
      "absLiters": 2.0,
      "intervalBeforeId": "int_1",
      "intervalAfterId": "int_2",
      "previousUser": { "id": "usr_1", "name": "Ada" },
      "nextUser": { "id": "usr_2", "name": "Bruno" },
      "status": "pending",
      "autoAccepted": false,
      "createdAt": "2026-05-02T12:00:00Z",
      "updatedAt": "2026-05-02T12:00:00Z"
    }
  ]
}
```

#### `POST /v1/projects/:slug/handover-fuel-deltas/:deltaId/accept`

Accepts a Handover Fuel Delta without changing the linked interval readings.

Request fields:

- `reason` (optional string): acceptance rationale.
- `occurredAt` (optional timestamp).

Status codes: `200`, `400`, `404`, `409` for settled-accounting conflicts.

#### `POST /v1/projects/:slug/handover-fuel-deltas/:deltaId/fill`

Fills all or part of an accepted or auto-accepted Handover Fuel Delta from a priced participant-paid source and creates split participant shares.

Request fields:

- `paidByUserId` or `paidByName` (required): participant who funded the fill.
- `pricePerLiter` (required number): positive price.
- `liters` (optional number): positive liters to fill; defaults to remaining `absLiters`.
- `occurredAt` (optional timestamp).
- `reason` (optional string).

Filling creates participant shares of half the filled value for the previous interval user and half for the next interval user. With the current booking model this creates up to two cross-user ledger bookings. If the filler is one adjacent participant, that participant's own share may be self-elided and only the other adjacent participant's cross-user booking is created.

Status codes: `201`, `400`, `404`, `409`.

### Obligations

Obligations represent unpriced liters owed by a participant. They may be interval-derived or manual corrections.

#### `GET /v1/projects/:slug/obligations?status=open&limit&from&to`

Lists obligations sorted by occurrence time ascending. `status` may be `open`, `closed`, or `all`.

Response:

```json
{
  "obligations": [
    {
      "id": "obl_1",
      "user": { "id": "usr_1", "name": "Ada" },
      "intervalId": "int_1",
      "litersTotal": 4.5,
      "litersOpen": 2.0,
      "occurredAt": "2026-05-02T12:00:00Z",
      "source": "interval",
      "reason": null
    }
  ]
}
```

#### `POST /v1/projects/:slug/obligations`

Creates a manual correction obligation. The owing participant is required; omitting it is ambiguous and invalid.

Request fields:

- `userId` or `name` (required): owing participant.
- `liters` (required number): positive owed liters.
- `occurredAt` (optional timestamp).
- `reason` (optional string): correction rationale.

Status codes: `201`, `400`, `404`.

#### `PATCH /v1/projects/:slug/obligations/:obligationId`

Edits a manual obligation. Interval-derived obligations are changed by editing the source interval. Edits that would change settled ledger bookings are rejected.

Request fields: `liters`, `occurredAt`, `reason`.

Status codes: `200`, `400`, `404`, `409`.

#### `DELETE /v1/projects/:slug/obligations/:obligationId`

Deletes a manual obligation only when no settled ledger booking depends on it. Unsettled dependent bookings may be recalculated or removed transactionally.

Status codes: `204`, `404`, `409`.

#### `POST /v1/projects/:slug/obligations/:obligationId/fill`

Manual correction/admin endpoint that fills an obligation from a participant-paid source and creates ledger booking(s). This endpoint is for exceptional corrections; ordinary surplus allocation is derived from interval/refill data.

Request fields:

- `paidByUserId` or `paidByName` (required): creditor/participant who funded the fill.
- `pricePerLiter` (required number): positive price.
- `liters` (optional number): positive liters to fill; defaults to remaining open liters.
- `occurredAt` (optional timestamp).
- `reason` (optional string).

Status codes: `201`, `400`, `404`, `409`.

### Refills

Refills are paid fuel lots recorded inside a driver interval. The default payer is the interval participant unless `paidByUserId` or `paidByName` is supplied.

#### `POST /v1/projects/:slug/driver-intervals/:intervalId/refills`

Adds a refill lot.

Request fields:

- `liters` (required number): positive refill liters.
- `pricePerLiter` and/or `totalCost`: provide `pricePerLiter` plus `liters`, or `totalCost` plus `liters`; if all three are provided they must be arithmetically consistent within configured rounding tolerance.
- `paidByUserId` or `paidByName` (optional): payer; defaults to interval participant.
- `occurredAt` (optional timestamp): must fall within the interval if the interval end is known.

Response: `{ "refill": { "id", "intervalId", "paidByUser", "liters", "pricePerLiter", "totalCost", "occurredAt" } }`.

Status codes: `201`, `400`, `404`, `409`.

#### `GET /v1/projects/:slug/refills?intervalId&limit&from&to`

Lists refill lots sorted by occurrence time ascending. Clients use this endpoint, or interval detail responses that embed the same refill shape, to discover `refillId` values for later edit/delete operations.

Response:

```json
{
  "refills": [
    {
      "id": "ref_1",
      "intervalId": "int_1",
      "paidByUser": { "id": "usr_1", "name": "Ada" },
      "liters": 8.0,
      "pricePerLiter": 1.95,
      "totalCost": 15.6,
      "occurredAt": "2026-05-02T11:00:00Z"
    }
  ]
}
```

Status codes: `200`, `400`, `404`.

#### `PATCH /v1/projects/:slug/refills/:refillId`

Edits an unsettled refill lot. Edits that would change settled ledger bookings are rejected; edits affecting unsettled surplus allocations recalculate in one transaction.

Request fields: `liters`, `pricePerLiter`, `totalCost`, `paidByUserId`, `paidByName`, `occurredAt`.

Response: `{ "refill": { "id", "intervalId", "paidByUser", "liters", "pricePerLiter", "totalCost", "occurredAt" } }`.

Status codes: `200`, `400`, `404`, `409`.

#### `DELETE /v1/projects/:slug/refills/:refillId`

Deletes a refill only if no settled ledger booking depends on it. If it is needed to price interval surplus, deletion is rejected unless recalculation leaves the interval valid.

Status codes: `204`, `404`, `409`.

### Ledger Bookings and Settlements

Ledger bookings record monetary value transferred from debtor to creditor when obligations or Handover Fuel Deltas are filled by surplus/refill liters or priced fill sources. Settlements group and mark ledger bookings settled.

#### `GET /v1/projects/:slug/ledger-bookings?status=unsettled&from&to`

Lists ledger bookings sorted by occurrence time ascending. `status` may be `unsettled`, `settled`, or `all`.

Response:

```json
{
  "ledgerBookings": [
    {
      "id": "led_1",
      "debitUser": { "id": "usr_1", "name": "Ada" },
      "creditUser": { "id": "usr_2", "name": "Bruno" },
      "obligationId": "obl_1",
      "refillId": "ref_1",
      "liters": 2.0,
      "pricePerLiter": 1.9,
      "amount": 3.8,
      "status": "unsettled",
      "settlementId": null,
      "occurredAt": "2026-05-02T12:30:00Z"
    }
  ]
}
```

#### `POST /v1/projects/:slug/settlements`

Creates a settlement and marks included unsettled bookings settled.

Request fields:

- `participantIds` (optional array): when present, include only unsettled bookings where both debit and credit users are in the set. When omitted, include all unsettled bookings.
- `occurredAt` (optional timestamp).
- `note` (optional string).

Response: settlement with included booking IDs and net participant amounts.

Status codes: `201`, `400`, `404`, `409` if no eligible unsettled bookings exist.

#### `GET /v1/projects/:slug/settlements`

Lists settlements newest first, including metadata and aggregate participant nets.

Status codes: `200`, `400`, `404`.

## Data Ownership

Carshare Service owns the `carshare` Postgres schema. The following tables define the architecture-level target model; exact DDL, key type, precision, and indexes are implementation details as long as the contract semantics are preserved.

### `carshare.projects`

- `slug` primary key
- `name`
- `currency`
- `created_at`, `updated_at`

### `carshare.users` / `carshare.participants`

- project-scoped participant identity and display name
- active/deleted state as needed for history-preserving removal
- uniqueness constraint for canonical name within a project

### `carshare.driver_intervals`

- project, participant, `started_at`
- `start_liters`
- optional explicit `end_liters`
- inferred end from next interval start when explicit end is absent
- constraints/indexes supporting chronological lookup and adjacent handover delta derivation

### `carshare.handover_fuel_deltas`

- project, `amount_liters`, `abs_liters`
- `interval_before_id`, `interval_after_id`
- status, `auto_accepted`
- timestamps including created/updated and optional accepted/filled markers

### `carshare.obligations`

- project, owing participant
- optional source interval
- `liters_total`, `liters_open`
- `occurred_at`
- source (`interval`, `manual`) and optional reason

### `carshare.refills`

- project, driver interval, payer participant
- `liters`, `price_per_liter`, `total_cost`
- `occurred_at`

### `carshare.ledger_bookings`

- project, debit participant, credit participant
- obligation reference or handover fuel delta reference, depending on fill source
- refill reference when backed by a refill lot; nullable for manual fill corrections if needed
- `liters`, `price_per_liter`, `amount`
- optional settlement reference
- status implied by settlement reference or explicit status

### `carshare.settlements`

- project, settlement metadata, timestamp, note
- grouping for settled ledger bookings

## Implementation Expectations

- Carshare Service owns all recalculation and persistence for these tables.
- Carshare domain persistence may be implemented as a fresh baseline schema when the project can reset the Carshare database; carshare migration scripts are not required for this feature set unless a future production data-retention decision requires them.
- Allocation and recalculation are deterministic and covered by tests: handover fuel delta derivation; symmetric positive/negative delta handling; own-obligation-first then other-obligation; cheapest refill liters first for own prior obligations; remaining refill liters most-expensive-first for cross-participant fills; oldest-first obligations within each scope.
- Edits/deletes that touch derived obligations, Handover Fuel Deltas, refills, or bookings run in database transactions.
- Agent Runtime uses only the HTTP API and treats this contract as the boundary source.
