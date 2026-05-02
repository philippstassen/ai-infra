export function normalizeDiscordEvent(event) {
  if (!event?.channel_id || !event?.id || !event?.content) return null;
  return {
    channel: 'discord',
    channelChatId: String(event.channel_id),
    senderRef: `discord:${event.author?.id ?? event.channel_id}`,
    message: { id: String(event.id), text: event.content },
  };
}

export async function startDiscordAdapter() {
  return { enabled: false, stop() {} };
}
