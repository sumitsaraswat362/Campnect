export interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

export class TelemetryReporter {
  private static buffer: PerformanceMetric[] = [];

  static record(name: string, value: number, goodThreshold: number, poorThreshold: number): void {
    const rating: PerformanceMetric['rating'] =
      value <= goodThreshold ? 'good' : value <= poorThreshold ? 'needs-improvement' : 'poor';
    const metric: PerformanceMetric = { name, value, rating, timestamp: Date.now() };
    this.buffer.push(metric);
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[Telemetry] ${name}: ${value.toFixed(2)}ms (${rating})`);
    }
  }

  static getMetrics(): PerformanceMetric[] {
    return [...this.buffer];
  }

  static clear(): void {
    this.buffer = [];
  }
}
