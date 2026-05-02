# Config Loader

Loads and validates versioned configuration from `config/` and `agent-systems/`.

Secrets are resolved from environment variables or a secret manager, never from Git-tracked YAML or Markdown.
