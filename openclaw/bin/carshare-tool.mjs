#!/usr/bin/env node

const baseUrl = process.env.CARSHARE_API_BASE_URL ?? "http://carshare:8080";
const defaultProject = process.env.CARSHARE_DEFAULT_PROJECT ?? "shared-car";

function usage() {
  console.error(`Usage:
  carshare-tool ensure-project [--project slug] [--name name] [--currency EUR] [--baseline-price 1.80]
  carshare-tool handover --holder NAME --liters 23.5 [--project slug] [--when ISO] [--recorded-by SOURCE] [--raw-text TEXT] [--note TEXT]
  carshare-tool refill --payer NAME --liters 31.4 --total-cost 56.21 [--project slug] [--when ISO] [--recorded-by SOURCE] [--raw-text TEXT] [--note TEXT]
  carshare-tool summary [--project slug]
  carshare-tool events [--project slug] [--limit 20]`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = rest[i + 1];
    if (value == null || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
    i += 1;
  }

  return { command, options };
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }

  return body;
}

function required(options, key) {
  const value = options[key];
  if (!value) {
    throw new Error(`Missing required option --${key}`);
  }
  return value;
}

function numberValue(options, key) {
  const raw = required(options, key);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number for --${key}: ${raw}`);
  }
  return value;
}

async function main() {
  try {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (!command) {
      usage();
      process.exitCode = 1;
      return;
    }

    const project = options.project ?? defaultProject;
    let result;

    if (command === "ensure-project") {
      result = await request("/v1/projects/ensure", {
        method: "POST",
        body: JSON.stringify({
          slug: project,
          name: options.name,
          currency: options.currency,
          baselinePricePerLiter: options["baseline-price"],
        }),
      });
    } else if (command === "handover") {
      result = await request(`/v1/projects/${encodeURIComponent(project)}/handover`, {
        method: "POST",
        body: JSON.stringify({
          holder: required(options, "holder"),
          litersRemaining: numberValue(options, "liters"),
          occurredAt: options.when,
          recordedBy: options["recorded-by"],
          rawText: options["raw-text"],
          note: options.note,
        }),
      });
    } else if (command === "refill") {
      result = await request(`/v1/projects/${encodeURIComponent(project)}/refill`, {
        method: "POST",
        body: JSON.stringify({
          payer: required(options, "payer"),
          litersAdded: numberValue(options, "liters"),
          totalCost: numberValue(options, "total-cost"),
          occurredAt: options.when,
          recordedBy: options["recorded-by"],
          rawText: options["raw-text"],
          note: options.note,
        }),
      });
    } else if (command === "summary") {
      result = await request(`/v1/projects/${encodeURIComponent(project)}/summary`);
    } else if (command === "events") {
      const limit = options.limit ? `?limit=${encodeURIComponent(options.limit)}` : "";
      result = await request(`/v1/projects/${encodeURIComponent(project)}/events${limit}`);
    } else {
      usage();
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
