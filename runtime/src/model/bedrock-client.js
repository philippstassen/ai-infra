const fallbackText = 'I can help with that.';

export class BedrockModelClient {
  constructor({ modelId = process.env.BEDROCK_MODEL_ID ?? process.env.AGENT_RUNTIME_DEFAULT_MODEL_ID ?? 'moonshotai.kimi-k2.5', region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'eu-north-1' } = {}) {
    this.modelId = modelId;
    this.region = region;
  }

  async chat({ text }) {
    if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE && !process.env.AWS_WEB_IDENTITY_TOKEN_FILE && !process.env.AWS_BEARER_TOKEN_BEDROCK) {
      return deterministicModelFallback(text);
    }
    try {
      const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
      const client = new BedrockRuntimeClient({ region: this.region });
      const result = await client.send(new ConverseCommand({ modelId: this.modelId, messages: [{ role: 'user', content: [{ text }] }] }));
      return result.output?.message?.content?.find((part) => typeof part.text === 'string')?.text ?? deterministicModelFallback(text);
    } catch {
      return deterministicModelFallback(text);
    }
  }
}

export function deterministicModelFallback(text = '') {
  const trimmed = String(text).trim();
  return trimmed ? `Received: ${trimmed.slice(0, 120)}` : fallbackText;
}

export function createBedrockModelClient(options) {
  return new BedrockModelClient(options);
}
