# Runtime Configuration

Cross-system configuration lives here. These files are versioned and should not contain secrets.

- `channels.yaml`: channel accounts and non-secret channel policy.
- `routing.yaml`: channel/chat/thread bindings to agent systems.
- `models.yaml`: model aliases and fallback policy.
- `resources.yaml`: shared starter resources such as carshare projects.
- `permissions.yaml`: default permission classes and policy rules.

Secrets stay in `.env` or a secret manager. Starter runtime-generated state belongs in Postgres.
