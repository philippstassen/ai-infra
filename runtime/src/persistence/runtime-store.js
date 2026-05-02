import { randomUUID } from 'node:crypto';

function nowIso() {
  return new Date().toISOString();
}

export class RuntimeStore {
  constructor({ databaseUrl = process.env.DATABASE_URL, allowMemoryFallback = process.env.AGENT_RUNTIME_ALLOW_IN_MEMORY_STORE !== 'false' } = {}) {
    this.databaseUrl = databaseUrl;
    this.allowMemoryFallback = allowMemoryFallback;
    this.memory = { bindings: [], sessions: [], messages: [], runs: [], toolCalls: [] };
    this.pool = null;
  }

  async connect() {
    if (!this.databaseUrl) return this;
    try {
      const { Pool } = await import('pg');
      this.pool = new Pool({ connectionString: this.databaseUrl });
      await this.pool.query('select 1');
    } catch (error) {
      this.pool = null;
      if (!this.allowMemoryFallback) throw error;
    }
    return this;
  }

  async close() {
    if (this.pool) await this.pool.end();
  }

  async ensureSession({ channel, channelChatId, agentSystemId }) {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('begin');
        const bindingResult = await client.query(
          'insert into runtime.channel_bindings (id, channel, channel_chat_id, agent_system_id) values ($1,$2,$3,$4) on conflict (channel, channel_chat_id) do update set agent_system_id = excluded.agent_system_id, updated_at = now() returning id, default_session_id',
          [randomUUID(), channel, String(channelChatId), agentSystemId],
        );
        const binding = bindingResult.rows[0];
        if (binding.default_session_id) {
          const existing = await client.query('select id, agent_system_id from runtime.sessions where id = $1 and status = $2', [binding.default_session_id, 'active']);
          if (existing.rowCount > 0) {
            await client.query('end');
            return { id: existing.rows[0].id, agentSystemId: existing.rows[0].agent_system_id };
          }
        }
        const sessionId = randomUUID();
        await client.query('insert into runtime.sessions (id, binding_id, agent_system_id) values ($1,$2,$3)', [sessionId, binding.id, agentSystemId]);
        await client.query('update runtime.channel_bindings set default_session_id = $2, updated_at = now() where id = $1', [binding.id, sessionId]);
        await client.query('end');
        return { id: sessionId, agentSystemId };
      } catch (error) {
        await client.query('rollback').catch(() => null);
        throw error;
      } finally {
        client.release();
      }
    }
    let session = this.memory.sessions.find((item) => item.channel === channel && item.channelChatId === String(channelChatId) && item.agentSystemId === agentSystemId);
    if (!session) {
      session = { id: randomUUID(), channel, channelChatId: String(channelChatId), agentSystemId, status: 'active', createdAt: nowIso() };
      this.memory.sessions.push(session);
    }
    return session;
  }

  async recordMessage({ sessionId, channelMessageId, direction, senderRef, content }) {
    const id = randomUUID();
    if (this.pool) {
      await this.pool.query('insert into runtime.messages (id, session_id, channel_message_id, direction, sender_ref, content) values ($1,$2,$3,$4,$5,$6)', [id, sessionId, channelMessageId, direction, senderRef, content]);
    } else {
      this.memory.messages.push({ id, sessionId, channelMessageId, direction, senderRef, content, createdAt: nowIso() });
    }
    return { id };
  }

  async startRun({ sessionId, graphId, graphVersion }) {
    const id = randomUUID();
    if (this.pool) {
      await this.pool.query('insert into runtime.runs (id, session_id, graph_id, graph_version, status) values ($1,$2,$3,$4,$5)', [id, sessionId, graphId, graphVersion, 'running']);
    } else {
      this.memory.runs.push({ id, sessionId, graphId, graphVersion, status: 'running', startedAt: nowIso() });
    }
    return { id };
  }

  async finishRun({ runId, status }) {
    if (this.pool) await this.pool.query('update runtime.runs set status = $2, completed_at = now() where id = $1', [runId, status]);
    else {
      const run = this.memory.runs.find((item) => item.id === runId);
      if (run) Object.assign(run, { status, completedAt: nowIso() });
    }
  }

  async recordToolInvocation({ runId, nodeId, toolName, permissionClass, idempotencyKey, status, request, response }) {
    const id = randomUUID();
    if (this.pool) {
      await this.pool.query(
        'insert into runtime.tool_invocations (id, run_id, node_id, tool_name, permission_class, idempotency_key, status, request, response, completed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())',
        [id, runId, nodeId, toolName, permissionClass, idempotencyKey, status, request ?? {}, response ?? null],
      );
    } else {
      this.memory.toolCalls.push({ id, runId, nodeId, toolName, permissionClass, idempotencyKey, status, request, response, createdAt: nowIso(), completedAt: nowIso() });
    }
    return { id };
  }
}

export async function createRuntimeStore(options) {
  return new RuntimeStore(options).connect();
}
