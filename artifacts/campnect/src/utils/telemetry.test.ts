import test from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryReporter } from './telemetry.js';

test('TelemetryReporter records and rates performance metrics', () => {
  TelemetryReporter.clear();
  TelemetryReporter.record('LCP', 1800, 2500, 4000);
  TelemetryReporter.record('INP', 450, 200, 500);

  const metrics = TelemetryReporter.getMetrics();
  assert.equal(metrics.length, 2);
  assert.equal(metrics[0].rating, 'good');
  assert.equal(metrics[1].rating, 'needs-improvement');
});
