import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { useLayoutStore } from "../../../stores/layout";
import { hermesSessionPath, type HermesShellProps } from "../HermesClassicShell";
import { hermesSessionFromHostPath } from "../hermes-host-path";
import { useHermesPathCallback } from "../useHermesPathCallback";

/** Zuletzt geöffneter Chat der Route; bleibt beim Werkzeugwechsel erhalten. */
const ROUTE_SESSION_KEY = "wrapt.hermes-v2.last-session";

function readStoredRouteSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(ROUTE_SESSION_KEY);
    return value && value.length <= 200 ? value : null;
  } catch {
    return null;
  }
}

function storeRouteSession(sessionId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionId) window.sessionStorage.setItem(ROUTE_SESSION_KEY, sessionId);
    else window.sessionStorage.removeItem(ROUTE_SESSION_KEY);
  } catch {
    // Ohne Speicher gilt weiterhin nur die aktuelle URL.
  }
}

/**
 * Auswahl der eigenen Oberfläche. Route/Standalone nutzen `?session=` und
 * schreiben nur bei Aktivität; Panels führen ihre Auswahl im Layoutpfad.
 * Geparkte Routen sehen die URL der gerade aktiven Seite und dürfen ihre
 * eigene Auswahl dadurch nicht verlieren. Kehrt die Route ohne Sitzung zurück,
 * wird der zuletzt geöffnete Chat wiederhergestellt; ein bewusst geleerter
 * Chat löscht den gemerkten Wert.
 */
export function useHermesV2Selection(
  variant: HermesShellProps["variant"],
  panelId: string | undefined,
  panelAdminPath: string | undefined,
  frameActive: boolean,
  onHermesPathChange?: (path: string) => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeSession = searchParams.get("session");
  const panelSession = useMemo(() => {
    return hermesSessionFromHostPath(panelAdminPath);
  }, [panelAdminPath]);
  const storedRouteSession = useRef<string | null>(
    variant === "route" ? readStoredRouteSession() : null,
  );
  const lastRouteSession = useRef<string | null>(routeSession);
  if (variant === "route") {
    if (frameActive && routeSession !== null) {
      lastRouteSession.current = routeSession;
      storedRouteSession.current = routeSession;
    } else if (!frameActive && lastRouteSession.current === null) {
      lastRouteSession.current = storedRouteSession.current;
    }
  }
  const rememberedRouteSession =
    lastRouteSession.current ?? storedRouteSession.current;
  useEffect(() => {
    if (variant === "route" && frameActive && routeSession !== null)
      storeRouteSession(routeSession);
  }, [variant, frameActive, routeSession]);
  const sessionId =
    variant === "route"
      ? frameActive
        ? (routeSession ?? rememberedRouteSession)
        : rememberedRouteSession
      : (panelSession ?? null);
  const updateHermesPanel = useLayoutStore((state) => state.updateHermesPanel);
  const commitPath = useCallback(
    (path: string) => {
      const next = hermesSessionFromHostPath(path);
      if (variant === "route") {
        setSearchParams((current) => {
          const params = new URLSearchParams(current);
          if (next === null) params.delete("session");
          else params.set("session", next);
          return params;
        });
        return;
      }
      if (onHermesPathChange) onHermesPathChange(path);
      else if (panelId) {
        updateHermesPanel(panelId, {
          hermesAdminPath: path,
        });
      }
    },
    [variant, panelId, setSearchParams, updateHermesPanel, onHermesPathChange],
  );
  const selectPath = useHermesPathCallback(`${variant}:${panelId ?? ""}`, frameActive,
    variant === "route" ? routeSession : panelAdminPath, commitPath);
  // Die Wiederherstellung ersetzt den leeren Eintrag, statt einen zweiten zu
  // pushen. Sonst führt die Zurück-Taste erneut auf die leere Hermes-Route.
  const replaceRouteSession = useCallback(
    (sessionId: string) => {
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.set("session", sessionId);
        return params;
      }, { replace: true });
    },
    [setSearchParams],
  );
  // Kehrt die Route ohne Sitzungsparameter zurück, wird der zuletzt geöffnete
  // Chat wieder eingehängt und die Adresse entsprechend ergänzt. Ein bewusst
  // geleerter Chat löscht den gespeicherten Wert über selectSession(null).
  const restoredRouteSession =
    variant === "route" && frameActive && routeSession === null
      ? rememberedRouteSession
      : null;
  useEffect(() => {
    if (!restoredRouteSession) return;
    replaceRouteSession(restoredRouteSession);
  }, [restoredRouteSession, replaceRouteSession]);
  const selectSession = useCallback(
    (next: string | null) => {
      if (variant === "route") {
        lastRouteSession.current = next;
        storedRouteSession.current = next;
        storeRouteSession(next);
      }
      selectPath(next === null ? "/chat" : hermesSessionPath(next));
    },
    [selectPath, variant],
  );
  return { sessionId, selectSession };
}
