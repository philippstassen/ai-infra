import express from "express";
import { pool, query, withTransaction } from "./db.js";

export const app = express();
app.use(express.json());

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function badRequest(message) { return httpError(400, message); }
function conflict(message) { return httpError(409, message); }

function canonicalName(value) { return requireText(value, "name").toLowerCase().replace(/\s+/g, " "); }
function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw badRequest(`${field} is required`);
  return value.trim();
}
function parseTimestamp(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw badRequest(`Invalid timestamp: ${value}`);
  return date.toISOString();
}
function positive(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw badRequest(`${field} must be a positive number`);
  return number;
}
function nonNegative(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw badRequest(`${field} must be a non-negative number`);
  return number;
}
function optionalNonNegative(value, field) { return value == null || value === "" ? null : nonNegative(value, field); }
function limitFrom(queryValue, fallback = 20, max = 500) {
  const limit = queryValue ? parseInt(String(queryValue), 10) : fallback;
  if (!Number.isFinite(limit) || limit <= 0 || limit > max) throw badRequest(`limit must be between 1 and ${max}`);
  return limit;
}

async function ensureProjectRecord(client, payload) {
  const slug = requireText(payload.slug, "slug").toLowerCase();
  const name = typeof payload.name === "string" && payload.name.trim() !== "" ? payload.name.trim() : slug;
  const currency = typeof payload.currency === "string" && payload.currency.trim() !== "" ? payload.currency.trim().toUpperCase() : "EUR";
  const baselinePricePerLiter = payload.baselinePricePerLiter == null || payload.baselinePricePerLiter === "" ? process.env.CARSHARE_BASELINE_PRICE_PER_LITER ?? null : Number(payload.baselinePricePerLiter);
  if (baselinePricePerLiter != null && (!Number.isFinite(Number(baselinePricePerLiter)) || Number(baselinePricePerLiter) < 0)) throw badRequest("baselinePricePerLiter must be a non-negative number");
  const result = await client.query(
    `INSERT INTO carshare.projects (slug, name, currency, baseline_price_per_liter)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE
       SET name = COALESCE(NULLIF(EXCLUDED.name, ''), carshare.projects.name),
           currency = COALESCE(NULLIF(EXCLUDED.currency, ''), carshare.projects.currency),
           baseline_price_per_liter = COALESCE(EXCLUDED.baseline_price_per_liter, carshare.projects.baseline_price_per_liter),
           updated_at = now()
     RETURNING *`,
    [slug, name, currency, baselinePricePerLiter]
  );
  return result.rows[0];
}

async function getProject(client, slug) {
  const result = await client.query(`SELECT * FROM carshare.projects WHERE slug = $1`, [slug]);
  if (result.rowCount === 0) throw badRequest(`Unknown project: ${slug}`);
  return result.rows[0];
}

async function resolveUser(client, slug, { userId, name, field = "user" }) {
  if (userId != null) {
    const result = await client.query(`SELECT * FROM carshare.users WHERE project_slug = $1 AND id = $2 AND active = true`, [slug, userId]);
    if (result.rowCount !== 1) throw badRequest(`Unknown ${field}: ${userId}`);
    return result.rows[0];
  }
  const cname = canonicalName(name);
  const result = await client.query(`SELECT * FROM carshare.users WHERE project_slug = $1 AND canonical_name = $2 AND active = true`, [slug, cname]);
  if (result.rowCount !== 1) throw badRequest(`Unknown ${field}: ${name}`);
  return result.rows[0];
}

async function assertNoSettledBookings(client, slug, message = "settled ledger bookings prevent this change") {
  const result = await client.query(`SELECT 1 FROM carshare.ledger_bookings WHERE project_slug = $1 AND settlement_id IS NOT NULL LIMIT 1`, [slug]);
  if (result.rowCount) throw conflict(message);
}

async function recalculateLedger(client, slug) {
  await client.query(`DELETE FROM carshare.ledger_bookings WHERE project_slug = $1 AND settlement_id IS NULL`, [slug]);
  await client.query(`DELETE FROM carshare.obligations WHERE project_slug = $1 AND source = 'interval'`, [slug]);
  await deriveHandoverFuelDeltas(client, slug);
  await client.query(
    `UPDATE carshare.obligations o
        SET liters_open = GREATEST(o.liters_total - COALESCE(f.filled, 0), 0), updated_at = now()
       FROM (SELECT obligation_id, SUM(liters) AS filled FROM carshare.ledger_bookings WHERE project_slug = $1 AND settlement_id IS NOT NULL GROUP BY obligation_id) f
      WHERE o.id = f.obligation_id AND o.project_slug = $1 AND o.source = 'manual'`, [slug]
  );
  await client.query(`UPDATE carshare.obligations SET liters_open = liters_total, updated_at = now() WHERE project_slug = $1 AND source = 'manual' AND id NOT IN (SELECT obligation_id FROM carshare.ledger_bookings WHERE project_slug = $1 AND settlement_id IS NOT NULL AND obligation_id IS NOT NULL)`, [slug]);

  const intervals = (await client.query(
    `SELECT i.*, lead(i.start_liters) OVER (ORDER BY i.started_at, i.id) AS inferred_end_liters
       FROM carshare.driver_intervals i WHERE project_slug = $1 ORDER BY i.started_at, i.id`, [slug]
  )).rows;
  for (const interval of intervals) {
    const endLiters = interval.end_liters ?? interval.inferred_end_liters;
    if (endLiters == null) continue;
    const delta = Number(endLiters) - Number(interval.start_liters);
    if (delta < -0.0005) {
      await client.query(
        `INSERT INTO carshare.obligations (project_slug, user_id, interval_id, liters_total, liters_open, occurred_at, source)
         VALUES ($1, $2, $3, $4, $4, $5, 'interval')`,
        [slug, interval.user_id, interval.id, Math.abs(delta), interval.started_at]
      );
      continue;
    }
    if (delta > 0.0005) await applySurplus(client, slug, interval, delta);
  }
}

async function deriveHandoverFuelDeltas(client, slug) {
  const rows = (await client.query(
    `SELECT id AS interval_before_id,
            lead(id) OVER (ORDER BY started_at, id) AS interval_after_id,
            end_liters,
            lead(start_liters) OVER (ORDER BY started_at, id) AS next_start_liters
       FROM carshare.driver_intervals
      WHERE project_slug = $1
      ORDER BY started_at, id`, [slug]
  )).rows;
  const activePairs = [];
  for (const row of rows) {
    if (row.interval_after_id == null || row.end_liters == null || row.next_start_liters == null) continue;
    const amount = Number(row.next_start_liters) - Number(row.end_liters);
    const abs = Math.abs(amount);
    if (abs <= 0.0005) continue;
    activePairs.push([String(row.interval_before_id), String(row.interval_after_id)]);
    const existing = (await client.query(
      `SELECT * FROM carshare.handover_fuel_deltas
        WHERE project_slug=$1 AND interval_before_id=$2 AND interval_after_id=$3`,
      [slug, row.interval_before_id, row.interval_after_id]
    )).rows[0];
    const preserveLifecycle = existing && (existing.status === "accepted" || existing.status === "filled");
    const status = preserveLifecycle ? existing.status : (abs <= 1 ? "accepted" : "pending");
    const autoAccepted = preserveLifecycle ? existing.auto_accepted : abs <= 1;
    const acceptedAt = preserveLifecycle ? existing.accepted_at : (abs <= 1 ? new Date().toISOString() : null);
    const filledAt = preserveLifecycle ? existing.filled_at : null;
    const filledLiters = preserveLifecycle ? Math.min(Number(existing.filled_liters ?? 0), abs) : 0;
    const reason = preserveLifecycle ? existing.reason : null;
    await client.query(
      `INSERT INTO carshare.handover_fuel_deltas
         (project_slug, interval_before_id, interval_after_id, amount_liters, abs_liters, filled_liters, status, auto_accepted, accepted_at, filled_at, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (project_slug, interval_before_id, interval_after_id) DO UPDATE
         SET amount_liters=EXCLUDED.amount_liters,
             abs_liters=EXCLUDED.abs_liters,
             filled_liters=EXCLUDED.filled_liters,
             status=EXCLUDED.status,
             auto_accepted=EXCLUDED.auto_accepted,
             accepted_at=EXCLUDED.accepted_at,
             filled_at=EXCLUDED.filled_at,
             reason=EXCLUDED.reason,
             updated_at=now()`,
      [slug, row.interval_before_id, row.interval_after_id, amount, abs, filledLiters, status, autoAccepted, acceptedAt, filledAt, reason]
    );
  }
  if (activePairs.length) {
    await client.query(
      `DELETE FROM carshare.handover_fuel_deltas d
        WHERE d.project_slug=$1
          AND NOT EXISTS (SELECT 1 FROM carshare.ledger_bookings b WHERE b.handover_fuel_delta_id=d.id AND b.settlement_id IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM unnest($2::bigint[], $3::bigint[]) AS p(before_id, after_id)
             WHERE p.before_id=d.interval_before_id AND p.after_id=d.interval_after_id
          )`,
      [slug, activePairs.map((pair) => pair[0]), activePairs.map((pair) => pair[1])]
    );
  } else {
    await client.query(
      `DELETE FROM carshare.handover_fuel_deltas d
        WHERE d.project_slug=$1
          AND NOT EXISTS (SELECT 1 FROM carshare.ledger_bookings b WHERE b.handover_fuel_delta_id=d.id AND b.settlement_id IS NOT NULL)`,
      [slug]
    );
  }
}

async function applySurplus(client, slug, interval, surplusLiters) {
  const lots = (await client.query(
    `SELECT * FROM carshare.refills WHERE project_slug = $1 AND interval_id = $2 ORDER BY price_per_liter ASC, id ASC`, [slug, interval.id]
  )).rows.map((row) => ({ ...row, remaining: Number(row.liters) }));
  const total = lots.reduce((sum, lot) => sum + lot.remaining, 0);
  if (total + 0.0005 < surplusLiters) throw conflict("surplus interval requires enough refill liters to price the surplus");
  let remainingSurplus = await applyLotsToObligations(client, slug, interval, lots, Number(surplusLiters), true);
  if (remainingSurplus > 0.0005) await applyLotsToObligations(client, slug, interval, [...lots].sort((a, b) => Number(b.price_per_liter) - Number(a.price_per_liter) || Number(a.id) - Number(b.id)), remainingSurplus, false);
}

async function applyLotsToObligations(client, slug, interval, lots, remainingSurplus, ownOnly) {
  while (remainingSurplus > 0.0005) {
    const obligation = await nextOpenObligation(client, slug, interval.user_id, interval.started_at, ownOnly);
    if (!obligation) return remainingSurplus;
    for (const lot of lots) {
      if (lot.remaining <= 0.0005 || remainingSurplus <= 0.0005 || Number(obligation.liters_open) <= 0.0005) continue;
      const liters = Math.min(lot.remaining, remainingSurplus, Number(obligation.liters_open));
      lot.remaining -= liters;
      remainingSurplus -= liters;
      obligation.liters_open = Number(obligation.liters_open) - liters;
      await client.query(`UPDATE carshare.obligations SET liters_open = $1, updated_at = now() WHERE id = $2`, [Math.max(obligation.liters_open, 0), obligation.id]);
      if (Number(obligation.user_id) !== Number(lot.paid_by_user_id)) {
        await client.query(
          `INSERT INTO carshare.ledger_bookings (project_slug, debit_user_id, credit_user_id, obligation_id, refill_id, liters, price_per_liter, amount, occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
          [slug, obligation.user_id, lot.paid_by_user_id, obligation.id, lot.id, liters, lot.price_per_liter, Math.round(liters * Number(lot.price_per_liter) * 100) / 100]
        );
      }
    }
  }
  return remainingSurplus;
}

async function nextOpenObligation(client, slug, ownUserId, beforeTime, ownOnly) {
  const comparator = ownOnly ? "=" : "<>";
  const result = await client.query(`SELECT * FROM carshare.obligations WHERE project_slug = $1 AND user_id ${comparator} $2 AND occurred_at < $3 AND liters_open > 0 ORDER BY occurred_at, id LIMIT 1`, [slug, ownUserId, beforeTime]);
  return result.rows[0] ?? null;
}

function rowUser(row) { return { id: String(row.id), name: row.name, active: row.active, createdAt: row.created_at }; }
function intervalRow(row) { return { id: String(row.id), user: { id: String(row.user_id), name: row.user_name }, startedAt: row.started_at, startLiters: Number(row.start_liters), endLiters: row.end_liters == null ? null : Number(row.end_liters), endLitersInferred: row.end_liters == null && row.inferred_end_liters != null, handoverLiters: row.end_liters == null ? (row.inferred_end_liters == null ? null : Number(row.inferred_end_liters)) : Number(row.end_liters), deltaLiters: row.effective_end_liters == null ? null : Number(row.effective_end_liters) - Number(row.start_liters), handoverFuelDeltaIds: row.handover_fuel_delta_ids ?? [] }; }
function obligationRow(row) { return { id: String(row.id), user: { id: String(row.user_id), name: row.user_name }, intervalId: row.interval_id == null ? null : String(row.interval_id), litersTotal: Number(row.liters_total), litersOpen: Number(row.liters_open), occurredAt: row.occurred_at, source: row.source, reason: row.reason }; }
function refillRow(row) { return { id: String(row.id), intervalId: String(row.interval_id), paidByUser: { id: String(row.paid_by_user_id), name: row.paid_by_name }, liters: Number(row.liters), pricePerLiter: Number(row.price_per_liter), totalCost: Number(row.total_cost), occurredAt: row.occurred_at }; }
function bookingRow(row) { return { id: String(row.id), debitUser: { id: String(row.debit_user_id), name: row.debit_name }, creditUser: { id: String(row.credit_user_id), name: row.credit_name }, obligationId: row.obligation_id == null ? null : String(row.obligation_id), handoverFuelDeltaId: row.handover_fuel_delta_id == null ? null : String(row.handover_fuel_delta_id), refillId: row.refill_id == null ? null : String(row.refill_id), liters: Number(row.liters), pricePerLiter: Number(row.price_per_liter), amount: Number(row.amount), status: row.settlement_id == null ? "unsettled" : "settled", settlementId: row.settlement_id == null ? null : String(row.settlement_id), occurredAt: row.occurred_at }; }
function handoverFuelDeltaRow(row) { return { id: String(row.id), amountLiters: Number(row.amount_liters), absLiters: Number(row.abs_liters), filledLiters: Number(row.filled_liters ?? 0), intervalBeforeId: String(row.interval_before_id), intervalAfterId: String(row.interval_after_id), previousUser: { id: String(row.previous_user_id), name: row.previous_user_name }, nextUser: { id: String(row.next_user_id), name: row.next_user_name }, status: row.auto_accepted && row.status === "accepted" ? "autoAccepted" : row.status, autoAccepted: row.auto_accepted, acceptedAt: row.accepted_at, filledAt: row.filled_at, reason: row.reason, createdAt: row.created_at, updatedAt: row.updated_at }; }

app.get("/health", async (_req, res, next) => { try { await query("SELECT 1"); res.json({ ok: true }); } catch (error) { next(error); } });
app.post("/v1/projects/ensure", async (req, res, next) => { try { res.json({ project: await withTransaction((client) => ensureProjectRecord(client, req.body)) }); } catch (error) { next(error); } });

app.get("/v1/projects/:slug/users", async (req, res, next) => { try { const slug = req.params.slug.toLowerCase(); const rows = (await query(`SELECT * FROM carshare.users WHERE project_slug = $1 ORDER BY name`, [slug])).rows; res.json({ users: rows.map(rowUser) }); } catch (error) { next(error); } });
app.post("/v1/projects/:slug/users", async (req, res, next) => { try { const user = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); await getProject(client, slug); const name = requireText(req.body.name, "name"); const result = await client.query(`INSERT INTO carshare.users (project_slug, name, canonical_name) VALUES ($1,$2,$3) RETURNING *`, [slug, name, canonicalName(name)]); return result.rows[0]; }); res.status(201).json({ user: rowUser(user) }); } catch (error) { if (error.code === "23505") error = conflict("duplicate participant name"); next(error); } });
app.patch("/v1/projects/:slug/users/:userId", async (req, res, next) => { try { const user = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); const fields = []; const values = []; if (req.body.name !== undefined) { values.push(requireText(req.body.name, "name")); fields.push(`name = $${values.length}`); values.push(canonicalName(req.body.name)); fields.push(`canonical_name = $${values.length}`); } if (req.body.active !== undefined) { values.push(Boolean(req.body.active)); fields.push(`active = $${values.length}`); } if (!fields.length) throw badRequest("at least one editable field is required"); values.push(slug, req.params.userId); const result = await client.query(`UPDATE carshare.users SET ${fields.join(", ")}, updated_at = now() WHERE project_slug = $${values.length - 1} AND id = $${values.length} RETURNING *`, values); if (!result.rowCount) throw badRequest("Unknown user"); return result.rows[0]; }); res.json({ user: rowUser(user) }); } catch (error) { if (error.code === "23505") error = conflict("duplicate participant name"); next(error); } });
app.delete("/v1/projects/:slug/users/:userId", async (req, res, next) => { try { await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); const userId = req.params.userId; const open = await client.query(`SELECT 1 FROM carshare.obligations WHERE project_slug=$1 AND user_id=$2 AND liters_open > 0 LIMIT 1`, [slug, userId]); const unsettled = await client.query(`SELECT 1 FROM carshare.ledger_bookings WHERE project_slug=$1 AND settlement_id IS NULL AND (debit_user_id=$2 OR credit_user_id=$2) LIMIT 1`, [slug, userId]); if (open.rowCount || unsettled.rowCount) throw conflict("participant has open obligations or unsettled bookings"); const result = await client.query(`UPDATE carshare.users SET active=false, updated_at=now() WHERE project_slug=$1 AND id=$2`, [slug, userId]); if (!result.rowCount) throw badRequest("Unknown user"); }); res.status(204).end(); } catch (error) { next(error); } });

app.get("/v1/projects/:slug/driver-intervals", async (req, res, next) => { try { const slug = req.params.slug.toLowerCase(); const limit = limitFrom(req.query.limit, 20); const rows = (await query(`SELECT i.*, u.name AS user_name, lead(i.start_liters) OVER (ORDER BY i.started_at, i.id) AS inferred_end_liters, COALESCE(i.end_liters, lead(i.start_liters) OVER (ORDER BY i.started_at, i.id)) AS effective_end_liters FROM carshare.driver_intervals i JOIN carshare.users u ON u.id=i.user_id WHERE i.project_slug=$1 ORDER BY i.started_at, i.id LIMIT $2`, [slug, limit])).rows; res.json({ driverIntervals: rows.map(intervalRow) }); } catch (error) { next(error); } });
app.post("/v1/projects/:slug/driver-intervals", async (req, res, next) => { try { const interval = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); await getProject(client, slug); await assertNoSettledBookings(client, slug); const user = await resolveUser(client, slug, { userId: req.body.userId, name: req.body.name }); const result = await client.query(`INSERT INTO carshare.driver_intervals (project_slug,user_id,started_at,start_liters,end_liters) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [slug, user.id, parseTimestamp(req.body.startedAt), nonNegative(req.body.startLiters, "startLiters"), optionalNonNegative(req.body.endLiters, "endLiters")]); await recalculateLedger(client, slug); return { ...result.rows[0], user_name: user.name }; }); res.status(201).json({ driverInterval: intervalRow(interval) }); } catch (error) { next(error); } });
app.patch("/v1/projects/:slug/driver-intervals/:intervalId", async (req, res, next) => { try { const interval = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); await assertNoSettledBookings(client, slug); const fields = []; const values = []; if (req.body.userId !== undefined || req.body.name !== undefined) { const user = await resolveUser(client, slug, { userId: req.body.userId, name: req.body.name }); values.push(user.id); fields.push(`user_id = $${values.length}`); } if (req.body.startedAt !== undefined) { values.push(parseTimestamp(req.body.startedAt)); fields.push(`started_at = $${values.length}`); } if (req.body.startLiters !== undefined) { values.push(nonNegative(req.body.startLiters, "startLiters")); fields.push(`start_liters = $${values.length}`); } if (req.body.endLiters !== undefined) { values.push(optionalNonNegative(req.body.endLiters, "endLiters")); fields.push(`end_liters = $${values.length}`); } if (!fields.length) throw badRequest("at least one editable field is required"); values.push(slug, req.params.intervalId); const result = await client.query(`UPDATE carshare.driver_intervals SET ${fields.join(", ")}, updated_at=now() WHERE project_slug=$${values.length - 1} AND id=$${values.length} RETURNING *`, values); if (!result.rowCount) throw badRequest("Unknown interval"); await recalculateLedger(client, slug); return (await client.query(`SELECT i.*, u.name AS user_name, i.end_liters AS inferred_end_liters, i.end_liters AS effective_end_liters FROM carshare.driver_intervals i JOIN carshare.users u ON u.id=i.user_id WHERE i.id=$1`, [req.params.intervalId])).rows[0]; }); res.json({ driverInterval: intervalRow(interval) }); } catch (error) { next(error); } });
app.delete("/v1/projects/:slug/driver-intervals/:intervalId", async (req, res, next) => { try { await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); await assertNoSettledBookings(client, slug); await client.query(`DELETE FROM carshare.driver_intervals WHERE project_slug=$1 AND id=$2`, [slug, req.params.intervalId]); await recalculateLedger(client, slug); }); res.status(204).end(); } catch (error) { next(error); } });

app.get("/v1/projects/:slug/handover-fuel-deltas", async (req, res, next) => { try { const slug = req.params.slug.toLowerCase(); const params = [slug]; let where = "d.project_slug=$1"; const status = req.query.status; if (status && status !== "all") { if (status === "auto-accepted" || status === "autoAccepted") where += " AND d.auto_accepted=true AND d.status='accepted'"; else { params.push(status); where += ` AND d.status=$${params.length}`; } } if (req.query.from) { params.push(parseTimestamp(req.query.from)); where += ` AND d.updated_at >= $${params.length}`; } if (req.query.to) { params.push(parseTimestamp(req.query.to)); where += ` AND d.updated_at <= $${params.length}`; } params.push(limitFrom(req.query.limit, 50)); const rows = (await query(`SELECT d.*, before_user.id AS previous_user_id, before_user.name AS previous_user_name, after_user.id AS next_user_id, after_user.name AS next_user_name FROM carshare.handover_fuel_deltas d JOIN carshare.driver_intervals before_i ON before_i.id=d.interval_before_id JOIN carshare.users before_user ON before_user.id=before_i.user_id JOIN carshare.driver_intervals after_i ON after_i.id=d.interval_after_id JOIN carshare.users after_user ON after_user.id=after_i.user_id WHERE ${where} ORDER BY d.updated_at, d.id LIMIT $${params.length}`, params)).rows; res.json({ handoverFuelDeltas: rows.map(handoverFuelDeltaRow) }); } catch (error) { next(error); } });
app.post("/v1/projects/:slug/handover-fuel-deltas/:deltaId/accept", async (req, res, next) => { try { const delta = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); const result = await client.query(`UPDATE carshare.handover_fuel_deltas SET status='accepted', accepted_at=$1, reason=$2, updated_at=now() WHERE project_slug=$3 AND id=$4 AND status <> 'filled' RETURNING *`, [parseTimestamp(req.body.occurredAt), req.body.reason ?? null, slug, req.params.deltaId]); if (!result.rowCount) throw badRequest("Unknown handover fuel delta"); return (await client.query(`SELECT d.*, before_user.id AS previous_user_id, before_user.name AS previous_user_name, after_user.id AS next_user_id, after_user.name AS next_user_name FROM carshare.handover_fuel_deltas d JOIN carshare.driver_intervals before_i ON before_i.id=d.interval_before_id JOIN carshare.users before_user ON before_user.id=before_i.user_id JOIN carshare.driver_intervals after_i ON after_i.id=d.interval_after_id JOIN carshare.users after_user ON after_user.id=after_i.user_id WHERE d.id=$1`, [result.rows[0].id])).rows[0]; }); res.json({ handoverFuelDelta: handoverFuelDeltaRow(delta) }); } catch (error) { next(error); } });
app.post("/v1/projects/:slug/handover-fuel-deltas/:deltaId/fill", async (req, res, next) => { try { const bookings = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); const delta = (await client.query(`SELECT d.*, before_i.user_id AS previous_user_id, after_i.user_id AS next_user_id FROM carshare.handover_fuel_deltas d JOIN carshare.driver_intervals before_i ON before_i.id=d.interval_before_id JOIN carshare.driver_intervals after_i ON after_i.id=d.interval_after_id WHERE d.project_slug=$1 AND d.id=$2`, [slug, req.params.deltaId])).rows[0]; if (!delta) throw badRequest("Unknown handover fuel delta"); if (delta.status !== "accepted") throw conflict("handover fuel delta must be accepted before fill"); const payer = await resolveUser(client, slug, { userId: req.body.paidByUserId, name: req.body.paidByName, field: "payer" }); const remaining = Number(delta.abs_liters) - Number(delta.filled_liters ?? 0); if (remaining <= 0.0005) throw conflict("handover fuel delta is already filled"); const liters = req.body.liters == null ? remaining : positive(req.body.liters, "liters"); if (liters > remaining + 0.0005 || liters > Number(delta.abs_liters) + 0.0005) throw badRequest("liters must be no more than the remaining handover fuel delta liters"); const price = positive(req.body.pricePerLiter, "pricePerLiter"); const occurredAt = parseTimestamp(req.body.occurredAt); const shareLiters = liters / 2; const inserted = [];
      for (const debitUserId of [delta.previous_user_id, delta.next_user_id]) {
        if (Number(debitUserId) === Number(payer.id)) continue;
        const result = await client.query(`INSERT INTO carshare.ledger_bookings (project_slug,debit_user_id,credit_user_id,handover_fuel_delta_id,liters,price_per_liter,amount,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [slug, debitUserId, payer.id, delta.id, shareLiters, price, Math.round(shareLiters * price * 100) / 100, occurredAt]);
        inserted.push(result.rows[0]);
      }
      const newFilledLiters = Number(delta.filled_liters ?? 0) + liters;
      const newRemaining = Number(delta.abs_liters) - newFilledLiters;
      await client.query(`UPDATE carshare.handover_fuel_deltas SET filled_liters=$1, status=$2, filled_at=CASE WHEN $3 THEN $4::timestamptz ELSE filled_at END, reason=COALESCE($5, reason), updated_at=now() WHERE id=$6`, [newFilledLiters, newRemaining <= 0.0005 ? "filled" : "accepted", newRemaining <= 0.0005, occurredAt, req.body.reason ?? null, delta.id]);
      if (!inserted.length) return [];
      const ids = inserted.map((row) => row.id);
      return (await client.query(`SELECT b.*, du.name AS debit_name, cu.name AS credit_name FROM carshare.ledger_bookings b JOIN carshare.users du ON du.id=b.debit_user_id JOIN carshare.users cu ON cu.id=b.credit_user_id WHERE b.id = ANY($1::bigint[]) ORDER BY b.id`, [ids])).rows;
    }); res.status(201).json({ ledgerBookings: bookings.map(bookingRow) }); } catch (error) { next(error); } });

app.get("/v1/projects/:slug/obligations", async (req, res, next) => { try { const slug = req.params.slug.toLowerCase(); const status = req.query.status ?? "open"; const where = status === "open" ? "AND o.liters_open > 0" : status === "closed" ? "AND o.liters_open = 0" : ""; const rows = (await query(`SELECT o.*, u.name AS user_name FROM carshare.obligations o JOIN carshare.users u ON u.id=o.user_id WHERE o.project_slug=$1 ${where} ORDER BY o.occurred_at, o.id LIMIT $2`, [slug, limitFrom(req.query.limit, 50)])).rows; res.json({ obligations: rows.map(obligationRow) }); } catch (error) { next(error); } });
app.post("/v1/projects/:slug/obligations", async (req, res, next) => { try { const obligation = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); await assertNoSettledBookings(client, slug); const user = await resolveUser(client, slug, { userId: req.body.userId, name: req.body.name }); const liters = positive(req.body.liters, "liters"); const result = await client.query(`INSERT INTO carshare.obligations (project_slug,user_id,liters_total,liters_open,occurred_at,source,reason) VALUES ($1,$2,$3,$3,$4,'manual',$5) RETURNING *`, [slug, user.id, liters, parseTimestamp(req.body.occurredAt), req.body.reason ?? null]); await recalculateLedger(client, slug); return { ...result.rows[0], user_name: user.name }; }); res.status(201).json({ obligation: obligationRow(obligation) }); } catch (error) { next(error); } });
app.patch("/v1/projects/:slug/obligations/:obligationId", async (req, res, next) => { try { const obligation = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); await assertNoSettledBookings(client, slug); const current = await client.query(`SELECT * FROM carshare.obligations WHERE project_slug=$1 AND id=$2`, [slug, req.params.obligationId]); if (!current.rowCount) throw badRequest("Unknown obligation"); if (current.rows[0].source !== "manual") throw conflict("interval-derived obligations are edited by editing the interval"); const fields = []; const values = []; if (req.body.liters !== undefined) { const liters = positive(req.body.liters, "liters"); values.push(liters); fields.push(`liters_total = $${values.length}`, `liters_open = $${values.length}`); } if (req.body.occurredAt !== undefined) { values.push(parseTimestamp(req.body.occurredAt)); fields.push(`occurred_at = $${values.length}`); } if (req.body.reason !== undefined) { values.push(req.body.reason); fields.push(`reason = $${values.length}`); } if (!fields.length) throw badRequest("at least one editable field is required"); values.push(slug, req.params.obligationId); await client.query(`UPDATE carshare.obligations SET ${fields.join(", ")}, updated_at=now() WHERE project_slug=$${values.length - 1} AND id=$${values.length}`, values); await recalculateLedger(client, slug); return (await client.query(`SELECT o.*, u.name AS user_name FROM carshare.obligations o JOIN carshare.users u ON u.id=o.user_id WHERE o.id=$1`, [req.params.obligationId])).rows[0]; }); res.json({ obligation: obligationRow(obligation) }); } catch (error) { next(error); } });
app.delete("/v1/projects/:slug/obligations/:obligationId", async (req, res, next) => { try { await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); await assertNoSettledBookings(client, slug); await client.query(`DELETE FROM carshare.obligations WHERE project_slug=$1 AND id=$2 AND source='manual'`, [slug, req.params.obligationId]); await recalculateLedger(client, slug); }); res.status(204).end(); } catch (error) { next(error); } });
app.post("/v1/projects/:slug/obligations/:obligationId/fill", async (req, res, next) => { try { const booking = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); const obligation = (await client.query(`SELECT * FROM carshare.obligations WHERE project_slug=$1 AND id=$2`, [slug, req.params.obligationId])).rows[0]; if (!obligation) throw badRequest("Unknown obligation"); const payer = await resolveUser(client, slug, { userId: req.body.paidByUserId, name: req.body.paidByName, field: "payer" }); const liters = req.body.liters == null ? Number(obligation.liters_open) : positive(req.body.liters, "liters"); const price = positive(req.body.pricePerLiter, "pricePerLiter"); await client.query(`UPDATE carshare.obligations SET liters_open=GREATEST(liters_open - $1, 0), updated_at=now() WHERE id=$2`, [liters, obligation.id]); if (Number(obligation.user_id) === Number(payer.id)) return null; const result = await client.query(`INSERT INTO carshare.ledger_bookings (project_slug,debit_user_id,credit_user_id,obligation_id,liters,price_per_liter,amount,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [slug, obligation.user_id, payer.id, obligation.id, liters, price, Math.round(liters * price * 100) / 100, parseTimestamp(req.body.occurredAt)]); return result.rows[0]; }); res.status(201).json({ ledgerBooking: booking }); } catch (error) { next(error); } });

app.get("/v1/projects/:slug/refills", async (req, res, next) => { try { const slug = req.params.slug.toLowerCase(); const params = [slug]; let where = "r.project_slug=$1"; if (req.query.intervalId) { params.push(req.query.intervalId); where += ` AND r.interval_id=$${params.length}`; } params.push(limitFrom(req.query.limit, 20)); const rows = (await query(`SELECT r.*, u.name AS paid_by_name FROM carshare.refills r JOIN carshare.users u ON u.id=r.paid_by_user_id WHERE ${where} ORDER BY r.occurred_at, r.id LIMIT $${params.length}`, params)).rows; res.json({ refills: rows.map(refillRow) }); } catch (error) { next(error); } });
app.post("/v1/projects/:slug/driver-intervals/:intervalId/refills", async (req, res, next) => { try { const refill = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); await assertNoSettledBookings(client, slug); const interval = (await client.query(`SELECT * FROM carshare.driver_intervals WHERE project_slug=$1 AND id=$2`, [slug, req.params.intervalId])).rows[0]; if (!interval) throw badRequest("Unknown interval"); const payer = req.body.paidByUserId || req.body.paidByName ? await resolveUser(client, slug, { userId: req.body.paidByUserId, name: req.body.paidByName, field: "payer" }) : { id: interval.user_id }; const liters = positive(req.body.liters, "liters"); const price = req.body.pricePerLiter == null ? positive(req.body.totalCost, "totalCost") / liters : positive(req.body.pricePerLiter, "pricePerLiter"); const total = req.body.totalCost == null ? Math.round(liters * price * 100) / 100 : nonNegative(req.body.totalCost, "totalCost"); const result = await client.query(`INSERT INTO carshare.refills (project_slug,interval_id,paid_by_user_id,liters,price_per_liter,total_cost,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [slug, interval.id, payer.id, liters, price, total, parseTimestamp(req.body.occurredAt)]); await recalculateLedger(client, slug); return (await client.query(`SELECT r.*, u.name AS paid_by_name FROM carshare.refills r JOIN carshare.users u ON u.id=r.paid_by_user_id WHERE r.id=$1`, [result.rows[0].id])).rows[0]; }); res.status(201).json({ refill: refillRow(refill) }); } catch (error) { next(error); } });
app.patch("/v1/projects/:slug/refills/:refillId", async (req, res, next) => { try { const refill = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); await assertNoSettledBookings(client, slug); const fields = []; const values = []; if (req.body.liters !== undefined) { values.push(positive(req.body.liters, "liters")); fields.push(`liters=$${values.length}`); } if (req.body.pricePerLiter !== undefined) { values.push(positive(req.body.pricePerLiter, "pricePerLiter")); fields.push(`price_per_liter=$${values.length}`); } if (req.body.totalCost !== undefined) { values.push(nonNegative(req.body.totalCost, "totalCost")); fields.push(`total_cost=$${values.length}`); } if (req.body.paidByUserId !== undefined || req.body.paidByName !== undefined) { const payer = await resolveUser(client, slug, { userId: req.body.paidByUserId, name: req.body.paidByName, field: "payer" }); values.push(payer.id); fields.push(`paid_by_user_id=$${values.length}`); } if (req.body.occurredAt !== undefined) { values.push(parseTimestamp(req.body.occurredAt)); fields.push(`occurred_at=$${values.length}`); } if (!fields.length) throw badRequest("at least one editable field is required"); values.push(slug, req.params.refillId); await client.query(`UPDATE carshare.refills SET ${fields.join(",")}, updated_at=now() WHERE project_slug=$${values.length - 1} AND id=$${values.length}`, values); await recalculateLedger(client, slug); return (await client.query(`SELECT r.*, u.name AS paid_by_name FROM carshare.refills r JOIN carshare.users u ON u.id=r.paid_by_user_id WHERE r.id=$1`, [req.params.refillId])).rows[0]; }); res.json({ refill: refillRow(refill) }); } catch (error) { next(error); } });
app.delete("/v1/projects/:slug/refills/:refillId", async (req, res, next) => { try { await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); await assertNoSettledBookings(client, slug); await client.query(`DELETE FROM carshare.refills WHERE project_slug=$1 AND id=$2`, [slug, req.params.refillId]); await recalculateLedger(client, slug); }); res.status(204).end(); } catch (error) { next(error); } });

app.get("/v1/projects/:slug/ledger-bookings", async (req, res, next) => { try { const slug = req.params.slug.toLowerCase(); const status = req.query.status ?? "unsettled"; const where = status === "unsettled" ? "AND b.settlement_id IS NULL" : status === "settled" ? "AND b.settlement_id IS NOT NULL" : ""; const rows = (await query(`SELECT b.*, du.name AS debit_name, cu.name AS credit_name FROM carshare.ledger_bookings b JOIN carshare.users du ON du.id=b.debit_user_id JOIN carshare.users cu ON cu.id=b.credit_user_id WHERE b.project_slug=$1 ${where} ORDER BY b.occurred_at, b.id`, [slug])).rows; res.json({ ledgerBookings: rows.map(bookingRow) }); } catch (error) { next(error); } });
app.post("/v1/projects/:slug/settlements", async (req, res, next) => { try { const settlement = await withTransaction(async (client) => { const slug = req.params.slug.toLowerCase(); const result = await client.query(`INSERT INTO carshare.settlements (project_slug, occurred_at, note) VALUES ($1,$2,$3) RETURNING *`, [slug, parseTimestamp(req.body.occurredAt), req.body.note ?? null]); await client.query(`UPDATE carshare.ledger_bookings SET settlement_id=$1 WHERE project_slug=$2 AND settlement_id IS NULL`, [result.rows[0].id, slug]); return result.rows[0]; }); res.status(201).json({ settlement }); } catch (error) { next(error); } });
app.get("/v1/projects/:slug/settlements", async (req, res, next) => { try { const rows = (await query(`SELECT * FROM carshare.settlements WHERE project_slug=$1 ORDER BY occurred_at DESC, id DESC LIMIT 20`, [req.params.slug.toLowerCase()])).rows; res.json({ settlements: rows }); } catch (error) { next(error); } });

app.use((error, _req, res, _next) => { res.status(error.status ?? 500).json({ error: error.message ?? "Internal server error" }); });

const port = Number(process.env.PORT ?? 8080);
export async function start() {
  await pool.query("SELECT 1");
  await withTransaction((client) => ensureProjectRecord(client, { slug: process.env.CARSHARE_DEFAULT_PROJECT ?? "shared-car", name: process.env.CARSHARE_PROJECT_NAME ?? "Shared Car", currency: process.env.CARSHARE_CURRENCY ?? "EUR", baselinePricePerLiter: process.env.CARSHARE_BASELINE_PRICE_PER_LITER ?? null }));
  app.listen(port, () => console.log(`carshare service listening on ${port}`));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  start().catch((error) => { console.error(error); process.exit(1); });
}
