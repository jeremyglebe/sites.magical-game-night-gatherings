import test from 'node:test';
import assert from 'node:assert/strict';
import { recordPlanUsage, planUsageView } from './usage-tracking.mjs';

const sample = (usedPercent, resetsAt = 2000000000, checkedAt = '2026-10-20T20:00:00Z') => ({
  checkedAt, buckets: [{ id: 'codex', name: 'Codex', windows: [
    { id: 'primary', usedPercent, windowDurationMins: 10080, resetsAt },
  ] }],
});
const window = record => planUsageView(record).buckets[0].windows[0];

test('account changes use observed percentages and retain the saved baseline', () => {
  const start = recordPlanUsage(null, sample(16), 54);
  const later = recordPlanUsage(JSON.parse(JSON.stringify(start)), sample(18, 2000000000, '2026-10-20T20:05:00Z'), 60);
  assert.equal(window(later).changeSinceBaseline, 2);
  assert.equal(window(later).baselineAt, start.latest.checkedAt);
  assert.equal(later.trackingStartedAfterDecisions, 54);
  assert.equal(planUsageView(later, { error: 'Offline' }).checkedAt, later.latest.checkedAt);
  assert.equal(planUsageView(later, { error: 'Offline' }).error, 'Offline');
});

test('quota resets and allowance reductions start a fresh comparison, unknown resets cannot compare', () => {
  const start = recordPlanUsage(null, sample(16));
  assert.equal(window(recordPlanUsage(start, sample(2, 2000600000))).changeSinceBaseline, 0);
  assert.equal(window(recordPlanUsage(start, sample(3))).changeSinceBaseline, 0);
  const higher = recordPlanUsage(start, sample(40));
  assert.equal(window(recordPlanUsage(higher, sample(20))).changeSinceBaseline, 0);
  assert.equal(window(recordPlanUsage(start, sample(17, null))).changeSinceBaseline, null);
  const missing = recordPlanUsage(start, { checkedAt: '2026-10-20T21:00:00Z', buckets: [] });
  assert.deepEqual(planUsageView(missing).buckets, []);
  assert.equal(window(recordPlanUsage(missing, sample(18))).changeSinceBaseline, 0);
  assert.deepEqual(planUsageView(null).buckets, []);
  assert.equal(planUsageView(null).checkedAt, null);
});
