# 0002 Defer Model Gateway

Status: Accepted
Date: 2026-05-01

## Context

The initial model aliases are Bedrock aliases in `config/models.yaml`. A model gateway such as LiteLLM or Bifrost could help later with provider diversity, routing, alias management, and fallback policy, but it would add another deployment dependency before those needs are proven.

## Decision

Use direct AWS Bedrock integration first, preferably through Bedrock/Mantle-compatible clients if viable. Defer LiteLLM, Bifrost, or any model gateway until provider diversity or routing pain justifies the additional boundary, and require a future ADR before it becomes a deployment dependency.

## Consequences

- Initial deployment has fewer moving parts and no gateway container dependency.
- Runtime model client work focuses on AWS Bedrock credentials, aliases, and API behavior.
- Gateway-specific OpenAI-compatible contracts, routing rules, and fallback behavior remain undefined until a future ADR introduces them.
- Adding non-Bedrock providers later may require adapting model client abstractions or introducing a gateway.

## Related

- Structurizr: `container`, `deployment-oracle-compose`, `Agent Runtime App`, `External Model Providers`
- Rules: AR-006
- Contracts: `config/models.yaml`, `architecture/implementation-contracts/0001-agent-runtime-app.md`
