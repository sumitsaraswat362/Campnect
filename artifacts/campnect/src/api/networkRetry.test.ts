import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry } from './networkRetry.js';

test('fetchWithRetry returns valid response on first try', async () => {
  const fakeFetch = async () => new Response('ok', { status: 200 });
  // @ts-ignore
  globalThis.fetch = fakeFetch;
  const res = await fetchWithRetry('https://example.com');
  assert.equal(res.status, 200);
});
