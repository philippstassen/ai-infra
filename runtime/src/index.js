import http from 'node:http';
import { handleMessage } from './orchestrator/runtime.js';
import { startTelegramPolling } from './channels/telegram.js';

const port = Number(process.env.PORT ?? 3000);

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export function createServer() {
  return http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.method === 'POST' && request.url === '/messages') {
      const body = JSON.parse(await readBody(request) || '{}');
      const result = await handleMessage(body);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
  });
}

export async function main() {
  const telegram = await startTelegramPolling();
  const server = createServer();
  server.listen(port);
  const stop = () => {
    telegram.stop();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
