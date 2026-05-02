import { loadAgentBundle } from '../config/loader.js';
import { createBedrockModelClient } from '../model/bedrock-client.js';
import { createCarshareClient } from '../tools/carshare-client.js';
import { enforceToolPermission } from '../tools/permission-policy.js';

const projectSlug = process.env.CARSHARE_PROJECT_SLUG ?? 'shared-car';

export async function loadLangGraphRuntime() {
  const module = await import('@langchain/langgraph');
  return { StateGraph: module.StateGraph };
}

function numberAfter(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number.parseFloat(match[1].replace(',', '.'));
  }
  return undefined;
}

function nameAfter(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim().replace(/[,.!?]+$/, '');
  }
  return undefined;
}

export function classifyCarshareMessage(text) {
  const value = String(text ?? '').toLowerCase();
  if (/\b(balance|summary|owe|current|status|state)\b/.test(value) && /\b(what|how|balance|summary|current)\b/.test(value)) return 'question';
  if (/\b(fill|filled|refill|fuel|gas|petrol)\b/.test(value)) return 'refill';
  if (/\b(handover|hand over|turn|left|remaining|tank)\b/.test(value)) return 'handover';
  return 'other';
}

function parseCarshareRecord(text, intent, senderRef) {
  if (intent === 'handover') {
    return {
      holder: nameAfter(text, [/handover\s+to\s+([A-Za-z][\w -]*)/i, /to\s+([A-Za-z][\w -]*)/i]) ?? senderRef,
      litersRemaining: numberAfter(text, [/(\d+(?:[.,]\d+)?)\s*(?:l|liter|liters)\s*(?:left|remaining)?/i, /tank\s+is\s+at\s+(\d+(?:[.,]\d+)?)/i]),
      rawText: text,
      recordedBy: senderRef,
    };
  }
  if (intent === 'refill') {
    return {
      payer: nameAfter(text, [/by\s+([A-Za-z][\w -]*)/i]) ?? senderRef,
      litersAdded: numberAfter(text, [/(\d+(?:[.,]\d+)?)\s*(?:l|liter|liters)/i]),
      totalCost: numberAfter(text, [/(?:for|cost|paid)\s+(\d+(?:[.,]\d+)?)/i, /(\d+(?:[.,]\d+)?)\s*(?:eur|euro|€)/i]),
      rawText: text,
      recordedBy: senderRef,
    };
  }
  return {};
}

function missingFields(intent, record) {
  if (intent === 'handover') return ['holder', 'litersRemaining'].filter((field) => record[field] === undefined || record[field] === '');
  if (intent === 'refill') return ['payer', 'litersAdded', 'totalCost'].filter((field) => record[field] === undefined || record[field] === '');
  return [];
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

export async function runGraph({ agentSystemId, message, runId, store, modelClient = createBedrockModelClient(), carshareClient = createCarshareClient() }) {
  const bundle = await loadAgentBundle(agentSystemId);
  if (agentSystemId === 'carshare') return runCarshareGraph({ bundle, message, runId, store, carshareClient });
  return runScratchGraph({ bundle, message, modelClient });
}

async function runScratchGraph({ bundle, message, modelClient }) {
  const text = await modelClient.chat({ text: message.text ?? '' });
  return { graphId: bundle.graph.id, graphVersion: bundle.graph.version, status: 'completed', responseText: text };
}

async function runCarshareGraph({ bundle, message, runId, store, carshareClient }) {
  const text = message.text ?? '';
  const intent = classifyCarshareMessage(text);
  if (intent === 'other') return { graphId: bundle.graph.id, status: 'completed', responseText: 'Please send a handover, refill, or balance question.', path: traceGraphPath(bundle.graph, { intent }) };

  if (intent === 'question') {
    const path = traceGraphPath(bundle.graph, { intent });
    try {
      const summary = await carshareClient.summary(projectSlug);
      return { graphId: bundle.graph.id, status: 'completed', responseText: `Current carshare summary: ${JSON.stringify(summary)}`, path };
    } catch {
      return { graphId: bundle.graph.id, status: 'completed', responseText: 'I cannot read the carshare summary right now.', path };
    }
  }

  const record = parseCarshareRecord(text, intent, message.senderRef);
  const missing = missingFields(intent, record);
  const state = { intent, record_is_valid: missing.length === 0, record_is_ambiguous: missing.length > 0, message, runId };
  const path = traceGraphPath(bundle.graph, state);
  if (missing.length) return { graphId: bundle.graph.id, status: 'completed', responseText: `Please add: ${missing.join(', ')}.`, path };

  const nodeId = intent === 'handover' ? 'record_handover' : 'record_refill';
  const node = bundle.graph.nodes[nodeId];
  enforceToolPermission({ toolId: node.tool, permissionClass: node.permission_class });
  const idempotencyKey = interpolate(node.idempotency_key, state);
  try {
    const response = intent === 'handover'
      ? await carshareClient.recordHandover(projectSlug, record)
      : await carshareClient.recordRefill(projectSlug, record);
    await store?.recordToolInvocation({ runId, nodeId, toolName: node.tool, permissionClass: node.permission_class, idempotencyKey, status: 'succeeded', request: record, response });
    return { graphId: bundle.graph.id, status: 'completed', responseText: `Recorded carshare ${intent}.`, toolResponse: response, path };
  } catch (error) {
    await store?.recordToolInvocation({ runId, nodeId, toolName: node.tool, permissionClass: node.permission_class, idempotencyKey, status: 'failed', request: record, response: { error: error.message } });
    return { graphId: bundle.graph.id, status: 'completed', responseText: `Could not record carshare ${intent}.`, path };
  }
}
