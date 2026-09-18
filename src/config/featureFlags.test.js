import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS, flag } from '../config/featureFlags.js';

describe('featureFlags smoke', () => {
  it('workspace_model_enabled is true', () => {
    expect(FEATURE_FLAGS.workspace_model_enabled).toBe(true);
    expect(flag('workspace_model_enabled')).toBe(true);
  });
});
