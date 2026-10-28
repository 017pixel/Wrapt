import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "../../icons";
import "./hermes-v2-toasts.css";

let users = 0;
let region: HTMLElement | null = null;

/** Alle Hermes-Flächen teilen eine Ecke außerhalb skalierter Panels. */
export function HermesV2Toast({ message, children, tone = "error", onDismiss }: {
  message: string;
  children?: ReactNode;
  tone?: "error" | "warning";
  onDismiss?: (() => void) | undefined;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!region) {
      region = document.createElement("aside");
      region.className = "hermesv2-toasts";
      region.setAttribute("aria-label", "Hermes-Meldungen");
      document.body.append(region);
    }
    users += 1;
    setHost(region);
    return () => {
      users -= 1;
      if (!users) { region?.remove(); region = null; }
    };
  }, []);
  useEffect(() => {
    if (paused || dismissed) return;
    const timer = window.setTimeout(() => setDismissed(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [paused, dismissed]);
  if (!host || dismissed) return null;
  return createPortal(
    <div className="hermesv2-toast" data-tone={tone} role={tone === "error" ? "alert" : "status"}
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}>
      <div className="hermesv2-toast-content"><p>{message}</p>{children}</div>
      <button type="button" className="hermesv2-toast-close" aria-label="Hermes-Meldung schließen"
        onClick={() => { setDismissed(true); onDismiss?.(); }}><CloseIcon className="h-4 w-4" /></button>
    </div>, host,
  );
}
