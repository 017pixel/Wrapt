import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { CodePluginClientRuntime, pluginRequest, type CodeClientRelease } from "./code-client";

export function CodePluginSync({ onReady }: { onReady?(): void }) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    let stopped = false;
    let running: Promise<void> = Promise.resolve();
    let refreshing = false;
    let pending = false;
    const runtime = new CodePluginClientRuntime((path) => navigateRef.current(path), (message) => window.dispatchEvent(new CustomEvent("wrapt:plugin-notification", { detail: message })));
    const refresh = () => {
      pending = true;
      if (refreshing || stopped) return;
      refreshing = true;
      running = (async () => {
        while (pending && !stopped) {
          pending = false;
          try {
            const response = await pluginRequest<{ plugins: CodeClientRelease[] }>("runtime/code", undefined, "GET");
            if (!stopped) await runtime.sync(response.plugins);
          } catch {
            // Die zuletzt geladene Plugin-Oberfläche bleibt bis zur Erholung erhalten.
          } finally { if (!stopped) onReady?.(); }
        }
      })().finally(() => { refreshing = false; });
    };
    const events = new EventSource("/api/v1/plugins/events");
    events.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as { name: string; data: unknown };
        if (event.name === "host:plugins.changed") refresh();
        runtime.deliver(event);
      } catch { /* Ein ungültiger Frame verwirft nur sich selbst. */ }
    };
    events.onopen = refresh;
    refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = setInterval(onVisible, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); events.close(); void running.finally(() => runtime.close()).catch(() => undefined); };
  }, [onReady]);
  return null;
}
