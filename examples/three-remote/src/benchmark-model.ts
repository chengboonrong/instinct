export interface Distribution {
  readonly samples: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}
export function summarize(samples: readonly number[]): Distribution {
  if (!samples.length) {
    return {samples: 0, averageMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0};
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;
  const round = (value: number) => Number(value.toFixed(3));
  return {
    samples: samples.length,
    averageMs: round(samples.reduce((total, value) => total + value, 0) / samples.length),
    p50Ms: round(percentile(.5)),
    p95Ms: round(percentile(.95)),
    p99Ms: round(percentile(.99)),
    maxMs: round(sorted[sorted.length - 1]!),
  };
}
