# Agent Runtime App

Custom starter host for the thin LangGraph/LangChain-style modular-monolith runtime.

Responsibilities:

- Receive normalized channel events.
- Route messages to configured agent systems.
- Execute starter LangGraph workflows and LangChain agent nodes synchronously per message.
- Persist channel bindings, sessions, messages, runs, and tool calls.
- Enforce tool/resource permissions.

Checkpoint/resume, durable artifact storage, and knowledge promotion are intentionally out of the starter scope.

This directory is intentionally separate from `agent-systems/`, which contains versioned behavior definitions.

## Entry points

- `npm start`: starts the private HTTP server and optional Telegram polling.
- `GET /health`: health check.
- `POST /messages`: direct test path for normalized message envelopes.

Example direct envelope:

```json
{
  "channel": "direct",
  "channelChatId": "test",
  "agentSystemId": "scratch",
  "message": { "id": "test-1", "text": "hello" }
}
```

## Tests

```bash
npm test
```

The tests include architecture fitness checks for graph contracts, starter runtime DB tables, permission classes, and excluded starter-scope features.
