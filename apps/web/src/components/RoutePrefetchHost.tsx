import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchRouteTarget } from "../lib/routePrefetch";

function targetHref(target: Element): string | null {
  const explicit = target.closest("[data-prefetch-route]");
  if (explicit) return explicit.getAttribute("data-prefetch-route");
  const anchor = target.closest("a[href]");
  if (!anchor) return null;
  if (anchor.hasAttribute("download")) return null;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//")) return null;
  if (!href.startsWith("/")) return null;
  return href;
}

/**
 * Lädt jede interne Seite bei Hover vor. Ein globaler Listener statt
 * einzelner Handler pro Link, damit auch neue Extension Seiten ohne
 * Zusatzcode sofort profitieren. Startet sofort bei Hover, Fokus und
 * Pointer Down, Fehler bleiben still.
 */
export function RoutePrefetchHost() {
  const client = useQueryClient();

  useEffect(() => {
    const prefetchFromEvent = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const href = targetHref(target);
      if (!href) return;
      prefetchRouteTarget(client, href);
    };
    document.addEventListener("pointerover", prefetchFromEvent, { capture: true, passive: true });
    document.addEventListener("focusin", prefetchFromEvent, { capture: true, passive: true });
    document.addEventListener("pointerdown", prefetchFromEvent, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerover", prefetchFromEvent, { capture: true });
      document.removeEventListener("focusin", prefetchFromEvent, { capture: true });
      document.removeEventListener("pointerdown", prefetchFromEvent, { capture: true });
    };
  }, [client]);

  return null;
}
