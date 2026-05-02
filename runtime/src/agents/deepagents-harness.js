import { readFile } from 'node:fs/promises';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repoPath } from '../config/loader.js';
import { enforceToolPermission } from '../tools/permission-policy.js';

const projectSlug = process.env.CARSHARE_PROJECT_SLUG ?? 'shared-car';

const toolSchemas = {
  'carshare.list_users': z.object({}),
  'carshare.add_user': z.object({ name: z.string().min(1) }),
  'carshare.create_driver_interval': z.object({ name: z.string().optional(), userId: z.string().optional(), startedAt: z.string().optional(), startLiters: z.number(), endLiters: z.number().optional() }),
  'carshare.list_driver_intervals': z.object({ limit: z.number().optional(), from: z.string().optional(), to: z.string().optional() }),
  'carshare.list_obligations': z.object({ status: z.string().optional(), limit: z.number().optional() }),
  'carshare.list_refills': z.object({ intervalId: z.string().optional(), limit: z.number().optional() }),
  'carshare.list_ledger_bookings': z.object({ status: z.string().optional() }),
  'carshare.list_settlements': z.object({}),
  'carshare.list_handover_fuel_deltas': z.object({ status: z.string().optional(), limit: z.number().optional(), from: z.string().optional(), to: z.string().optional() }),
  'carshare.accept_handover_fuel_delta': z.object({ deltaId: z.string(), reason: z.string().optional(), occurredAt: z.string().optional() }),
  'carshare.fill_handover_fuel_delta': z.object({ deltaId: z.string(), paidByUserId: z.string().optional(), paidByName: z.string().optional(), pricePerLiter: z.number(), liters: z.number().optional(), occurredAt: z.string().optional(), reason: z.string().optional() }),
};

function methodForTool(toolId) {
  return toolId.replace(/^carshare\./, '').replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function normalizeToolName(toolId) {
  return toolId.replace(/\./g, '_');
}

function responseTextFromDeepAgentResult(result) {
  const messages = result?.messages;
  const last = Array.isArray(messages) ? messages.at(-1) : null;
  const content = last?.content ?? result?.content ?? result?.output ?? result?.text;
  if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('').trim();
  if (typeof content === 'string') return content;
  return JSON.stringify(result ?? {});
}

async function buildSystemPrompt({ agentSystemId, agentName, skillName }) {
  const [agentPrompt, skillContract] = await Promise.all([
    readFile(repoPath('agent-systems', agentSystemId, 'agents', `${agentName}.md`), 'utf8'),
    readFile(repoPath('architecture', 'contracts', `${skillName}.md`), 'utf8'),
  ]);
  return `${agentPrompt}\n\n## Skill Contract\n\n${skillContract}`;
}

export function createRuntimeWrappedCarshareTools({ graphTools, carshareClient, runId, nodeId, store }) {
  return (graphTools.tools ?? [])
    .filter((definition) => definition.id?.startsWith('carshare.'))
    .map((definition) => tool(async (input = {}) => {
      const permissionClass = definition.side_effects ?? 'none';
      enforceToolPermission({ toolId: definition.id, permissionClass });
      const method = methodForTool(definition.id);
      if (typeof carshareClient[method] !== 'function') throw new Error(`Unsupported carshare tool: ${definition.id}`);
      const idempotencyKey = permissionClass === 'none' ? undefined : `${runId}:${nodeId}:${definition.id}:${JSON.stringify(input)}`;
      try {
        const response = await callCarshareClient({ carshareClient, method, input });
        await store?.recordToolInvocation({ runId, nodeId, toolName: definition.id, permissionClass, idempotencyKey, status: 'succeeded', request: input, response });
        return JSON.stringify(response);
      } catch (error) {
        await store?.recordToolInvocation({ runId, nodeId, toolName: definition.id, permissionClass, idempotencyKey, status: 'failed', request: input, response: { error: error.message } });
        throw error;
      }
    }, {
      name: normalizeToolName(definition.id),
      description: definition.description ?? definition.id,
      schema: toolSchemas[definition.id] ?? z.object({}).passthrough(),
    }));
}

async function callCarshareClient({ carshareClient, method, input }) {
  if (method === 'addRefill') return carshareClient.addRefill(projectSlug, input.intervalId, input);
  if (method === 'editRefill') return carshareClient.editRefill(projectSlug, input.refillId, input);
  if (method === 'deleteRefill') return carshareClient.deleteRefill(projectSlug, input.refillId);
  if (method === 'editUser') return carshareClient.editUser(projectSlug, input.userId, input);
  if (method === 'deleteUser') return carshareClient.deleteUser(projectSlug, input.userId);
  if (method === 'editDriverInterval') return carshareClient.editDriverInterval(projectSlug, input.intervalId, input);
  if (method === 'deleteDriverInterval') return carshareClient.deleteDriverInterval(projectSlug, input.intervalId);
  if (method === 'editObligation') return carshareClient.editObligation(projectSlug, input.obligationId, input);
  if (method === 'removeObligation') return carshareClient.removeObligation(projectSlug, input.obligationId);
  if (method === 'fillObligation') return carshareClient.fillObligation(projectSlug, input.obligationId, input);
  if (method === 'acceptHandoverFuelDelta') return carshareClient.acceptHandoverFuelDelta(projectSlug, input.deltaId, input);
  if (method === 'fillHandoverFuelDelta') return carshareClient.fillHandoverFuelDelta(projectSlug, input.deltaId, input);
  return carshareClient[method](projectSlug, input);
}

export async function runDeepAgentNode({ bundle, nodeId, message, runId, store, modelClient, carshareClient, deepAgentFactory }) {
  const node = bundle.graph.nodes[nodeId];
  const factory = deepAgentFactory ?? (await import('deepagents')).createDeepAgent;
  const agent = factory({
    name: node.agent,
    model: modelClient?.asLangChainModel?.() ?? process.env.AGENT_RUNTIME_DEEPAGENTS_MODEL_ID ?? process.env.AGENT_RUNTIME_DEFAULT_MODEL_ID,
    systemPrompt: await buildSystemPrompt({ agentSystemId: bundle.system.id ?? 'carshare', agentName: node.agent, skillName: node.skill }),
    tools: createRuntimeWrappedCarshareTools({ graphTools: bundle.tools, carshareClient, runId, nodeId, store }),
    subagents: [],
    memory: [],
    checkpointer: false,
    store: undefined,
    interruptOn: {},
  });
  const result = await agent.invoke({ messages: [{ role: 'user', content: message.text ?? '' }] });
  return responseTextFromDeepAgentResult(result);
}
