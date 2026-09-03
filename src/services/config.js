// Runtime config for the web portal — aligned with mobile EXPO_PUBLIC_BACKEND_URL.
export const USE_MOCK = false;

/** Strip trailing /app from VITE_API_URL → host root (e.g. http://host:3001). */
export function backendRootFromEnv(url = import.meta.env.VITE_API_URL) {
  const raw = (url || 'http://localhost:3001/app').trim();
  return raw.replace(/\/app\/?$/, '') || raw;
}

export const BACKEND_URL = backendRootFromEnv();
export const APP_URL = `${BACKEND_URL}/app`;

// Vite dev: same-origin `/api/*` is proxied to BACKEND_URL (see vite.config.js).
export const API_ROOT = import.meta.env.DEV ? '' : BACKEND_URL;
export const BASE_URL = import.meta.env.DEV ? '/app' : APP_URL;
export const WS_URL = import.meta.env.VITE_WS_URL || BACKEND_URL;
