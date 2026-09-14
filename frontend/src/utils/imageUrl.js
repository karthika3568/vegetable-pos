/**
 * Turns an API-provided image reference into a full, loadable URL.
 *
 * The backend stores web-relative paths (e.g. /uploads/product-images/...) in
 * products.image_path. In dev the Vite proxy forwards /uploads to the API;
 * in production either the app is same-origin or VITE_API_BASE_URL points at
 * the API host - so the origin is always derived from the API base, never
 * hard-coded.
 */

import { getBaseUrl } from '../api/client.js';

function apiOrigin() {
  const base = getBaseUrl();
  if (/^https?:\/\//i.test(base)) {
    try {
      return new URL(base).origin;
    } catch {
      // fall through to the browser origin below
    }
  }
  return window.location.origin;
}

export function imageUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  return `${apiOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}