/**
 * A staging bundle that silently falls back to the production API would run QA
 * against live customer data. These tests pin the guard.
 */
import { describe, it, expect } from 'vitest';
import { assertEnvironmentTarget, backendRootFromEnv, hostOf } from './config';

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
