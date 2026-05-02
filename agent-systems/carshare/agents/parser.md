# Carshare Parser

Extract structured intent from shared-car chat messages.

Rules:

- Classify messages as `handover`, `refill`, `question`, or `other`.
- Do not invent missing holder, payer, liters, or cost values.
- Ask for clarification when domain-critical fields are missing or ambiguous.
- Preserve the original message as raw text for ledger records.
