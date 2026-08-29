export interface PushDeliverySummary {
  attempted: number;
  sent: number;
  removed: number;
  failed: number;
}

export class PushDeliveryMetrics {
  private active = 0;
  private deliveries = 0;
  private attempted = 0;
  private sent = 0;
  private removed = 0;
  private failed = 0;
  private timeouts = 0;
  private readonly durations: number[] = [];

  start(): void { this.active += 1; }
  finish(): void { this.active = Math.max(0, this.active - 1); }
  timeout(): void { this.timeouts += 1; }

  record(summary: PushDeliverySummary, startedAt: bigint): void {
    this.deliveries += 1;
    this.attempted += summary.attempted;
    this.sent += summary.sent;
    this.removed += summary.removed;
    this.failed += summary.failed;
    this.durations.push(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
    if (this.durations.length > 256) this.durations.shift();
  }

  snapshot() {
    const sorted = [...this.durations].sort((left, right) => left - right);
    const p95Milliseconds = sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
    return {
      activeDeliveries: this.active,
      totalDeliveries: this.deliveries,
      totalAttempted: this.attempted,
      totalSent: this.sent,
      totalRemoved: this.removed,
      totalFailed: this.failed,
      totalTimeouts: this.timeouts,
      p95Milliseconds,
    };
  }
}
