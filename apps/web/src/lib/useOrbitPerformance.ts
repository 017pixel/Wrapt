import { useEffect, useState } from "react";

export interface OrbitPerformanceSample {
  fps: number | null;
  longTaskMilliseconds: number | null;
}

const UNAVAILABLE_SAMPLE: OrbitPerformanceSample = {
  fps: null,
  longTaskMilliseconds: null,
};

/** Startet Diagnosearbeit nur solange das Orbit-Infofenster geöffnet ist. */
export function useOrbitPerformance(enabled: boolean): OrbitPerformanceSample {
  const [sample, setSample] = useState(UNAVAILABLE_SAMPLE);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let frames = 0;
    let intervalStart = performance.now();
    let longTaskMilliseconds = 0;
    const supportsLongTasks = typeof PerformanceObserver !== "undefined"
      && PerformanceObserver.supportedEntryTypes?.includes("longtask") === true;
    let observer: PerformanceObserver | null = null;
    if (supportsLongTasks) {
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTaskMilliseconds += entry.duration;
        });
        observer.observe({ type: "longtask", buffered: false });
      } catch {
        observer?.disconnect();
        observer = null;
      }
    }

    const measure = (now: number) => {
      frames += 1;
      const elapsed = now - intervalStart;
      if (elapsed >= 1_000) {
        setSample({
          fps: Math.round((frames * 1_000) / elapsed),
          longTaskMilliseconds: observer ? Math.round(longTaskMilliseconds) : null,
        });
        frames = 0;
        intervalStart = now;
        longTaskMilliseconds = 0;
      }
      frame = window.requestAnimationFrame(measure);
    };

    setSample(UNAVAILABLE_SAMPLE);
    frame = window.requestAnimationFrame(measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [enabled]);

  return sample;
}
