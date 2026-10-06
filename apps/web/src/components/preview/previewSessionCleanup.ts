import { apiClient } from "../../lib/apiClient";

/** Wartet eine schon gestartete Öffnung ab, damit deren Antwort keinen Slot verwaist. */
export async function closeTransientPreviewSession(key: string, pending?: Promise<unknown>): Promise<void> {
  if (pending) await pending.catch(() => undefined);
  await apiClient.closePreviewSessionByKey(key);
}
