const defaultBaseUrl = 'http://carshare:8080';

async function parseJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export class CarshareClient {
  constructor({ baseUrl = process.env.CARSHARE_API_BASE_URL ?? process.env.CARSHARE_BASE_URL ?? defaultBaseUrl, fetchImpl = fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async request(path, { method = 'GET', body } = {}) {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await parseJson(response);
    if (!response.ok) throw new Error(payload.error ?? `carshare http ${response.status}`);
    return payload;
  }

  async health() {
    return this.request('/health');
  }

  async ensureProject(project) {
    return this.request('/v1/projects/ensure', { method: 'POST', body: project });
  }

  async recordHandover(slug, event) {
    return this.request(`/v1/projects/${encodeURIComponent(slug)}/handover`, { method: 'POST', body: event });
  }

  async recordRefill(slug, event) {
    return this.request(`/v1/projects/${encodeURIComponent(slug)}/refill`, { method: 'POST', body: event });
  }

  async events(slug, limit = 20) {
    return this.request(`/v1/projects/${encodeURIComponent(slug)}/events?limit=${encodeURIComponent(limit)}`);
  }

  async summary(slug) {
    return this.request(`/v1/projects/${encodeURIComponent(slug)}/summary`);
  }
}

export function createCarshareClient(options) {
  return new CarshareClient(options);
}
