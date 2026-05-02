import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(runtimeRoot, '..');

export function repoPath(...parts) {
  return resolve(repoRoot, ...parts);
}

async function readYamlFile(path) {
  return yaml.load(await readFile(path, 'utf8')) ?? {};
}

export async function loadAgentGraph(pathOrSystemId) {
  const path = pathOrSystemId.endsWith?.('.yaml') ? pathOrSystemId : repoPath('agent-systems', pathOrSystemId, 'graph.yaml');
  return readYamlFile(path);
}

export async function loadAgentTools(pathOrSystemId) {
  const path = pathOrSystemId.endsWith?.('.yaml') ? pathOrSystemId : repoPath('agent-systems', pathOrSystemId, 'tools.yaml');
  return readYamlFile(path);
}

export async function loadAgentSystem(systemId) {
  return readYamlFile(repoPath('agent-systems', systemId, 'system.yaml'));
}

export async function loadPermissions(path = repoPath('config', 'permissions.yaml')) {
  return readYamlFile(path);
}

export async function loadRouting(path = repoPath('config', 'routing.yaml')) {
  return readYamlFile(path);
}

export async function loadChannels(path = repoPath('config', 'channels.yaml')) {
  return readYamlFile(path);
}

export async function loadModels(path = repoPath('config', 'models.yaml')) {
  return readYamlFile(path);
}

export async function loadAgentBundle(systemId) {
  const [system, graph, tools, permissions] = await Promise.all([
    loadAgentSystem(systemId),
    loadAgentGraph(systemId),
    loadAgentTools(systemId),
    loadPermissions(),
  ]);
  return { system, graph, tools, permissions };
}

export async function loadRuntimeConfig() {
  const [routing, channels, models, permissions] = await Promise.all([
    loadRouting(),
    loadChannels(),
    loadModels(),
    loadPermissions(),
  ]);
  return { routing, channels, models, permissions };
}
