# Carshare Agent Skill Contract

Status: Proposed; DeepAgents migration ready with caveats

## Goal

The Carshare Persistence Agent persists and queries carshare facts through the Carshare Service HTTP API without inventing missing data. It is a single goal-directed LLM/tool agent executed by DeepAgents inside the Agent Runtime App, using this contract as DeepAgents-compatible skill instructions/resources.

## Loop Semantics

- Identify the user's carshare intent and select exactly one operation, or ask a clarification when intent is ambiguous.
- Compare gathered data to the selected operation's required body and validation constraints.
- Ask one focused question for missing or ambiguous required fields.
- Do not call write tools with missing required fields.
- Use configured tool permissions and idempotency keys for writes.
- Use only runtime-wrapped tools registered for DeepAgents; do not call Carshare Service or Postgres directly outside the Tool Client Layer.
- Observe tool results; on success, run the operation's configured read-back and answer with concise confirmation plus read-back.
- On failure, surface the service error and ask for corrected data when useful.

## Shared Conventions

- `projectSlug` is required for every project-scoped operation.
- Participants may be identified by `userId` or by an existing unambiguous `name` only where the Carshare Service contract allows it.
- Numeric liter and money fields must satisfy the Carshare Service validation rules.
- Timestamps are ISO 8601 strings when supplied; omitted optional timestamps default according to the service contract.
- The Carshare Service HTTP contract is the boundary authority for endpoint behavior, status codes, validation, recalculation, and settled-accounting conflicts.
- The operation catalog below is the source of truth for replacement-obligation Carshare tools; do not call or model legacy `/handover`, `/refill`, `/events`, or `/summary` event/summary tools.
- Handover Fuel Deltas with `absLiters <= 1` may be auto-accepted by the service/agent and should not be proactively raised to the user. For `absLiters > 1`, mention the discrepancy and ask whether to correct the previous interval's end liters, correct the next interval's start liters, or accept the Handover Fuel Delta.

## Operation Catalog

### Ensure Project

- Toolcall: `carshare.ensure_project`
- Required body: `projectSlug`
- Optional body: `name`, `currency`
- Clarifications: missing project slug; ambiguous project name vs slug.
- Success read-back: show ensured project summary.

### List Users

- Toolcall: `carshare.list_users`
- Required body: `projectSlug`
- Optional body: none
- Clarifications: missing project slug.
- Success read-back: not applicable; return listed participants.

### Add User

- Toolcall: `carshare.add_user`
- Required body: `projectSlug`, `name`
- Optional body: none
- Clarifications: missing participant name; duplicate/ambiguous existing participant after service response.
- Success read-back: list project users.

### Edit User

- Toolcall: `carshare.edit_user`
- Required body: `projectSlug`, `userId`, at least one editable field
- Optional body: `name`, `active`
- Clarifications: missing participant identity; missing edit field; ambiguous name that must be resolved to `userId` by listing users first.
- Success read-back: list project users.

### Delete User

- Toolcall: `carshare.delete_user`
- Required body: `projectSlug`, `userId`
- Optional body: none
- Clarifications: missing participant identity; ambiguous name that must be resolved to `userId` by listing users first.
- Success read-back: list project users.

### Create Driver Interval

- Toolcall: `carshare.create_driver_interval`
- Required body: `projectSlug`, `userId` or existing unambiguous `name`, `startLiters`
- Optional body: `startedAt`, `endLiters`
- Clarifications: missing participant, missing start liters, unknown participant, ambiguous name, or settled-accounting conflict.
- Success read-back: list last 3 driver intervals and any pending Handover Fuel Deltas created or changed by the write.

### Edit Driver Interval

- Toolcall: `carshare.edit_driver_interval`
- Required body: `projectSlug`, `intervalId`, at least one editable field
- Optional body: `userId`, `name`, `startLiters`, `startedAt`, `endLiters`
- Clarifications: missing interval identity; missing edit field; unknown participant; settled-accounting conflict; pending Handover Fuel Delta above 1 liter that requires correction or acceptance.
- Success read-back: list last 3 driver intervals and any pending Handover Fuel Deltas created or changed by the write.

### Delete Driver Interval

- Toolcall: `carshare.delete_driver_interval`
- Required body: `projectSlug`, `intervalId`
- Optional body: none
- Clarifications: missing interval identity; settled-accounting or dependent-record conflict.
- Success read-back: list last 3 driver intervals.

### List Driver Intervals

- Toolcall: `carshare.list_driver_intervals`
- Required body: `projectSlug`
- Optional body: `limit`, `from`, `to`
- Clarifications: missing project slug; ambiguous date range.
- Success read-back: not applicable; return matching driver intervals.

### List Obligations

- Toolcall: `carshare.list_obligations`
- Required body: `projectSlug`
- Optional body: `status`, `limit`, `from`, `to`
- Clarifications: missing project slug; ambiguous date range or status.
- Success read-back: not applicable; return matching obligations.

### List Handover Fuel Deltas

- Toolcall: `carshare.list_handover_fuel_deltas`
- Required body: `projectSlug`
- Optional body: `status`, `limit`, `from`, `to`
- Clarifications: missing project slug; ambiguous date range or status.
- Success read-back: not applicable; return matching deltas and flag pending deltas with `absLiters > 1` for user choice.

### Accept Handover Fuel Delta

- Toolcall: `carshare.accept_handover_fuel_delta`
- Required body: `projectSlug`, `deltaId`
- Optional body: `reason`, `occurredAt`
- Clarifications: missing delta identity; if the user appears to prefer correcting readings, use `carshare.edit_driver_interval` instead of accepting.
- Success read-back: list the accepted delta and pending Handover Fuel Deltas.

### Fill Handover Fuel Delta

- Toolcall: `carshare.fill_handover_fuel_delta`
- Required body: `projectSlug`, `deltaId`, `paidByUserId` or existing unambiguous `paidByName`, `pricePerLiter`
- Optional body: `liters`, `occurredAt`, `reason`
- Clarifications: missing delta identity, payer, or price; ambiguous payer; invalid liters; pending delta that should be accepted or corrected before fill.
- Success read-back: list the delta and unsettled ledger bookings created by the split participant shares.

### Add Manual Obligation

- Toolcall: `carshare.add_obligation`
- Required body: `projectSlug`, `userId` or existing unambiguous `name`, `liters`
- Optional body: `occurredAt`, `reason`
- Clarifications: missing owing participant, missing liters, unknown or ambiguous participant.
- Success read-back: list open obligations.

### Edit Manual Obligation

- Toolcall: `carshare.edit_obligation`
- Required body: `projectSlug`, `obligationId`, at least one editable field
- Optional body: `liters`, `occurredAt`, `reason`
- Clarifications: missing obligation identity; missing edit field; attempt to edit interval-derived obligation; settled-accounting conflict.
- Success read-back: list open obligations.

### Remove Manual Obligation

- Toolcall: `carshare.remove_obligation`
- Required body: `projectSlug`, `obligationId`
- Optional body: none
- Clarifications: missing obligation identity; settled-accounting conflict.
- Success read-back: list open obligations.

### Fill Obligation

- Toolcall: `carshare.fill_obligation`
- Required body: `projectSlug`, `obligationId`, `paidByUserId` or existing unambiguous `paidByName`, `pricePerLiter`
- Optional body: `liters`, `occurredAt`, `reason`
- Clarifications: missing obligation identity, payer, or price; ambiguous payer; invalid liters.
- Success read-back: list open obligations and unsettled ledger bookings.

### Add Refill

- Toolcall: `carshare.add_refill`
- Required body: `projectSlug`, `intervalId`, `liters`, `pricePerLiter` or `totalCost`
- Optional body: `paidByUserId`, `paidByName`, `occurredAt`
- Clarifications: missing interval, liters, or price/cost; ambiguous payer; timestamp outside known interval.
- Success read-back: list last 3 refills and related open obligations or ledger bookings if created.

### Edit Refill

- Toolcall: `carshare.edit_refill`
- Required body: `projectSlug`, `refillId`, at least one editable field
- Optional body: `liters`, `pricePerLiter`, `totalCost`, `paidByUserId`, `paidByName`, `occurredAt`
- Clarifications: missing refill identity; missing edit field; price/cost inconsistency; settled-accounting conflict.
- Success read-back: list last 3 refills and unsettled ledger bookings.

### Delete Refill

- Toolcall: `carshare.delete_refill`
- Required body: `projectSlug`, `refillId`
- Optional body: none
- Clarifications: missing refill identity; settled-accounting or surplus-pricing conflict.
- Success read-back: list last 3 refills and unsettled ledger bookings.

### List Refills

- Toolcall: `carshare.list_refills`
- Required body: `projectSlug`
- Optional body: `intervalId`, `limit`, `from`, `to`
- Clarifications: missing project slug; ambiguous date range.
- Success read-back: not applicable; return matching refills.

### List Ledger Bookings

- Toolcall: `carshare.list_ledger_bookings`
- Required body: `projectSlug`
- Optional body: `status`, `from`, `to`
- Clarifications: missing project slug; ambiguous status or date range.
- Success read-back: not applicable; return matching ledger bookings.

### Create Settlement

- Toolcall: `carshare.create_settlement`
- Required body: `projectSlug`
- Optional body: `participantIds`, `occurredAt`, `note`
- Clarifications: missing project slug; ambiguous participants; no eligible unsettled bookings after service response.
- Success read-back: list recent settlements and unsettled ledger bookings.

### List Settlements

- Toolcall: `carshare.list_settlements`
- Required body: `projectSlug`
- Optional body: none
- Clarifications: missing project slug.
- Success read-back: not applicable; return recent settlements.

## Related

- Boundary API: `architecture/contracts/carshare-service-http.md`
- Structurizr: `carsharePersistenceAgent`, `carshareApiSkill`, `dynamic-carshare-flow`
- Rules: BR-007, AR-007, AR-008
- ADR: ADR-0005, ADR-0006, ADR-0007

## Implementation Handoff

Readiness: Ready with caveats.

Runtime implementation must replace the deterministic/custom starter harness path for `type: agent` nodes with a DeepAgents-based runner, update carshare graph/tool/prompt configuration to route persistence and query tasks to one Carshare Persistence Agent, load the operation catalog above as DeepAgents-compatible skill instructions/resources, and keep using the Tool Client Layer rather than direct database access. Tests should mock DeepAgents, model calls, and wrapped tools so existing deterministic coverage remains stable. Caveats: the Carshare Service replacement API is Proposed, package/runtime compatibility must be verified during implementation, and the current carshare runtime path is not yet a true DeepAgents iterative agent loop.
