import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeUserInput, isValidCampusUrl } from './securityGuards.js';

test('sanitizeUserInput strips dangerous script tags', () => {
  const malicious = 'Hello <script>alert(1)</script> campus!';
  assert.equal(sanitizeUserInput(malicious), 'Hello  campus!');
});

test('isValidCampusUrl verifies allowed academic domains', () => {
  assert.equal(isValidCampusUrl('https://iiitd.ac.in/events'), true);
  assert.equal(isValidCampusUrl('javascript:alert(1)'), false);
  assert.equal(isValidCampusUrl('https://malicious-phishing.com'), false);
});
