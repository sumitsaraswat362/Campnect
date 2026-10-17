import test from 'node:test';
import assert from 'node:assert/strict';
import { getOptimizedImageUrl, generateSrcSet } from './imageOptimizer.js';

test('getOptimizedImageUrl handles local or data URLs without modification', () => {
  assert.equal(getOptimizedImageUrl('data:image/png;base64,...'), 'data:image/png;base64,...');
  assert.equal(getOptimizedImageUrl('/demo/avatar-0.svg'), '/demo/avatar-0.svg');
});

test('generateSrcSet outputs multi-density src string', () => {
  const result = generateSrcSet('/test.jpg', [300, 600]);
  assert.equal(result, '/test.jpg 300w, /test.jpg 600w');
});
