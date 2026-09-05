import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { NewsListResponse } from "@wrapt/contracts";
import { RefreshIcon } from "../components/icons";
import { apiClient } from "../lib/apiClient";

/* Hinweisbox, wenn der serverseitige Tech-News-Sync pausiert ist. Schaltet den
   Hintergrund-Sync wieder ein und stößt danach einen Sync an. */
export function NewsSyncNotice({ sync, syncPending, requestSync }: {
  sync: NewsListResponse["sync"] | undefined;
  syncPending: boolean;
  requestSync: () => void;
}) {
  const client = useQueryClient();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sync?.enabled !== false) return null;
  const enable = async () => {
    setActivating(true);
    setError(null);
    try {
      await apiClient.saveNewsSettings({ enabled: true });
      await client.invalidateQueries({ queryKey: ["news"] });
      requestSync();
    } catch {
      setError("Der Hintergrund-Sync konnte nicht aktiviert werden. Bitte versuche es gleich noch einmal.");
    } finally {
      setActivating(false);
    }
  };
  return (
    <div className="news-disabled-note" role="status">
      <span>Hintergrund-Sync ist pausiert. Es laufen keine Feed-Abfragen und keine Mistral-Aufrufe. Der gespeicherte Bestand bleibt lesbar.</span>
      {error ? <span>{error}</span> : null}
      <button className="news-primary-button" onClick={() => void enable()} disabled={syncPending || activating}>
        <RefreshIcon />
        <span>{activating ? "Aktiviert …" : "Aktivieren und laden"}</span>
      </button>
    </div>
  );
}
