function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeName(name) {
  return name.trim();
}

function addBalance(balances, person, amount) {
  if (!person) return;
  const key = normalizeName(person);
  balances.set(key, round((balances.get(key) ?? 0) + amount));
}

export function buildSummary(project, events) {
  const balances = new Map();
  const warnings = [];

  let tankLiters = null;
  let tankValue = 0;
  let currentHolder = null;
  let startingTankLiters = null;
  let startingTankValue = 0;

  for (const event of events) {
    if (event.kind === "handover") {
      const litersRemaining = Number(event.liters_remaining);

      if (!Number.isFinite(litersRemaining) || litersRemaining < 0) {
        warnings.push(`Invalid handover liters on event ${event.id}.`);
        continue;
      }

      if (tankLiters == null) {
        tankLiters = litersRemaining;
        currentHolder = event.holder ?? null;

        if (project.baseline_price_per_liter != null) {
          startingTankLiters = litersRemaining;
          startingTankValue = litersRemaining * Number(project.baseline_price_per_liter);
          tankValue = startingTankValue;
        }

        continue;
      }

      const consumption = tankLiters - litersRemaining;
      if (consumption < -0.05) {
        warnings.push(
          `Tank level increased by ${round(Math.abs(consumption), 3)} L between handovers before a refill was recorded.`
        );
        tankLiters = litersRemaining;
      } else {
        const safeConsumption = Math.max(consumption, 0);
        const unitCost = tankLiters > 0 ? tankValue / tankLiters : 0;
        const consumedValue = safeConsumption * unitCost;
        addBalance(balances, currentHolder, -consumedValue);
        tankLiters = litersRemaining;
        tankValue = Math.max(tankValue - consumedValue, 0);
      }

      currentHolder = event.holder ?? currentHolder;
      continue;
    }

    if (event.kind === "refill") {
      const litersAdded = Number(event.liters_added);
      const totalCost = Number(event.total_cost);

      if (!Number.isFinite(litersAdded) || litersAdded <= 0) {
        warnings.push(`Invalid refill liters on event ${event.id}.`);
        continue;
      }

      if (!Number.isFinite(totalCost) || totalCost < 0) {
        warnings.push(`Invalid refill cost on event ${event.id}.`);
        continue;
      }

      if (tankLiters == null) {
        tankLiters = 0;
      }

      tankLiters += litersAdded;
      tankValue += totalCost;
      addBalance(balances, event.payer, totalCost);

      if (!currentHolder && event.payer) {
        currentHolder = event.payer;
      }
    }
  }

  const people = Array.from(balances.entries())
    .map(([name, balance]) => ({
      name,
      balance: round(balance),
      status: balance > 0.009 ? "should_receive" : balance < -0.009 ? "owes" : "settled",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const currentPricePerLiter = tankLiters && tankLiters > 0 ? tankValue / tankLiters : null;

  if (startingTankLiters == null) {
    warnings.push(
      "No baseline-priced starting handover was recorded. Early usage before the first priced refill may be incomplete."
    );
  }

  return {
    project: {
      slug: project.slug,
      name: project.name,
      currency: project.currency,
      baselinePricePerLiter:
        project.baseline_price_per_liter != null ? Number(project.baseline_price_per_liter) : null,
    },
    balances: people,
    state: {
      currentHolder,
      tankLiters: tankLiters != null ? round(tankLiters, 3) : null,
      estimatedTankValue: round(tankValue),
      estimatedPricePerLiter: currentPricePerLiter != null ? round(currentPricePerLiter, 4) : null,
      startingTankLiters: startingTankLiters != null ? round(startingTankLiters, 3) : null,
      startingTankValue: round(startingTankValue),
      tankDeltaLiters:
        tankLiters != null && startingTankLiters != null ? round(tankLiters - startingTankLiters, 3) : null,
      tankDeltaValue: startingTankLiters != null ? round(tankValue - startingTankValue) : null,
    },
    warnings,
  };
}
