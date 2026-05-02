# Implementation Contract Snapshot

Source: `architecture/implementation-contracts/0001-agent-runtime-app.md`.

Implement the starter Agent Runtime App as one deployable modular-monolith container. It may load local `agent-systems/scratch` and `agent-systems/carshare` definitions, persist only the starter `runtime` schema, call Carshare Service through HTTP/JSON, call AWS Bedrock directly, and send/receive Telegram messages when enabled.

Forbidden in this slice: GitHub writes, direct normal-operation writes to `carshare.*`, implicit long-term memory, separate deployable agent containers, Carshare MCP, model gateway dependencies, checkpoint/resume, approval gates, artifact storage, and knowledge promotion.
