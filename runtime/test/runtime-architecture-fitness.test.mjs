import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '../..');
const runtimeSourceRoot = resolve(repoRoot, 'runtime/src');
const sqlRoot = resolve(repoRoot, 'postgres');

const documentedRuntimeTables = [
  'runtime.channel_bindings',
  'runtime.sessions',
  'runtime.messages',
  'runtime.runs',
  'runtime.tool_invocations',
];

const forbiddenRuntimeTerms = [
  /\bgithub\b/i,
  /\boctokit\b/i,
  /\bbranch\b/i,
  /\bcommit\b/i,
  /\bpull_request\b/i,
  /\bpull request\b/i,
  /\bapproval(s)?\b/i,
  /\bcheckpoint(s)?\b/i,
  /\bartifact(s)?\b/i,
  /\bknowledge\b/i,
  /promoted[-_ ]knowledge/i,
];

const forbiddenOutOfScopeTables = [
  /runtime\.(approval|approvals|approval_requests)\b/i,
  /runtime\.(checkpoint|checkpoints|graph_checkpoints)\b/i,
  /runtime\.(artifact|artifacts)\b/i,
  /runtime\.(knowledge|knowledge_items|promoted_knowledge)\b/i,
  /runtime\.(github|github_writes|pull_requests)\b/i,
];

function filesUnder(root, predicate) {
  if (!existsSync(root)) return [];
  const entries = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...filesUnder(path, predicate));
    else if (predicate(path)) entries.push(path);
  }
  return entries;
}

function sqlFiles() {
  return filesUnder(sqlRoot, (path) => extname(path) === '.sql');
}

describe('runtime architecture fitness', () => {
  it('type agent graph nodes are routed through the DeepAgents harness boundary', () => {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'runtime/package.json'), 'utf8'));
    const graphRunner = readFileSync(resolve(runtimeSourceRoot, 'langgraph/graph-runner.js'), 'utf8');
    const harness = readFileSync(resolve(runtimeSourceRoot, 'agents/deepagents-harness.js'), 'utf8');

    assert(packageJson.dependencies.deepagents, 'runtime must depend on DeepAgents for type: agent nodes');
    assert.match(graphRunner, /runDeepAgentNode/);
    assert.match(harness, /import\('deepagents'\)/);
    assert.match(harness, /enforceToolPermission/);
    assert.match(harness, /recordToolInvocation/);
    assert.match(harness, /checkpointer:\s*false/);
    assert.match(harness, /subagents:\s*\[\]/);
    assert.match(harness, /memory:\s*\[\]/);
  });

  it('runtime source and SQL migrations do not introduce out-of-scope write, approval, checkpoint, artifact, or knowledge paths', () => {
    const runtimeCodeFiles = filesUnder(runtimeSourceRoot, (path) => ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].includes(extname(path)));
    const configFiles = filesUnder(resolve(repoRoot, 'agent-systems'), (path) => ['.yaml', '.yml'].includes(extname(path)));
    const checkedFiles = [...runtimeCodeFiles, ...sqlFiles(), ...configFiles];
    const violations = [];

    for (const file of checkedFiles) {
      const contents = readFileSync(file, 'utf8');
      for (const forbiddenTerm of forbiddenRuntimeTerms) {
        if (forbiddenTerm.test(contents)) violations.push(`${relative(repoRoot, file)} contains ${forbiddenTerm}`);
      }
      for (const forbiddenTable of forbiddenOutOfScopeTables) {
        if (forbiddenTable.test(contents)) violations.push(`${relative(repoRoot, file)} creates or references ${forbiddenTable}`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it('runtime DB SQL contains exactly the documented starter runtime tables and no out-of-scope runtime tables', () => {
    const sql = sqlFiles().map((file) => readFileSync(file, 'utf8')).join('\n');
    const runtimeTables = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(runtime\.[a-z_]+)/gi)].map((match) => match[1].toLowerCase());

    assert.deepEqual([...new Set(runtimeTables)].sort(), [...documentedRuntimeTables].sort());
    for (const forbiddenTable of forbiddenOutOfScopeTables) {
      assert(!forbiddenTable.test(sql), `SQL must not include out-of-scope table ${forbiddenTable}`);
    }
  });
});
