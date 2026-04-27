---
name: carshare_recorder
description: Record car handovers and refills, and report the current fuel balance from the shared ledger.
metadata:
  openclaw:
    os: ["linux"]
    requires:
      bins: ["carshare-tool"]
---

# Carshare Recorder

Use `carshare-tool` whenever the user is talking about the shared car ledger.

## When to use it

- Someone reports a handover with remaining liters in the tank.
- Someone reports a refill, liters added, or total fuel cost.
- Someone asks for the current balance, current tank state, or recent ledger entries.

## Commands

Ensure the project exists before the first record in a fresh setup:

```bash
carshare-tool ensure-project --project shared-car --name "Shared Car" --currency EUR --baseline-price 1.80
```

Record a handover:

```bash
carshare-tool handover --project shared-car --holder "Anna" --liters 23.5 --raw-text "handover to Anna, 23.5 liters left"
```

Record a refill:

```bash
carshare-tool refill --project shared-car --payer "Zara" --liters 31.4 --total-cost 56.21 --raw-text "I filled up 31.4 liters for 56.21 euro"
```

Get the current summary:

```bash
carshare-tool summary --project shared-car
```

Inspect recent records:

```bash
carshare-tool events --project shared-car --limit 10
```

## Guidance

- Use explicit names for `--holder` and `--payer`.
- Preserve the original chat wording in `--raw-text` when storing a record.
- If the message contains only one clear number and it is obviously the remaining tank level, treat it as a handover only if the ownership change is also clear from context.
- If cost and liters are both present for a refill, store both.
- If someone asks for balance, call `summary` first and then explain the result in plain language.
- If the summary mentions warnings or inconsistencies, surface them clearly instead of hiding them.
