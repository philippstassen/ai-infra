# Agent/Workflow Graph YAML Schema v1

Status: Proposed

## Purpose

Graph YAML files under `agent-systems/scratch/graph.yaml` and `agent-systems/carshare/graph.yaml` describe versioned starter workflows loaded by Agent Runtime App and executed synchronously per message by the Graph Runner. Current scaffold files must conform to this minimum v1 contract now, even though the contract remains Proposed until runtime code and tests exist.

In this architecture, `agent` is reserved for a goal-directed LLM/tool loop that can inspect state, decide the next action, call tools, observe results, ask clarifying questions, and continue until complete or blocked. One-shot LLM calls and deterministic graph/function/tool steps are workflow nodes, not agents, and must be named accordingly in diagrams and configuration when this schema is revised or migrated.

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

- `type`: one of `input`, `agent`, `llm_call`, `function`, `tool`, `output`.

Type-specific fields:

- `agent` nodes require `agent` and at least one skill reference such as `skill` or `skills`; they identify a goal-directed agent loop executed by DeepAgents inside the Agent Runtime App. The Graph Runner starts the DeepAgents run with the agent identifier, skill references, runtime-wrapped tool registry, and Model Client. Permission checks, idempotency, tool invocation audit, model-provider selection, and tool boundaries remain runtime-controlled. The node output is a final response or a focused clarification request.
- `llm_call` nodes require `prompt` or `model` configuration and identify a single prompt/model invocation with no iterative tool loop. They are hosted by the One-Shot LLM Call Host and are not executed by DeepAgents.
- `tool` nodes require `tool` and `permission_class`.
- Write `tool` nodes require `idempotency_key`.

DeepAgents features such as implicit durable memory, filesystem access, subagents, and long-running approval/resume are not part of schema v1 unless a future ADR and compatible configuration explicitly enable them.

Existing scaffold graphs may still use `type: agent` for parser/composer prompt steps. Those labels are stale and misleading until the runtime and graph YAMLs migrate to `llm_call` or `function` for one-shot or deterministic steps, and to a single Carshare Persistence Agent for carshare persistence/query workflows.

`human_approval` is not a starter v1 node type. Approval/resume nodes are a future extension that require a new ADR and contract if risky writes or long-running resumable workflows are introduced.

## Agent Node Interaction Contract

`type: agent` is an internal interaction contract from Graph Runner to the DeepAgents-backed Goal-Directed Agent Harness. Implementations must load repo-local versioned agent and skill configuration, execute the agent through DeepAgents, expose only runtime-wrapped tools, and return either the agent's final response or a clarification. Agents must not access Carshare data stores directly; Carshare operations go through the Tool Client Layer and Carshare Service HTTP API.

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
description: Route carshare messages to one goal-directed persistence agent.
nodes:
  receive_message:
    type: input
  carshare_persistence:
    type: agent
    agent: carshare_persistence
    skill: carshare-agent-skill
  classify_chitchat:
    type: function
  send_response:
    type: output
edges:
  - from: receive_message
    to: carshare_persistence
    when: intent == "carshare"
  - from: carshare_persistence
    to: send_response
```
