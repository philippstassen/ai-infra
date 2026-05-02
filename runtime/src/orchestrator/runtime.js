import { resolveAgentSystemForMessage } from './router.js';
import { loadAgentGraph } from '../config/loader.js';
import { runGraph } from '../langgraph/graph-runner.js';
import { createRuntimeStore } from '../persistence/runtime-store.js';

export async function handleMessage(envelope, options = {}) {
  const store = options.store ?? await createRuntimeStore(options.storeOptions);
  const route = await resolveAgentSystemForMessage(envelope, options);
  const agentSystemId = route.agentSystemId;
  const session = await store.ensureSession({ channel: envelope.channel, channelChatId: envelope.channelChatId, agentSystemId });
  const inputMessageId = envelope.message?.id ?? `${Date.now()}`;
  const normalizedMessage = {
    id: inputMessageId,
    provider: envelope.channel ?? 'direct',
    text: envelope.message?.text ?? '',
    senderRef: envelope.senderRef ?? envelope.message?.senderRef ?? `${envelope.channel}:${envelope.channelChatId}`,
  };
  await store.recordMessage({ sessionId: session.id, channelMessageId: inputMessageId, direction: 'inbound', senderRef: normalizedMessage.senderRef, content: normalizedMessage });
  const graph = await loadAgentGraph(agentSystemId);
  const run = await store.startRun({ sessionId: session.id, graphId: graph.id, graphVersion: graph.version });
  try {
    const result = await runGraph({ agentSystemId, message: normalizedMessage, runId: run.id, store, ...options });
    await store.finishRun({ runId: run.id, status: result.status ?? 'completed' });
    await store.recordMessage({ sessionId: session.id, direction: 'outbound', content: { text: result.responseText } });
    return { agentSystemId, inputMessageId, sessionId: session.id, runId: run.id, status: result.status ?? 'completed', responseText: result.responseText, route };
  } catch (error) {
    await store.finishRun({ runId: run.id, status: 'failed' });
    if (options.throwOnError) throw error;
    return { agentSystemId, inputMessageId, sessionId: session.id, runId: run.id, status: 'failed', error: error.message };
  } finally {
    if (!options.store) await store.close();
  }
}
