import { useEffect, useRef, useState } from "react";
import { observeTerminalView } from "./engine/terminalViewRegistry";

export type TerminalPreviewStatus = "loading" | "ready" | "exited" | "error";

/** Liest den bereits vorgeladenen Bildschirm ohne zusätzliche xterm-Instanz,
 * WebSocket-Subscription oder Übernahme der gemeinsamen Terminalgeometrie. */
export function useTerminalPreview(runtimeId: string) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<TerminalPreviewStatus>("loading");

  useEffect(() => observeTerminalView(runtimeId, (view) => {
    if (!view) { setLines([]); setStatus("loading"); return; }
    const { terminal } = view;
    const buffer = terminal.buffer.active;
    const next = Array.from({ length: terminal.rows }, (_, index) => buffer.getLine(buffer.viewportY + index)?.translateToString(true).trimEnd() ?? "");
    setLines((current) => current.length === next.length && current.every((line, index) => line === next[index]) ? current : next);
    setStatus(view.status === "exited" ? "exited" : view.status === "error" ? "error" : view.status === "connected" ? "ready" : "loading");
  }), [runtimeId]);

  return { lines, mountRef, status };
}
