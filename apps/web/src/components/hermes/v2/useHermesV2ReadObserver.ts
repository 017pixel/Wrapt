import { useEffect, useRef, type RefObject } from "react";
import type { ReadGeneration } from "./sidebar-types";

export interface HermesV2ReadObserverOptions {
  containerRef: RefObject<HTMLElement | null>;
  /** Nur der aktive, sichtbare Chat bestätigt Belege. */
  active: boolean;
  generation: ReadGeneration | null;
  sessionId: string | null;
  onVisibleEvidence: (
    generation: ReadGeneration,
    handles: readonly string[],
  ) => Promise<void>;
}

/**
 * Meldet Belege tatsächlich dargestellter, vollständiger Assistant-,
 * Fehler- und Notice-Rows an den Read-Weg. Beobachtet wird ein kleiner
 * Endmarker je Row, damit auch mehrfach viewporthohe Antworten nach
 * sichtbarem Lesen bestätigbar bleiben. Nie beim Empfang, in der
 * Sidebar, in Baseline/Inflight-Fragmenten, geparkten Routen oder
 * versteckten Tabs. Beobachter werden bei Session-, Generations- und
 * Sichtbarkeitswechsel vollständig aufgeräumt; alte Observer lesen keine
 * neue Auswahl. Der Callback wird stabil über einen Ref gehalten.
 */
export function useHermesV2ReadObserver({
  containerRef,
  active,
  generation,
  sessionId,
  onVisibleEvidence,
}: HermesV2ReadObserverOptions): void {
  const callbackRef = useRef(onVisibleEvidence);
  useEffect(() => {
    callbackRef.current = onVisibleEvidence;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !active || !generation || !sessionId) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (document.visibilityState === "hidden") return;

    const sent = new Set<string>();
    const observed = new WeakSet<Element>();
    let pending = new Set<string>();
    let flushTimer: number | null = null;
    let disposed = false;
    const capturedGeneration = generation;

    const intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const handle = (entry.target as HTMLElement).dataset.readEvidence;
          intersection?.unobserve(entry.target);
          if (handle && !sent.has(handle)) {
            sent.add(handle);
            pending.add(handle);
          }
        }
        if (pending.size > 0 && flushTimer === null) {
          flushTimer = window.setTimeout(() => {
            flushTimer = null;
            const handles = Array.from(pending);
            pending = new Set();
            if (disposed || sent.size === 0) return;
            void callbackRef.current(capturedGeneration, handles);
          }, 0);
        }
      },
      { threshold: 0 },
    );

    const observe = (element: HTMLElement) => {
      if (observed.has(element) || !element.dataset.readEvidence) return;
      observed.add(element);
      intersection.observe(element);
    };

    const scan = (root: ParentNode) => {
      if (root instanceof HTMLElement && root.dataset.readEvidence) {
        observe(root);
      }
      for (const element of root.querySelectorAll<HTMLElement>(
        "[data-read-evidence]",
      )) {
        observe(element);
      }
    };

    scan(container);
    // Nur neu eingefuehrte Teilbaue werden geprueft. Ein vollstaendiger
    // Durchlauf ueber den ganzen Verlauf bei jeder Aenderung war mit
    // Hunderten Zeilen der teuerste Posten im Stream.
    const mutations = new MutationObserver((records) => {
      if (disposed) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) scan(node);
        }
      }
    });
    mutations.observe(container, { childList: true, subtree: true });
    const onVisibility = () => {
      // Versteckte Tabs bestätigen nichts; beim Wiedererscheiden wird der
      // Beobachter über den aktiven Effekt ohnehin neu aufgebaut.
      if (document.visibilityState === "hidden") {
        pending = new Set();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      intersection.disconnect();
      mutations.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [containerRef, active, generation, sessionId]);
}
