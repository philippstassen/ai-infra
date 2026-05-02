import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL, fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(testDir, '..');
const repoRoot = resolve(runtimeRoot, '..');

async function importRuntimeModule(relativePath) {
  return import(new URL(relativePath, pathToFileURL(`${runtimeRoot}/`)).href);
}

describe('public runtime helper contracts', () => {
  it('config loader exposes graph, tools, and permissions loading helpers', async () => {
    const loader = await importRuntimeModule('src/config/loader.js');
    assert.equal(typeof loader.loadAgentGraph, 'function');
    assert.equal(typeof loader.loadAgentTools, 'function');
    assert.equal(typeof loader.loadPermissions, 'function');

    const graph = await loader.loadAgentGraph(resolve(repoRoot, 'agent-systems/scratch/graph.yaml'));
    const tools = await loader.loadAgentTools(resolve(repoRoot, 'agent-systems/scratch/tools.yaml'));
    const permissions = await loader.loadPermissions(resolve(repoRoot, 'config/permissions.yaml'));

    assert.equal(graph.id, 'scratch-chat');
    assert(tools.tools.some((tool) => tool.id === 'model.chat'));
    assert('none' in permissions.permission_classes);
  });

  it('permission policy exposes deterministic tool permission enforcement', async () => {
    const policy = await importRuntimeModule('src/tools/permission-policy.js');
    assert.equal(typeof policy.enforceToolPermission, 'function');

    assert.doesNotThrow(() => policy.enforceToolPermission({ toolId: 'model.chat', permissionClass: 'none' }));
    assert.doesNotThrow(() => policy.enforceToolPermission({ toolId: 'carshare.record_refill', permissionClass: 'writes_domain_data' }));
    assert.throws(
      () => policy.enforceToolPermission({ toolId: 'github.create_pull_request', permissionClass: 'github_write' }),
      /permission|forbidden|github|write/i,
    );
  });

  it('router exposes channel-message to configured-agent-system resolution', async () => {
    const router = await importRuntimeModule('src/orchestrator/router.js');
    assert.equal(typeof router.resolveAgentSystemForMessage, 'function');

    const route = await router.resolveAgentSystemForMessage({
      channel: 'direct',
      channelChatId: 'test-chat',
      defaultAgentSystemId: 'scratch',
    });

    assert.equal(route.agentSystemId, 'scratch');
  });

  it('runtime exposes a direct synchronous handleMessage path', async () => {
    const runtime = await importRuntimeModule('src/orchestrator/runtime.js');
    assert.equal(typeof runtime.handleMessage, 'function');

    const result = await runtime.handleMessage({
      channel: 'direct',
      channelChatId: 'test-chat',
      message: { id: 'test-message-1', text: 'hello' },
      agentSystemId: 'scratch',
    });

    assert.equal(result.agentSystemId, 'scratch');
    assert.equal(result.inputMessageId, 'test-message-1');
    assert.equal(result.status, 'completed');
  });

  it('graph runner traces configured edges for carshare conditions', async () => {
    const loader = await importRuntimeModule('src/config/loader.js');
    const runner = await importRuntimeModule('src/langgraph/graph-runner.js');
    const graph = await loader.loadAgentGraph(resolve(repoRoot, 'agent-systems/carshare/graph.yaml'));

    assert.deepEqual(
      runner.traceGraphPath(graph, { intent: 'refill', record_is_valid: true }),
      ['receive_message', 'classify_intent', 'parse_refill', 'validate_record', 'record_refill', 'compose_reply', 'send_response'],
    );
    assert.deepEqual(
      runner.traceGraphPath(graph, { intent: 'handover', record_is_valid: true }),
      ['receive_message', 'classify_intent', 'parse_handover', 'validate_record', 'record_handover', 'compose_reply', 'send_response'],
    );
    assert.deepEqual(
      runner.traceGraphPath(graph, { intent: 'question' }),
      ['receive_message', 'classify_intent', 'query_ledger', 'compose_reply', 'send_response'],
    );
    assert.deepEqual(
      runner.traceGraphPath(graph, { intent: 'handover', record_is_ambiguous: true }),
      ['receive_message', 'classify_intent', 'parse_handover', 'validate_record', 'ask_clarification'],
    );
    assert.equal(typeof runner.loadLangGraphRuntime, 'function');
  });

  it('carshare client uses the documented HTTP endpoint paths', async () => {
    const { createCarshareClient } = await importRuntimeModule('src/tools/carshare-client.js');
    const calls = [];
    const client = createCarshareClient({
      baseUrl: 'http://carshare.test',
      fetchImpl: async (url, init = {}) => {
        calls.push({ url, init });
        return { ok: true, text: async () => '{}' };
      },
    });

    await client.health();
    await client.ensureProject({ slug: 'shared-car' });
    await client.recordHandover('shared-car', { holder: 'Ada', litersRemaining: 10 });
    await client.recordRefill('shared-car', { payer: 'Ada', litersAdded: 10, totalCost: 20 });
    await client.events('shared-car', 5);
    await client.summary('shared-car');

    assert.deepEqual(calls.map((call) => call.url), [
      'http://carshare.test/health',
      'http://carshare.test/v1/projects/ensure',
      'http://carshare.test/v1/projects/shared-car/handover',
      'http://carshare.test/v1/projects/shared-car/refill',
      'http://carshare.test/v1/projects/shared-car/events?limit=5',
      'http://carshare.test/v1/projects/shared-car/summary',
    ]);
  });

  it('carshare client surfaces documented JSON error responses', async () => {
    const { createCarshareClient } = await importRuntimeModule('src/tools/carshare-client.js');
    const client = createCarshareClient({
      baseUrl: 'http://carshare.test',
      fetchImpl: async () => ({ ok: false, status: 400, text: async () => '{"error":"missing project"}' }),
    });

    await assert.rejects(() => client.summary('shared-car'), /missing project/);
  });
});
