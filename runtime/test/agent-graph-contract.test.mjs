import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYaml } from './yaml-helper.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '../..');
const allowedTopLevelFields = new Set(['id', 'description', 'nodes', 'edges', 'schema', 'version', 'entrypoint', 'state']);
const requiredTopLevelFields = ['id', 'description', 'nodes', 'edges'];
const allowedNodeTypes = new Set(['input', 'agent', 'llm_call', 'function', 'tool', 'output']);
const namedBoolean = /^[A-Za-z_][A-Za-z0-9_]*$/;
const equalityCheck = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\s*==\s*"[^"]+"$/;

const graphCases = [
  { systemId: 'scratch', graphPath: 'agent-systems/scratch/graph.yaml', toolsPath: 'agent-systems/scratch/tools.yaml' },
  { systemId: 'carshare', graphPath: 'agent-systems/carshare/graph.yaml', toolsPath: 'agent-systems/carshare/tools.yaml' },
];

function assertWhenExpression(expression, edgeDescription) {
  assert.equal(typeof expression, 'string', `${edgeDescription} when must be a string`);
  assert(!/[|();]/.test(expression), `${edgeDescription} when must not contain arbitrary-code operators`);
  const atoms = expression.split('&&').map((atom) => atom.trim());
  assert(atoms.length > 0 && atoms.every(Boolean), `${edgeDescription} when must contain named atoms joined by &&`);
  for (const atom of atoms) {
    assert(
      namedBoolean.test(atom) || equalityCheck.test(atom),
      `${edgeDescription} when atom must be a named boolean or quoted equality check: ${atom}`,
    );
  }
}

function toolIds(toolsYaml) {
  assert(Array.isArray(toolsYaml.tools), 'tools.yaml must define a tools list');
  return new Set(toolsYaml.tools.map((tool) => tool.id));
}

describe('agent graph schema v1 fitness', () => {
  const permissions = readYaml(resolve(repoRoot, 'config/permissions.yaml'));
  const permissionClasses = new Set(Object.keys(permissions.permission_classes ?? {}));

  for (const graphCase of graphCases) {
    it(`${graphCase.systemId} graph conforms to the v1 graph contract`, () => {
      const graph = readYaml(resolve(repoRoot, graphCase.graphPath));
      const declaredToolIds = toolIds(readYaml(resolve(repoRoot, graphCase.toolsPath)));

      for (const field of requiredTopLevelFields) assert(field in graph, `${graphCase.graphPath} missing ${field}`);
      assert.deepEqual(
        Object.keys(graph).filter((field) => !allowedTopLevelFields.has(field)),
        [],
        `${graphCase.graphPath} has unsupported top-level fields`,
      );
      assert.equal(typeof graph.id, 'string');
      assert.equal(typeof graph.description, 'string');
      assert(graph.nodes && typeof graph.nodes === 'object' && !Array.isArray(graph.nodes));
      assert(Array.isArray(graph.edges));

      const nodeIds = new Set(Object.keys(graph.nodes));
      for (const [nodeId, node] of Object.entries(graph.nodes)) {
        assert(allowedNodeTypes.has(node.type), `${nodeId} uses unsupported type ${node.type}`);
        assert.notEqual(node.type, 'human_approval', `${nodeId} must not use future approval node types`);
        if (node.type === 'agent') assert.equal(typeof node.agent, 'string', `${nodeId} agent nodes require agent`);
        if (node.type === 'llm_call') {
          assert(
            typeof node.prompt === 'string' || typeof node.model === 'string' || (node.prompt && typeof node.prompt === 'object') || (node.model && typeof node.model === 'object'),
            `${nodeId} llm_call nodes require prompt or model configuration`,
          );
        }
        if (node.type === 'tool') {
          assert.equal(typeof node.tool, 'string', `${nodeId} tool nodes require tool`);
          assert(declaredToolIds.has(node.tool), `${nodeId} references undeclared tool id ${node.tool}`);
          assert.equal(typeof node.permission_class, 'string', `${nodeId} tool nodes require permission_class`);
          assert(permissionClasses.has(node.permission_class), `${nodeId} permission_class must exist in config/permissions.yaml`);
          if (node.permission_class !== 'none') {
            assert.equal(typeof node.idempotency_key, 'string', `${nodeId} write tool nodes require idempotency_key`);
            assert.match(node.idempotency_key, /\$\{(?:message|run|domain|project)\./, `${nodeId} idempotency_key must derive from stable identifiers`);
          }
        }
      }

      for (const [index, edge] of graph.edges.entries()) {
        const edgeDescription = `${graphCase.graphPath} edge ${index}`;
        assert(nodeIds.has(edge.from), `${edgeDescription} from node must exist: ${edge.from}`);
        assert(nodeIds.has(edge.to), `${edgeDescription} to node must exist: ${edge.to}`);
        if ('when' in edge) assertWhenExpression(edge.when, edgeDescription);
      }
    });
  }

  it('carshare write tool nodes use the writes_domain_data permission class', () => {
    const graph = readYaml(resolve(repoRoot, 'agent-systems/carshare/graph.yaml'));
    const tools = readYaml(resolve(repoRoot, 'agent-systems/carshare/tools.yaml'));
    const sideEffectsByToolId = new Map(tools.tools.map((tool) => [tool.id, tool.side_effects]));

    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if (node.type === 'tool' && sideEffectsByToolId.get(node.tool) === 'writes_domain_data') {
        assert.equal(node.permission_class, 'writes_domain_data', `${nodeId} must use writes_domain_data`);
        assert.equal(typeof node.idempotency_key, 'string', `${nodeId} write tool must be idempotent`);
      }
    }
  });

  it('carshare graph routes through exactly one Carshare Persistence Agent', () => {
    const graph = readYaml(resolve(repoRoot, 'agent-systems/carshare/graph.yaml'));
    const agentEntries = Object.entries(graph.nodes).filter(([, node]) => node.type === 'agent');

    assert.equal(agentEntries.length, 1, 'carshare graph must have exactly one true agent node');

    const [[nodeId, agentNode]] = agentEntries;
    assert.equal(nodeId, 'carshare_persistence');
    assert.equal(agentNode.agent, 'carshare_persistence');
    assert.equal(typeof agentNode.skill, 'string', 'carshare persistence agent requires a skill reference');

    const pseudoAgentNames = new Set(['parser', 'responder']);
    for (const [id, node] of Object.entries(graph.nodes)) {
      assert.notEqual(node.agent, 'parser', `${id} must not be a pseudo-agent parser node`);
      assert.notEqual(node.agent, 'responder', `${id} must not be a pseudo-agent responder node`);
      assert(!pseudoAgentNames.has(id), `${id} must not be modeled as a pseudo-agent node`);
    }
  });
});
