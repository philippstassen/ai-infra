import express from "express";
import { pool, query, withTransaction } from "./db.js";
import { buildSummary } from "./summary.js";

const app = express();
app.use(express.json());

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function parseTimestamp(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw badRequest(`Invalid timestamp: ${value}`);
  }
  return date.toISOString();
}

function parsePositiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw badRequest(`${field} must be a positive number`);
  }
  return number;
}

function parseNonNegativeNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw badRequest(`${field} must be a non-negative number`);
  }
  return number;
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest(`${field} is required`);
  }
  return value.trim();
}

async function ensureProjectRecord(client, payload) {
  const slug = requireText(payload.slug, "slug").toLowerCase();
  const name = typeof payload.name === "string" && payload.name.trim() !== "" ? payload.name.trim() : slug;
  const currency = typeof payload.currency === "string" && payload.currency.trim() !== "" ? payload.currency.trim().toUpperCase() : "EUR";
  const baselinePricePerLiter =
    payload.baselinePricePerLiter == null || payload.baselinePricePerLiter === ""
      ? process.env.CARSHARE_BASELINE_PRICE_PER_LITER ?? null
      : Number(payload.baselinePricePerLiter);

  if (baselinePricePerLiter != null && (!Number.isFinite(Number(baselinePricePerLiter)) || Number(baselinePricePerLiter) < 0)) {
    throw badRequest("baselinePricePerLiter must be a non-negative number");
  }

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

async function getProject(slug) {
  const result = await query(`SELECT * FROM carshare.projects WHERE slug = $1`, [slug]);
  if (result.rowCount === 0) {
    throw badRequest(`Unknown project: ${slug}`);
  }
  return result.rows[0];
}

async function getEvents(slug, limit) {
  const result = await query(
    `SELECT *
       FROM carshare.events
      WHERE project_slug = $1
      ORDER BY occurred_at ASC, id ASC
      LIMIT $2`,
    [slug, limit]
  );
  return result.rows;
}

app.get("/health", async (_req, res, next) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/v1/projects/ensure", async (req, res, next) => {
  try {
    const project = await withTransaction((client) => ensureProjectRecord(client, req.body));
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

app.post("/v1/projects/:slug/handover", async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const holder = requireText(req.body.holder, "holder");
    const litersRemaining = parseNonNegativeNumber(req.body.litersRemaining, "litersRemaining");
    const occurredAt = parseTimestamp(req.body.occurredAt);
    await getProject(slug);

    const result = await query(
      `INSERT INTO carshare.events (
         project_slug, kind, occurred_at, holder, liters_remaining, recorded_by, note, raw_text
       )
       VALUES ($1, 'handover', $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        slug,
        occurredAt,
        holder,
        litersRemaining,
        req.body.recordedBy ?? null,
        req.body.note ?? null,
        req.body.rawText ?? null,
      ]
    );

    res.status(201).json({ event: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.post("/v1/projects/:slug/refill", async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const payer = requireText(req.body.payer, "payer");
    const litersAdded = parsePositiveNumber(req.body.litersAdded, "litersAdded");
    const totalCost = parseNonNegativeNumber(req.body.totalCost, "totalCost");
    const occurredAt = parseTimestamp(req.body.occurredAt);
    await getProject(slug);

    const result = await query(
      `INSERT INTO carshare.events (
         project_slug, kind, occurred_at, payer, liters_added, total_cost, price_per_liter, recorded_by, note, raw_text
       )
       VALUES ($1, 'refill', $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        slug,
        occurredAt,
        payer,
        litersAdded,
        totalCost,
        totalCost / litersAdded,
        req.body.recordedBy ?? null,
        req.body.note ?? null,
        req.body.rawText ?? null,
      ]
    );

    res.status(201).json({ event: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get("/v1/projects/:slug/events", async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase();
    await getProject(slug);
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    if (!Number.isFinite(limit) || limit <= 0 || limit > 500) {
      throw badRequest("limit must be between 1 and 500");
    }

    const events = await query(
      `SELECT *
         FROM carshare.events
        WHERE project_slug = $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT $2`,
      [slug, limit]
    );

    res.json({ events: events.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/v1/projects/:slug/summary", async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const project = await getProject(slug);
    const events = await getEvents(slug, 10000);
    const summary = buildSummary(project, events);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status ?? 500;
  res.status(status).json({ error: error.message ?? "Internal server error" });
});

const port = Number(process.env.PORT ?? 8080);

async function start() {
  await pool.query("SELECT 1");

  await withTransaction(async (client) => {
    await ensureProjectRecord(client, {
      slug: process.env.CARSHARE_DEFAULT_PROJECT ?? "shared-car",
      name: process.env.CARSHARE_PROJECT_NAME ?? "Shared Car",
      currency: process.env.CARSHARE_CURRENCY ?? "EUR",
      baselinePricePerLiter: process.env.CARSHARE_BASELINE_PRICE_PER_LITER ?? null,
    });
  });

  app.listen(port, () => {
    console.log(`carshare service listening on ${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
