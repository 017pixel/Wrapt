import { useLayoutEffect, useRef } from "react";

/** Nur der DOM-Container wechselt den Platz. React und xterm behalten dabei
 * Scrollback, Auswahl und bereits eingereihte Write-Callbacks. */
export function TerminalPaneSlot({ host, parked = false }: { host: HTMLElement; parked?: boolean }) {
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = slot.current;
    if (!element) return;
    element.appendChild(host);
    return () => { if (host.parentNode === element) host.remove(); };
  }, [host]);
  return <div ref={slot} className={`terminal-pane-slot${parked ? " is-parked" : ""}`} inert={parked} />;
}
