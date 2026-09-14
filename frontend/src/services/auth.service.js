import { api, setAuthToken, getAuthToken, clearAuthToken } from '../api/client.js';

const STORAGE_KEY = 'pos.accessToken';

function readStoredToken() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token) {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures; the in-memory token still works for the tab.
  }
}

// Restore the token into the API client on first import so requests are
// authenticated even if this module is loaded before the AuthProvider runs.
if (!getAuthToken()) {
  const stored = readStoredToken();
  if (stored) setAuthToken(stored);
}

export const authService = {
  async login(credentials) {
    const payload = await api.post('/auth/login', credentials);
    const data = payload?.data ?? null;
    if (!data || !data.token || !data.user) {
      throw new Error('Login response did not include a token or user profile.');
    }
    setAuthToken(data.token);
    writeStoredToken(data.token);
    return data;
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      clearAuthToken();
      writeStoredToken(null);
    }
  },

  async me() {
    const payload = await api.get('/auth/me');
    return payload?.data ?? null;
  },

  hasToken() {
    return Boolean(getAuthToken() || readStoredToken());
  },

  clearSession() {
    clearAuthToken();
    writeStoredToken(null);
  },
};