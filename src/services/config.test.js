/**
 * A staging bundle that silently falls back to the production API would run QA
 * against live customer data. These tests pin the guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEnvironmentTarget, backendRootFromEnv, hostOf } from './config';

const SRC_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Every .js/.jsx under src, so a new file cannot quietly reintroduce /app. */
function sourceFiles(dir = SRC_DIR) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const PROD_API = 'https://api.tallydekho.com/app';
const PROD_WS = 'wss://api.tallydekho.com';
const STAGING_API = 'https://staging-api.tallydekho.com/app';
const STAGING_WS = 'wss://staging-api.tallydekho.com';

describe('backend root resolution', () => {
  it('strips the /app suffix so /api and /app share one host', () => {
    expect(backendRootFromEnv('https://staging-api.tallydekho.com/app')).toBe(
      'https://staging-api.tallydekho.com'
    );
    expect(backendRootFromEnv('https://staging-api.tallydekho.com/app/')).toBe(
      'https://staging-api.tallydekho.com'
    );
    expect(backendRootFromEnv('http://localhost:3001')).toBe('http://localhost:3001');
  });

  it('falls back to a local host, never to production', () => {
    // With no env value at all the default is loopback; whatever the local
    // developer env supplies, it must never resolve to the production API.
    expect(hostOf(backendRootFromEnv(''))).toBe('localhost:3001');
    expect(hostOf(backendRootFromEnv())).not.toBe('api.tallydekho.com');
  });
});

describe('no accidental production calls', () => {
  it('rejects a staging build pointed at the production API', () => {
    expect(() => assertEnvironmentTarget('staging', PROD_API, STAGING_WS)).toThrow(
      /pointed at the production API/
    );
  });

  it('rejects a staging build whose websocket points at production', () => {
    expect(() => assertEnvironmentTarget('staging', STAGING_API, PROD_WS)).toThrow(
      /pointed at the production API/
    );
  });

  it('accepts a staging build pointed at staging', () => {
    expect(() => assertEnvironmentTarget('staging', STAGING_API, STAGING_WS)).not.toThrow();
  });

  it('accepts local development', () => {
    expect(() =>
      assertEnvironmentTarget('development', 'http://localhost:3001', 'http://localhost:3001')
    ).not.toThrow();
  });

  it('allows the production build to use production', () => {
    expect(() => assertEnvironmentTarget('production', PROD_API, PROD_WS)).not.toThrow();
  });

  it('is not fooled by a port suffix on the production host', () => {
    expect(() =>
      assertEnvironmentTarget('staging', 'https://api.tallydekho.com:443/app', STAGING_WS)
    ).toThrow();
  });
});

describe('the legacy /app auth surface is not used', () => {
  // RBAC Deployment B deletes the /app compatibility routes. Anything still
  // calling them breaks at that moment, and the seven-day observation window
  // cannot go clean while a supported client keeps the surface warm.
  it('config exports no /app base for callers to reach for', () => {
    const config = readFileSync(path.join(SRC_DIR, 'services', 'config.js'), 'utf8');
    expect(config).not.toMatch(/export const APP_URL/);
    expect(config).not.toMatch(/export const BASE_URL/);
    // backendRootFromEnv still strips a trailing /app, because VITE_API_URL is
    // configured that way in existing deployments. That is parsing, not calling.
    expect(config).toMatch(/backendRootFromEnv/);
  });

  it('no source file builds a request against /app', () => {
    const offenders = [];
    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8');
      // A template literal or string that targets the legacy router.
      if (/\$\{[A-Za-z_]*(APP_URL|BASE_URL)\}/.test(src) || /['"`]\/app\//.test(src)) {
        offenders.push(path.relative(SRC_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
