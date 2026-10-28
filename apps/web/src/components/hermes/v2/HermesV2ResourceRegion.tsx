import { useCallback, useEffect, useRef, useState } from "react";
import type { ResourceArea } from "./resource-types";
import { useHermesV2Resources } from "./useHermesV2Resources";
import { HermesV2CronArea } from "./HermesV2CronArea";
import { HermesV2SkillsArea } from "./HermesV2SkillsArea";
import { HermesV2MemoryArea } from "./HermesV2MemoryArea";
import { HermesV2DiagnosticsArea } from "./HermesV2DiagnosticsArea";
import { HermesV2SessionDeleteSheet } from "./HermesV2SessionDeleteSheet";
import "./hermes-v2-resources.css";

/**
 * Abortsignal einer Owner-Lebenszeit. StrictMode-sicher: der Doppellauf der
 * Effekte bricht das Signal der alten Generation ab und der früh abgebrochene
 * Mount erzwingt eine frische Generation, statt auf zufällige Gatewayevents
 * zu warten. Ownerwechsel erzeugt ebenfalls eine neue Generation.
 */
function useResourceSignal(ownerId: string): AbortSignal {
  const [epoch, setEpoch] = useState<{ owner: string; controller: AbortController }>(
    () => ({ owner: ownerId, controller: new AbortController() }),
  );
  const ensureFresh = useCallback(() => {
    setEpoch((current) =>
      current.controller.signal.aborted
        ? { owner: current.owner, controller: new AbortController() }
        : current,
    );
  }, []);
  const ensureFreshRef = useRef(ensureFresh);
  ensureFreshRef.current = ensureFresh;
  useEffect(() => {
    // StrictMode-Remontage: das abgebrochene Signal wird ersetzt, ein echter
    // Unmount rendert danach nichts mehr.
    if (epoch.controller.signal.aborted) ensureFreshRef.current();
  }, [epoch]);
  useEffect(() => () => epoch.controller.abort(), [epoch]);
  if (epoch.owner !== ownerId) {
    epoch.controller.abort();
    const next = { owner: ownerId, controller: new AbortController() };
    setEpoch(next);
    return next.controller.signal;
  }
  return epoch.controller.signal;
}

export interface HermesV2ResourceRegionProps {
  ownerId: string;
  enabled: boolean;
  active: boolean;
  visible: boolean;
  area: ResourceArea | null;
  deleteSessionId: string | null;
  onDeleteClosed: () => void;
  onOpenSession?: ((sessionId: string) => void) | undefined;
}

/**
 * Ressourcenregion: hookt das Clientviewmodel nur, wenn wirklich eine
 * Ressourcen- oder Deletefläche sichtbar sein soll. Der Chat-Renditerpfad
 * rhiskt keinen Mount-Emitschatten, und Verlassen wirft native Inhalte weg.
 */
export function HermesV2ResourceRegion({
  ownerId,
  enabled,
  active,
  visible,
  area,
  deleteSessionId,
  onDeleteClosed,
  onOpenSession,
}: HermesV2ResourceRegionProps) {
  const signal = useResourceSignal(ownerId);
  const resources = useHermesV2Resources({
    ownerId,
    enabled,
    active,
    visible,
    area,
    signal,
    deleteSessionId,
  });
  return (
    <>
      {area === "cron" ? <HermesV2CronArea resources={resources} onOpenSession={onOpenSession} /> : null}
      {area === "skills" ? <HermesV2SkillsArea resources={resources} /> : null}
      {area === "memory" ? <HermesV2MemoryArea resources={resources} /> : null}
      {area === "diagnostics" ? (
        <HermesV2DiagnosticsArea resources={resources} />
      ) : null}
      {deleteSessionId ? (
        <HermesV2SessionDeleteSheet
          resources={resources}
          sessionId={deleteSessionId}
          onClose={onDeleteClosed}
        />
      ) : null}
    </>
  );
}
