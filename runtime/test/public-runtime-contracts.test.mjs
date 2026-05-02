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
      runner.traceGraphPath(graph, { intent: 'create_driver_interval' }),
      ['receive_message', 'carshare_persistence', 'send_response'],
    );
    assert.equal(typeof runner.loadLangGraphRuntime, 'function');
  });

  it('carshare client exposes target Carshare Service endpoint methods and paths', async () => {
    const { createCarshareClient } = await importRuntimeModule('src/tools/carshare-client.js');
    const calls = [];
    const client = createCarshareClient({
      baseUrl: 'http://carshare.test',
      fetchImpl: async (url, init = {}) => {
        calls.push({ url, init });
        return { ok: true, text: async () => '{}' };
      },
    });

    const expectedMethods = [
      'listUsers', 'addUser', 'editUser', 'deleteUser',
      'createDriverInterval', 'listDriverIntervals', 'editDriverInterval', 'deleteDriverInterval',
      'listObligations', 'addObligation', 'editObligation', 'removeObligation', 'fillObligation',
      'addRefill', 'listRefills', 'editRefill', 'deleteRefill',
      'listLedgerBookings', 'createSettlement', 'listSettlements',
      'listHandoverFuelDeltas', 'acceptHandoverFuelDelta', 'fillHandoverFuelDelta',
    ];
    for (const method of expectedMethods) assert.equal(typeof client[method], 'function', `missing client method ${method}`);

    await client.listUsers('shared-car');
    await client.addUser('shared-car', { name: 'Ada' });
    await client.editUser('shared-car', 'usr_1', { active: false });
    await client.deleteUser('shared-car', 'usr_1');
    await client.createDriverInterval('shared-car', { name: 'Ada', startLiters: 18.5 });
    await client.listDriverIntervals('shared-car', { limit: 3, from: '2026-05-01T00:00:00Z', to: '2026-05-02T00:00:00Z' });
    await client.editDriverInterval('shared-car', 'int_1', { endLiters: 14 });
    await client.deleteDriverInterval('shared-car', 'int_1');
    await client.listObligations('shared-car', { status: 'open', limit: 10 });
    await client.addObligation('shared-car', { name: 'Ada', liters: 4.5 });
    await client.editObligation('shared-car', 'obl_1', { liters: 3.5 });
    await client.removeObligation('shared-car', 'obl_1');
    await client.fillObligation('shared-car', 'obl_2', { paidByName: 'Bruno', pricePerLiter: 1.9 });
    await client.addRefill('shared-car', 'int_2', { liters: 10, totalCost: 20 });
    await client.listRefills('shared-car', { intervalId: 'int_2', limit: 3 });
    await client.editRefill('shared-car', 'ref_1', { totalCost: 21 });
    await client.deleteRefill('shared-car', 'ref_1');
    await client.listLedgerBookings('shared-car', { status: 'unsettled' });
    await client.createSettlement('shared-car', { note: 'May settlement' });
    await client.listSettlements('shared-car');
    await client.listHandoverFuelDeltas('shared-car', { status: 'pending', limit: 5 });
    await client.acceptHandoverFuelDelta('shared-car', 'delta_1', { reason: 'accepted' });
    await client.fillHandoverFuelDelta('shared-car', 'delta_1', { paidByName: 'Ada', pricePerLiter: 2.1 });

    assert.deepEqual(calls.map((call) => [call.init.method ?? 'GET', call.url]), [
      ['GET', 'http://carshare.test/v1/projects/shared-car/users'],
      ['POST', 'http://carshare.test/v1/projects/shared-car/users'],
      ['PATCH', 'http://carshare.test/v1/projects/shared-car/users/usr_1'],
      ['DELETE', 'http://carshare.test/v1/projects/shared-car/users/usr_1'],
      ['POST', 'http://carshare.test/v1/projects/shared-car/driver-intervals'],
      ['GET', 'http://carshare.test/v1/projects/shared-car/driver-intervals?limit=3&from=2026-05-01T00%3A00%3A00Z&to=2026-05-02T00%3A00%3A00Z'],
      ['PATCH', 'http://carshare.test/v1/projects/shared-car/driver-intervals/int_1'],
      ['DELETE', 'http://carshare.test/v1/projects/shared-car/driver-intervals/int_1'],
      ['GET', 'http://carshare.test/v1/projects/shared-car/obligations?status=open&limit=10'],
      ['POST', 'http://carshare.test/v1/projects/shared-car/obligations'],
      ['PATCH', 'http://carshare.test/v1/projects/shared-car/obligations/obl_1'],
      ['DELETE', 'http://carshare.test/v1/projects/shared-car/obligations/obl_1'],
      ['POST', 'http://carshare.test/v1/projects/shared-car/obligations/obl_2/fill'],
      ['POST', 'http://carshare.test/v1/projects/shared-car/driver-intervals/int_2/refills'],
      ['GET', 'http://carshare.test/v1/projects/shared-car/refills?intervalId=int_2&limit=3'],
      ['PATCH', 'http://carshare.test/v1/projects/shared-car/refills/ref_1'],
      ['DELETE', 'http://carshare.test/v1/projects/shared-car/refills/ref_1'],
      ['GET', 'http://carshare.test/v1/projects/shared-car/ledger-bookings?status=unsettled'],
      ['POST', 'http://carshare.test/v1/projects/shared-car/settlements'],
      ['GET', 'http://carshare.test/v1/projects/shared-car/settlements'],
      ['GET', 'http://carshare.test/v1/projects/shared-car/handover-fuel-deltas?status=pending&limit=5'],
      ['POST', 'http://carshare.test/v1/projects/shared-car/handover-fuel-deltas/delta_1/accept'],
      ['POST', 'http://carshare.test/v1/projects/shared-car/handover-fuel-deltas/delta_1/fill'],
    ]);
  });

  it('carshare client surfaces documented JSON error responses', async () => {
    const { createCarshareClient } = await importRuntimeModule('src/tools/carshare-client.js');
    const client = createCarshareClient({
      baseUrl: 'http://carshare.test',
      fetchImpl: async () => ({ ok: false, status: 400, text: async () => '{"error":"missing project"}' }),
    });

    await assert.rejects(() => client.listHandoverFuelDeltas('shared-car'), /missing project/);
  });

  it('carshare persistence harness asks one focused clarification and does not write when fields are missing', async () => {
    const { runGraph } = await importRuntimeModule('src/langgraph/graph-runner.js');
    const calls = [];

    const result = await runGraph({
      agentSystemId: 'carshare',
      runId: 'run-missing-driver-interval',
      message: {
        id: 'msg-missing-driver-interval',
        provider: 'direct',
        senderRef: 'tester',
        text: 'Create a driver interval for Ada.',
      },
      agentNodeRunner: async (context) => {
        calls.push(['agentNodeRunner', context.nodeId, context.message.text]);
        return 'What are the start liters in the tank?';
      },
    });

    assert.equal(result.status, 'completed');
    assert.match(result.responseText, /start liters/i);
    assert(!/participant.*start liters.*end liters/i.test(result.responseText), 'clarification should be focused, not a broad form request');
    assert.deepEqual(calls, [['agentNodeRunner', 'carshare_persistence', 'Create a driver interval for Ada.']]);
  });

  it('carshare persistence harness writes a valid driver interval and performs read-back', async () => {
    const { runGraph } = await importRuntimeModule('src/langgraph/graph-runner.js');
    const calls = [];

    const result = await runGraph({
      agentSystemId: 'carshare',
      runId: 'run-valid-driver-interval',
      message: {
        id: 'msg-valid-driver-interval',
        provider: 'direct',
        senderRef: 'tester',
        text: 'Create a driver interval for Ada starting at 18.5 liters.',
      },
      agentNodeRunner: async (context) => {
        calls.push(['agentNodeRunner', context.nodeId, context.message.text]);
        return 'Saved driver interval for Ada at 18.5 liters.';
      },
    });

    assert.deepEqual(calls, [
      ['agentNodeRunner', 'carshare_persistence', 'Create a driver interval for Ada starting at 18.5 liters.'],
    ]);
    assert.equal(result.status, 'completed');
    assert.match(result.responseText, /created|recorded|saved/i);
    assert.match(result.responseText, /Ada/i);
    assert.match(result.responseText, /18\.5/);
  });
});
