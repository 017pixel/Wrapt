export interface BrowserCaptureOptions {
  captureMaxWidth: number;
  captureMaxHeight: number;
  captureMaxScale: number;
  captureJpegQuality: number;
  captureEveryNthFrame: number;
}

export function browserCaptureMetrics(width: number, height: number, options: BrowserCaptureOptions) {
  const logicalWidth = Math.max(320, Math.min(2_400, Math.round(width)));
  const logicalHeight = Math.max(220, Math.min(1_600, Math.round(height)));
  const scale = Math.max(1, Math.min(options.captureMaxScale, options.captureMaxWidth / logicalWidth, options.captureMaxHeight / logicalHeight));
  return {
    width: logicalWidth,
    height: logicalHeight,
    scale,
    captureWidth: Math.round(logicalWidth * scale),
    captureHeight: Math.round(logicalHeight * scale),
  };
}

export function browserCaptureQuality(metrics: ReturnType<typeof browserCaptureMetrics>, options: BrowserCaptureOptions) {
  const pixelCount = metrics.captureWidth * metrics.captureHeight;
  const baseQuality = options.captureJpegQuality;
  return pixelCount > 1_000_000 ? Math.max(40, baseQuality - 30) : pixelCount > 500_000 ? Math.max(50, baseQuality - 15) : baseQuality;
}
