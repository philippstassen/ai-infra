const defaultBaseUrl = 'http://carshare:8080';

async function parseJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function queryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function projectPath(slug, suffix = '') {
  return `/v1/projects/${encodeURIComponent(slug)}${suffix}`;
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

  async listUsers(slug) {
    return this.request(projectPath(slug, '/users'));
  }

  async addUser(slug, user) {
    return this.request(projectPath(slug, '/users'), { method: 'POST', body: user });
  }

  async editUser(slug, userId, patch) {
    return this.request(projectPath(slug, `/users/${encodeURIComponent(userId)}`), { method: 'PATCH', body: patch });
  }

  async deleteUser(slug, userId) {
    return this.request(projectPath(slug, `/users/${encodeURIComponent(userId)}`), { method: 'DELETE' });
  }

  async createDriverInterval(slug, interval) {
    return this.request(projectPath(slug, '/driver-intervals'), { method: 'POST', body: interval });
  }

  async listDriverIntervals(slug, query = {}) {
    return this.request(projectPath(slug, `/driver-intervals${queryString(query)}`));
  }

  async editDriverInterval(slug, intervalId, patch) {
    return this.request(projectPath(slug, `/driver-intervals/${encodeURIComponent(intervalId)}`), { method: 'PATCH', body: patch });
  }

  async deleteDriverInterval(slug, intervalId) {
    return this.request(projectPath(slug, `/driver-intervals/${encodeURIComponent(intervalId)}`), { method: 'DELETE' });
  }

  async listObligations(slug, query = {}) {
    return this.request(projectPath(slug, `/obligations${queryString(query)}`));
  }

  async addObligation(slug, obligation) {
    return this.request(projectPath(slug, '/obligations'), { method: 'POST', body: obligation });
  }

  async editObligation(slug, obligationId, patch) {
    return this.request(projectPath(slug, `/obligations/${encodeURIComponent(obligationId)}`), { method: 'PATCH', body: patch });
  }

  async removeObligation(slug, obligationId) {
    return this.request(projectPath(slug, `/obligations/${encodeURIComponent(obligationId)}`), { method: 'DELETE' });
  }

  async fillObligation(slug, obligationId, fill) {
    return this.request(projectPath(slug, `/obligations/${encodeURIComponent(obligationId)}/fill`), { method: 'POST', body: fill });
  }

  async addRefill(slug, intervalId, refill) {
    return this.request(projectPath(slug, `/driver-intervals/${encodeURIComponent(intervalId)}/refills`), { method: 'POST', body: refill });
  }

  async listRefills(slug, query = {}) {
    return this.request(projectPath(slug, `/refills${queryString(query)}`));
  }

  async editRefill(slug, refillId, patch) {
    return this.request(projectPath(slug, `/refills/${encodeURIComponent(refillId)}`), { method: 'PATCH', body: patch });
  }

  async deleteRefill(slug, refillId) {
    return this.request(projectPath(slug, `/refills/${encodeURIComponent(refillId)}`), { method: 'DELETE' });
  }

  async listLedgerBookings(slug, query = {}) {
    return this.request(projectPath(slug, `/ledger-bookings${queryString(query)}`));
  }

  async createSettlement(slug, settlement = {}) {
    return this.request(projectPath(slug, '/settlements'), { method: 'POST', body: settlement });
  }

  async listSettlements(slug) {
    return this.request(projectPath(slug, '/settlements'));
  }

  async listHandoverFuelDeltas(slug, query = {}) {
    return this.request(projectPath(slug, `/handover-fuel-deltas${queryString(query)}`));
  }

  async acceptHandoverFuelDelta(slug, deltaId, body = {}) {
    return this.request(projectPath(slug, `/handover-fuel-deltas/${encodeURIComponent(deltaId)}/accept`), { method: 'POST', body });
  }

  async fillHandoverFuelDelta(slug, deltaId, body) {
    return this.request(projectPath(slug, `/handover-fuel-deltas/${encodeURIComponent(deltaId)}/fill`), { method: 'POST', body });
  }
}

export function createCarshareClient(options) {
  return new CarshareClient(options);
}
