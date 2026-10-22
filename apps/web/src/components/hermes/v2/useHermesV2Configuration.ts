import { useCallback, useEffect, useRef, useState } from "react";
import type { HermesV2Configuration, HermesV2ConfigurationUpdate } from "@wrapt/contracts/hermes-v2";
import { ResourceClient } from "./resource-client";
import { resourceError } from "./resource-error";

const client = new ResourceClient();

/** Profilgebunden lesen und schreiben; unklare Ergebnisse erfordern erneutes Lesen. */
export function useHermesV2Configuration(active: boolean) {
  const [data, setData] = useState<HermesV2Configuration | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const load = useCallback(async () => {
    if (!active || locked.current) return;
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    locked.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await client.configuration(request.signal);
      if (!request.signal.aborted) { setData(result); setBlocked(false); }
    } catch (cause) {
      if (!request.signal.aborted) setError(resourceError(cause).message);
    } finally {
      if (controller.current === request) { locked.current = false; setBusy(false); }
    }
  }, [active]);
  useEffect(() => {
    if (active) void load();
    return () => { controller.current?.abort(); controller.current = null; locked.current = false; };
  }, [active, load]);
  const save = async (changes: HermesV2ConfigurationUpdate["changes"]) => {
    if (!active || !data || locked.current || blocked) return;
    const request = new AbortController();
    controller.current = request;
    locked.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await client.saveConfiguration({ scope: data.scope, expected: data.values, changes }, request.signal);
      if (!request.signal.aborted) { setData(result); setSaved(true); }
    } catch (cause) {
      if (!request.signal.aborted) {
        const failure = resourceError(cause, "unknown");
        setError(failure.outcome === "unknown"
          ? `${failure.message} Ergebnis unklar. Vor weiteren Änderungen neu laden.`
          : failure.message);
        setBlocked(true);
      }
    } finally {
      if (controller.current === request) { locked.current = false; setBusy(false); }
    }
  };
  return { data, busy, error, blocked, saved, load, save };
}
