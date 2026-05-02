import { loadAgentBundle } from '../config/loader.js';
import { runDeepAgentNode } from '../agents/deepagents-harness.js';
import { createBedrockModelClient } from '../model/bedrock-client.js';
import { createCarshareClient } from '../tools/carshare-client.js';

export async function loadLangGraphRuntime() {
  const module = await import('@langchain/langgraph');
  return { StateGraph: module.StateGraph };
}

export function classifyCarshareMessage(text) {
  const value = String(text ?? '').toLowerCase();
  if (/\b(driver interval|interval|started driving|starts driving|starting at|start at)\b/.test(value)) return 'create_driver_interval';
  if (/\b(users|participants|drivers)\b/.test(value) && /\b(list|show|who)\b/.test(value)) return 'list_users';
  if (/\b(add|create|new)\b/.test(value) && /\b(user|participant|driver)\b/.test(value)) return 'add_user';
  if (/\b(obligation|obligations)\b/.test(value) && /\b(list|show|open)\b/.test(value)) return 'list_obligations';
  if (/\b(refill|refills)\b/.test(value) && /\b(list|show|recent|last)\b/.test(value)) return 'list_refills';
  if (/\b(settlement|settlements)\b/.test(value) && /\b(list|show|recent)\b/.test(value)) return 'list_settlements';
  if (/\b(ledger|bookings|balance|summary|owe|current|status|state)\b/.test(value)) return 'list_ledger_bookings';
  if (/\b(fill|filled|refill|fuel|gas|petrol)\b/.test(value)) return 'add_refill';
  if (/\b(handover|hand over|turn|left|remaining|tank)\b/.test(value)) return 'create_driver_interval';
  return 'other';
}

function interpolate(template, state) {
  return String(template ?? '').replace(/\$\{message\.provider\}/g, state.message.provider)
    .replace(/\$\{message\.id\}/g, state.message.id)
    .replace(/\$\{project\.slug\}/g, projectSlug)
    .replace(/\$\{run\.id\}/g, state.runId)
    .replace(/\$\{domain\.id\}/g, state.message.id);
}

export function evaluateWhen(expression, state = {}) {
  if (!expression) return true;
  return String(expression).split('&&').every((rawAtom) => {
    const atom = rawAtom.trim();
    const equality = atom.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*==\s*"([^"]+)"$/);
    if (equality) return String(state[equality[1]]) === equality[2];
    return Boolean(state[atom]);
  });
}

export function traceGraphPath(graph, state = {}) {
  const start = graph.entrypoint ?? Object.entries(graph.nodes).find(([, node]) => node.type === 'input')?.[0];
  const path = [];
  const visited = new Set();
  let current = start;
  while (current && !visited.has(current)) {
    path.push(current);
    visited.add(current);
    const outgoing = (graph.edges ?? []).filter((edge) => edge.from === current);
    const next = outgoing.find((edge) => evaluateWhen(edge.when, state));
    current = next?.to;
  }
  return path;
}

export async function runGraph({ agentSystemId, message, runId, store, modelClient = createBedrockModelClient(), carshareClient = createCarshareClient(), deepAgentFactory, agentNodeRunner = runDeepAgentNode }) {
  const bundle = await loadAgentBundle(agentSystemId);
  if (agentSystemId === 'carshare') return runCarshareGraph({ bundle, message, runId, store, modelClient, carshareClient, deepAgentFactory, agentNodeRunner });
  return runScratchGraph({ bundle, message, modelClient });
}

async function runScratchGraph({ bundle, message, modelClient }) {
  const text = await modelClient.chat({ text: message.text ?? '' });
  return { graphId: bundle.graph.id, graphVersion: bundle.graph.version, status: 'completed', responseText: text };
}

async function runCarshareGraph({ bundle, message, runId, store, modelClient, carshareClient, deepAgentFactory, agentNodeRunner }) {
  const path = traceGraphPath(bundle.graph, { message, runId });
  const nodeId = path.map((id) => [id, bundle.graph.nodes[id]]).find(([, node]) => node?.type === 'agent')?.[0];
  if (!nodeId) return { graphId: bundle.graph.id, status: 'completed', responseText: 'No agent node is configured for this carshare graph.', path };
  const responseText = await agentNodeRunner({ bundle, nodeId, message, runId, store, modelClient, carshareClient, deepAgentFactory });
  return { graphId: bundle.graph.id, status: 'completed', responseText, path };
}
