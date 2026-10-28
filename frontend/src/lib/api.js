/**
 * Shared API client for all dashboard modules.
 * Configure the backend URL via the VITE_API_BASE_URL environment variable.
 */

const BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

/**
 * Returns true if a backend API URL is configured (non-default).
 */
export function isApiConfigured() {
  return !!import.meta.env?.VITE_API_BASE_URL;
}

/**
 * Generic JSON request helper used by all dashboard service files.
 * @param {string} endpoint  - Path relative to BASE (e.g. '/scans')
 * @param {object} options
 * @param {string}       [options.method='GET']
 * @param {object|null}  [options.body]      - Will be JSON-serialised
 * @param {AbortSignal}  [options.signal]
 * @param {string}       [options.token]     - Bearer token (falls back to localStorage)
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiRequest(endpoint, { method = 'GET', body, signal, token, responseType = 'json' } = {}) {
  const tok = token || localStorage.getItem('ca_token');
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  const res = await fetch(`${BASE}${endpoint}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    const message = typeof payload?.error === 'string'
      ? payload.error
      : typeof payload?.message === 'string'
        ? payload.message
        : text || res.statusText;
    const error = new Error(`${message} (HTTP ${res.status})`);
    error.status = res.status;
    if (typeof payload?.code === 'string') error.code = payload.code;
    throw error;
  }

  return responseType === 'blob' ? res.blob() : res.json();
}
