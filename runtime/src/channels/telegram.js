import { handleMessage } from '../orchestrator/runtime.js';

function enabled(env) {
  return env.AGENT_RUNTIME_TELEGRAM_ENABLED === 'true' || env.TELEGRAM_ENABLED === 'true' || env.ENABLE_TELEGRAM === 'true';
}

async function telegramRequest(token, method, body, fetchImpl) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

export function normalizeTelegramUpdate(update) {
  const message = update.message ?? update.edited_message;
  if (!message?.chat || !message.text) return null;
  return {
    channel: 'telegram',
    channelChatId: String(message.chat.id),
    senderRef: `telegram:${message.from?.id ?? message.chat.id}`,
    message: { id: String(message.message_id), text: message.text },
  };
}

export async function startTelegramPolling({ env = process.env, fetchImpl = fetch, runtimeHandler = handleMessage } = {}) {
  if (!enabled(env)) return { enabled: false, stop() {} };
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { enabled: false, stop() {} };
  let stopped = false;
  let offset = 0;
  async function loop() {
    while (!stopped) {
      const payload = await telegramRequest(token, 'getUpdates', { timeout: 25, offset }, fetchImpl).catch(() => ({ ok: false, result: [] }));
      for (const update of payload.result ?? []) {
        offset = Math.max(offset, update.update_id + 1);
        const envelope = normalizeTelegramUpdate(update);
        if (!envelope) continue;
        const result = await runtimeHandler(envelope);
        if (result.responseText) await telegramRequest(token, 'sendMessage', { chat_id: envelope.channelChatId, text: result.responseText }, fetchImpl).catch(() => null);
      }
    }
  }
  loop();
  return { enabled: true, stop() { stopped = true; } };
}
