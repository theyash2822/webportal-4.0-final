// Runtime config for the web portal — aligned with mobile EXPO_PUBLIC_BACKEND_URL.
export const USE_MOCK = false;

/**
 * Environment identity, baked in at build time (`VITE_APP_ENV`).
 * Kept here so no component decides its own environment.
 */
export const APP_ENV = (import.meta.env.VITE_APP_ENV || 'development').trim().toLowerCase();

const PRODUCTION_HOST_PATTERN = /(^|\.)api\.tallydekho\.com$/i;

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * A staging build that falls back to the production URL would run QA — including
 * duplicate-GUID and destructive-migration rehearsal — against live customer
 * data. Fail the build/boot instead.
 */
export function assertEnvironmentTarget(appEnv = APP_ENV, apiUrl = BACKEND_URL, wsUrl = WS_URL) {
  if (appEnv === 'production') return;
  const offenders = [apiUrl, wsUrl].filter((u) => {
    const host = hostOf(u);
    return host && PRODUCTION_HOST_PATTERN.test(host.replace(/:\d+$/, ''));
  });
  if (offenders.length) {
    throw new Error(
      `VITE_APP_ENV=${appEnv} build is pointed at the production API (${offenders.join(', ')}). ` +
        'Set VITE_API_URL / VITE_WS_URL to this environment’s backend.'
    );
  }
}

/** Strip trailing /app from VITE_API_URL → host root (e.g. http://host:3001). */
export function backendRootFromEnv(url = import.meta.env.VITE_API_URL) {
  const raw = (url || 'http://localhost:3001/app').trim();
  return raw.replace(/\/app\/?$/, '') || raw;
}

export const BACKEND_URL = backendRootFromEnv();
export const APP_URL = `${BACKEND_URL}/app`;

// Always hit the backend host directly. Dev previously used same-origin Vite proxy
// (`API_ROOT=''`), but when Vite drops or proxy stalls, Team Access DELETE/remove
// (and other /api calls) fail with a network error while the SPA shell still looks alive.
// Backend CORS already allows the Vite origin; vite.config.js proxy remains as fallback.
export const API_ROOT = BACKEND_URL;
export const BASE_URL = APP_URL;
export const WS_URL = import.meta.env.VITE_WS_URL || BACKEND_URL;

assertEnvironmentTarget();
