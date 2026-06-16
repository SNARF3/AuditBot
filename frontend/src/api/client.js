// All requests go through Vite proxy → avoids CORS + browser shield issues
const BASE = '/backend'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `HTTP ${res.status}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res
}

export const api = {
  // Setup
  getSetupStatus: () => request('/setup/status'),
  saveConfig: (data) => request('/setup/config', { method: 'POST', body: JSON.stringify(data) }),
  testGemini: (api_key) => request('/setup/test-gemini', { method: 'POST', body: JSON.stringify({ api_key }) }),

  // Entities
  listEntities: () => request('/entities'),
  createEntity: (data) => request('/entities', { method: 'POST', body: JSON.stringify(data) }),
  getEntity: (id) => request(`/entities/${id}`),
  updateEntity: (id, data) => request(`/entities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEntity: (id) => request(`/entities/${id}`, { method: 'DELETE' }),

  // Documents
  listDocuments: (entityId) => request(`/entities/${entityId}/documents`),
  uploadDocument: (entityId, formData) =>
    fetch(`${BASE}/entities/${entityId}/documents`, { method: 'POST', body: formData }).then(r => r.json()),
  deleteDocument: (entityId, docId) => request(`/entities/${entityId}/documents/${docId}`, { method: 'DELETE' }),
  reprocessDocument: (entityId, docId) => request(`/entities/${entityId}/documents/${docId}/reprocess`, { method: 'POST' }),

  // Coverage
  getCoverage: (entityId) => request(`/entities/${entityId}/coverage`),
  recalcCoverage: (entityId) => request(`/entities/${entityId}/coverage/recalc`, { method: 'POST' }),
  getProcessFragments: (entityId, processId) => request(`/entities/${entityId}/coverage/${processId}/fragments`),
  getProcessFindings: (entityId, processId) => request(`/entities/${entityId}/coverage/${processId}/findings`),

  // Analysis
  analyzeProcess: (entityId, processId) => request(`/entities/${entityId}/coverage/${processId}/analyze`, { method: 'POST' }),

  // Findings
  listFindings: (entityId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/entities/${entityId}/findings${qs ? '?' + qs : ''}`)
  },
  createFinding: (entityId, data) => request(`/entities/${entityId}/findings`, { method: 'POST', body: JSON.stringify(data) }),
  updateFinding: (entityId, id, data) => request(`/entities/${entityId}/findings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  draftFinding: (entityId, id) => request(`/entities/${entityId}/findings/${id}/draft`, { method: 'POST' }),
  deleteFinding: (entityId, id) => request(`/entities/${entityId}/findings/${id}`, { method: 'DELETE' }),

  // Traceability
  getTraceability: (entityId) => request(`/entities/${entityId}/traceability`),
  prioritizeGaps: (entityId) => request(`/entities/${entityId}/traceability/prioritize`, { method: 'POST' }),

  // Report
  getReportPreview: (entityId) => request(`/entities/${entityId}/report/preview`),
  generateReport: (entityId, format = 'pdf') =>
    fetch(`${BASE}/entities/${entityId}/report/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format }),
    }),

  // Copilot
  chat: (entityId, message, history) =>
    request(`/entities/${entityId}/copilot/chat`, { method: 'POST', body: JSON.stringify({ message, history }) }),
  explainProcess: (entityId, processId) =>
    request(`/entities/${entityId}/copilot/explain/${processId}`, { method: 'POST' }),

  // Inconsistencies
  listInconsistencies: (entityId) => request(`/entities/${entityId}/inconsistencies`),
  scanInconsistencies: (entityId, method = 'engine') => request(`/entities/${entityId}/inconsistencies/scan?method=${method}`, { method: 'POST' }),
  scanDocument: (entityId, docId, method = 'engine') => request(`/entities/${entityId}/inconsistencies/scan-document/${docId}?method=${method}`, { method: 'POST' }),
  analyzeDocumentInconsistencies: (entityId, docId) => request(`/entities/${entityId}/documents/${docId}/analyze-inconsistencies`, { method: 'POST' }),
  analyzeInconsistency: (entityId, incId) => request(`/entities/${entityId}/inconsistencies/${incId}/analyze`, { method: 'POST' }),
  promoteInconsistency: (entityId, incId) => request(`/entities/${entityId}/inconsistencies/${incId}/promote`, { method: 'POST' }),
  dismissInconsistency: (entityId, incId) => request(`/entities/${entityId}/inconsistencies/${incId}`, { method: 'PUT', body: JSON.stringify({ status: 'dismissed' }) }),
  deleteInconsistency: (entityId, incId) => request(`/entities/${entityId}/inconsistencies/${incId}`, { method: 'DELETE' }),

  // Gemini usage
  getGeminiUsage: () => request('/gemini/usage'),
}

export function createWebSocket(entityId) {
  const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return new WebSocket(`${wsProto}://${window.location.host}/backend/ws/${entityId}`)
}
