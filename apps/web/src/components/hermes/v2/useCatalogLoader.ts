// UI-Hook: begrenztes Katalogladen für die aktive Fläche; keine Pollschleife.
import { useEffect, useRef, useState } from "react";
import type { ChatSessionView, HermesV2Chat } from "./chat-types";

/**
 * Ein Read pro beobachtetem Session-/Epoch-/Onlinestand, synchron vor await
 * vermerkt, damit Renderflackern keine Tripletts auslöst. Geparkte oder
 * verdeckte Flächen lesen nicht; bewusste Aktualisierung bleibt Nutzeraktion
 * (Katalogaktualisieren-Button). Der Merker behält nur den letzten Kontext.
 */
export function useCatalogLoader(
  chat: HermesV2Chat,
  snapshot: ChatSessionView | null,
  active: boolean,
): void {
  const lastKeyRef = useRef<string | null>(null);
  const [visibilityTick, setVisibilityTick] = useState(0);
  useEffect(() => {
    const onVisibilityChange = () => setVisibilityTick((tick) => tick + 1);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);
  // Snapshot schrumpft zusammen: loading/error/Data aus dem echten Katalog.
  const catalog = snapshot?.catalog;
  const composerAvailable = chat.composer.available;
  const online = chat.connection.state === "online";
  const configured = catalog !== undefined;
  useEffect(() => {
    if (!configured || !catalog) return;
    const sessionId = snapshot?.sessionId ?? null;
    const epoch = snapshot?.epoch ?? null;
    if (!sessionId || !epoch) {
      lastKeyRef.current = null;
      return;
    }
    const visible = typeof document === "undefined" || !document.hidden;
    if (!active || !online || !visible || !composerAvailable) return;
    if (catalog.loading === true || catalog.error) return;
    const ready = catalog.commands.length > 0 || catalog.models !== null;
    if (ready) {
      lastKeyRef.current = null; // Fertig geladen; ein späterer Kontextwechsel liest neu.
      return;
    }
    const key = `${sessionId}@${epoch}|${online ? "1" : "0"}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    void chat.readCatalog();
  }, [
    active,
    snapshot,
    online,
    chat,
    composerAvailable,
    visibilityTick,
    catalog,
    configured,
  ]);
}
