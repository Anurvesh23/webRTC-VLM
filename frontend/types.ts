
export interface DetectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
  classId: number;
}

export interface Metrics {
  latencies: number[];
  frameCount: number;
  isBenchmarking: boolean;
  startTime: number;
}
