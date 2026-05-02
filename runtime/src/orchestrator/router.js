import { loadRouting } from '../config/loader.js';

function resolveEnvValue(value, env) {
  if (typeof value === 'string' && value.startsWith('env:')) return env[value.slice(4)];
  return value;
}

export async function resolveAgentSystemForMessage(message, options = {}) {
  if (message.agentSystemId) return { agentSystemId: message.agentSystemId, source: 'message' };
  const env = options.env ?? process.env;
  const routing = options.routing ?? await loadRouting();
  const bindings = routing.bindings ?? [];
  const match = bindings.find((binding) => {
    if (binding.channel !== message.channel) return false;
    const peerId = resolveEnvValue(binding.peer_id, env);
    return peerId && String(peerId) === String(message.channelChatId);
  });
  if (match) return { agentSystemId: match.system, source: 'routing', binding: match.id };
  if (message.defaultAgentSystemId) return { agentSystemId: message.defaultAgentSystemId, source: 'default' };
  return { agentSystemId: 'scratch', source: 'fallback' };
}
