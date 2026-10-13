import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { apiClient } from "./apiClient";
import { publishSavedNote } from "../components/notes/noteQueryUpdates.js";

export function useOrbitQuicknote(onStatus: (message: string) => void) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pending = useRef(false);

  return useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      const result = await apiClient.createGlobalQuicknote();
      void publishSavedNote(queryClient, result.note);
      onStatus("Globale Schnellnotiz erstellt.");
      navigate(`/orbit/notizen?note=${encodeURIComponent(result.note.id)}`);
    } catch {
      onStatus("Die Schnellnotiz konnte nicht erstellt werden. Bitte erneut versuchen.");
    } finally {
      pending.current = false;
    }
  }, [navigate, onStatus, queryClient]);
}
