// These are account-wide observations, never an attribution of cost to a match.
export function recordPlanUsage(previous, sample, decisions = 0) {
  const baselineWindows = {};
  for (const bucket of sample.buckets) {
    for (const window of bucket.windows) {
      const key = JSON.stringify([bucket.id, window.id]);
      const old = previous?.baselineWindows?.[key];
      const last = previous?.latest?.buckets?.find(item => item.id === bucket.id)?.windows?.find(item => item.id === window.id);
      const comparable = old && window.resetsAt !== null
        && old.resetsAt === window.resetsAt
        && old.windowDurationMins === window.windowDurationMins
        && window.usedPercent >= old.usedPercent
        && (!last || window.usedPercent >= last.usedPercent);
      baselineWindows[key] = comparable ? old : { ...window, checkedAt: sample.checkedAt };
    }
  }
  return {
    latest: structuredClone(sample), baselineWindows,
    trackingStartedAt: previous?.trackingStartedAt || sample.checkedAt,
    trackingStartedAfterDecisions: previous?.trackingStartedAfterDecisions ?? decisions,
  };
}

export function planUsageView(record, { error = null, refreshing = false } = {}) {
  return {
    checkedAt: record?.latest?.checkedAt || null,
    trackingStartedAt: record?.trackingStartedAt || null,
    trackingStartedAfterDecisions: record?.trackingStartedAfterDecisions ?? null,
    buckets: (record?.latest?.buckets || []).map(bucket => ({
      ...bucket, windows: bucket.windows.map(window => {
        const baseline = record.baselineWindows[JSON.stringify([bucket.id, window.id])];
        const comparable = window.resetsAt !== null && baseline?.resetsAt === window.resetsAt;
        return {
          ...window,
          changeSinceBaseline: comparable ? window.usedPercent - baseline.usedPercent : null,
          baselineAt: comparable ? baseline.checkedAt : null,
        };
      }),
    })),
    error, refreshing,
  };
}
