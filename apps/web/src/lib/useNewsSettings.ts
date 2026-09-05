import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./apiClient";
import { wraptQueries } from "./queryOptions";

/* Serverseitiger Tech-News-Schalter. Bei false lädt der Server keine Feeds mehr nach
   und ruft Mistral nicht mehr auf. Wirkt sofort und braucht keinen Neustart. */
export function useNewsSettings() {
  const queryClient = useQueryClient();
  const settings = useQuery(wraptQueries.newsSettings());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const save = async (enabled: boolean) => {
    setSaving(true);
    setMessage("");
    try {
      const response = await apiClient.saveNewsSettings({ enabled });
      if (response) queryClient.setQueryData(wraptQueries.newsSettings().queryKey, response);
      await queryClient.invalidateQueries({ queryKey: ["news"] });
      setMessage(enabled
        ? "Tech-News sind aktiv. Der nächste Sync lädt wieder neue Meldungen."
        : "Tech-News sind pausiert. Es laufen keine Hintergrund-Syncs und keine Mistral-Aufrufe mehr.");
      return true;
    } catch {
      setMessage("Die Einstellung konnte nicht gespeichert werden.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { enabled: settings.data?.settings.enabled ?? true, loaded: settings.data !== undefined, saving, message, save };
}
