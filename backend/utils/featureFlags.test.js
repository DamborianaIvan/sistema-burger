import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeatureFlag } from './featureFlags.js';

test('los módulos heredados requieren habilitación explícita', () => {
  assert.equal(parseFeatureFlag(), false);
  assert.equal(parseFeatureFlag('false'), false);
  assert.equal(parseFeatureFlag(' TRUE '), true);
  for (const value of ['', '0', '1', 'yes', 'tru']) {
    assert.throws(() => parseFeatureFlag(value), /ENABLE_PREPIZZAS/);
  }
});
