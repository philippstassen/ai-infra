# Agent Graph YAML Schema v1

Status: Proposed

## Purpose

Agent graph YAML files under `agent-systems/scratch/graph.yaml` and `agent-systems/carshare/graph.yaml` describe versioned starter graphs loaded by Agent Runtime App and executed synchronously per message by the Graph Runner. Current scaffold files must conform to this minimum v1 contract now, even though the contract remains Proposed until runtime code and tests exist.

## Required Top-Level Fields

- `id`: stable graph identifier.
- `description`: human-readable purpose.
- `nodes`: mapping of node IDs to node definitions.
- `edges`: ordered list of directed graph edges.

## Optional Top-Level Fields

- `schema`: schema identifier, for example `agent-graph`.
- `version`: graph schema or graph definition version.
- `entrypoint`: node ID where execution starts when it is not inferable from the first input node.
- `state`: declared state keys or state schema reference used by nodes and `when` expressions.

These fields are optional in the current v1 minimum so existing scaffold graphs can remain concise.

## Node Definition

Required fields:

- `type`: one of `input`, `agent`, `function`, `tool`, `output`.

Type-specific fields:

- `agent` nodes require `agent`.
- `tool` nodes require `tool` and `permission_class`.
- Write `tool` nodes require `idempotency_key`.

`human_approval` is not a starter v1 node type. Approval/resume nodes are a future extension that require a new ADR and contract if risky writes or long-running resumable workflows are introduced.

## Edges and Conditions

Each edge requires:

- `from`: source node ID.
- `to`: target node ID.

Optional:

- `when`: restricted condition expression. v1 allows named booleans such as `record_is_valid`, equality checks such as `intent == "refill"`, and `&&` conjunctions of those atoms; arbitrary code execution is not allowed.

## Tool Permissions and Idempotency

Tool nodes must declare a `permission_class` matching `config/permissions.yaml`. Write tools must provide an `idempotency_key` expression derived from stable run, message, or domain identifiers so retries do not duplicate side effects.

Read-only tool nodes use `permission_class: none` and do not require `idempotency_key`.

## Example

```yaml
id: carshare-ledger
description: Parse carshare messages and call the ledger API.
nodes:
  receive_message:
    type: input
  parse_refill:
    type: agent
    agent: parser
  record_refill:
    type: tool
    tool: carshare.record_refill
    permission_class: writes_domain_data
    idempotency_key: "${message.id}:${project.slug}:refill"
  send_response:
    type: output
edges:
  - from: receive_message
    to: parse_refill
    when: intent == "refill"
  - from: parse_refill
    to: record_refill
    when: record_is_valid
  - from: record_refill
    to: send_response
```
