# Agent Systems

Versioned definitions for independent starter agent systems live here. An agent system is a routed workflow/application, not just a prompt.

The starter set includes only `scratch/` and `carshare/`.

Each system should define:

- `system.yaml`: identity, default model, memory policy, and permissions summary.
- `graph.yaml`: the intended LangGraph control flow at a human-readable level.
- `agents/`: Markdown instructions for agent nodes used by the graph.
- `tools.yaml`: tools exposed to the graph or its agent nodes.
- `resources.yaml`: optional shared domain resources.

Runtime data does not belong here. Store durable domain data in Postgres and secrets in `.env` or a secret manager. Durable run artifacts are not part of the starter architecture unless a future workflow needs generated files, diffs, or reports.
