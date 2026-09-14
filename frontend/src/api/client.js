/**
 * Centralized HTTP client for the backend REST API.
 *
 * Responsibilities:
 *   - single base URL (from VITE_API_BASE_URL, with a sensible dev default)
 *   - authentication header injection from the in-memory token
 *   - URL/query building and JSON body serialization
 *   - standard error normalization ({ success, message, data, meta } envelope)
 *   - global 401 / 403 handling
 *   - no raw fetch calls anywhere else in the app
 */

export const DEFAULT_API_BASE_URL = '/api/v1';

export function getBaseUrl() {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  return String(fromEnv || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

export class ApiError extends Error {
  constructor(message, { status = 0, statusText = '', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.details = details;
  }
}

let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

export function getAuthToken() {
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
}

function buildUrl(path, params) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let url = `${getBaseUrl()}${normalizedPath}`;

  if (params && typeof params === 'object') {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        search.set(key, value);
      }
    });
    const qs = search.toString();
    if (qs) url += `${url.includes('?') ? '&' : '?'}${qs}`;
  }

  return url;
}

function messageFromPayload(payload, fallback) {
  if (payload && typeof payload === 'object') {
    if (typeof payload.message === 'string' && payload.message) return payload.message;
    if (Array.isArray(payload.details) && payload.details.length > 0) {
      const first = payload.details[0];
      if (first && typeof first === 'object') {
        if (first.msg) return String(first.msg);
        if (first.message) return String(first.message);
      }
    }
  }
  return fallback;
}

async function request(path, { method = 'GET', body, params, signal, multipart = false } = {}) {
  const isMultipart = multipart || (typeof FormData !== 'undefined' && body instanceof FormData);
  const headers = { Accept: 'application/json' };
  if (body !== undefined && !isMultipart) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      credentials: 'include',
      // multipart uploads pass a FormData body directly (fetch adds the
      // boundary + content-type itself); everything else is JSON.
      body: body !== undefined ? (isMultipart ? body : JSON.stringify(body)) : undefined,
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError('Unable to reach the server. Check that the backend is running.', { status: 0 });
  }

  const contentType = response.headers.get('content-type') || '';
  let payload = null;
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (response.status === 401) {
    if (authToken) {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    throw new ApiError(
      messageFromPayload(payload, 'Your session has expired. Please log in again.'),
      { status: 401, statusText: response.statusText, details: payload?.details || null }
    );
  }

  if (response.status === 403) {
    throw new ApiError(
      messageFromPayload(payload, 'You do not have permission to perform this action.'),
      { status: 403, statusText: response.statusText, details: payload?.details || null }
    );
  }

  if (!response.ok) {
    throw new ApiError(
      messageFromPayload(payload, `Request failed with status ${response.status}.`),
      { status: response.status, statusText: response.statusText, details: payload?.details || null }
    );
  }

  if (payload && payload.success === false) {
    throw new ApiError(
      messageFromPayload(payload, 'Request failed.'),
      { status: response.status, statusText: response.statusText, details: payload.details || null }
    );
  }

  return payload;
}

const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  del: (path, options) => request(path, { ...options, method: 'DELETE' }),
  // multipart/form-data upload; body must be a FormData instance.
  upload: (path, formData, options) => request(path, { ...options, method: 'PUT', body: formData, multipart: true }),
};

export { api };