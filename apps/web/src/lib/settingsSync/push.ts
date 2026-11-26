import type { UiSettingKey } from "@wrapt/contracts";
import { ApiClientError, apiClient } from "../apiClient";

export interface PushChange {
  key: UiSettingKey;
  value: unknown;
  serialized: string;
}

export type PushOutcome =
  | { kind: "saved" }
  | { kind: "rejected"; keys: UiSettingKey[] }
  | { kind: "conflict" }
  | { kind: "retryable"; error: unknown };

function isPermanentClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.status >= 400 && error.status < 500 && error.status !== 409;
}

/**
 * Sendet einen Batch und isoliert bei einem dauerhaften 4xx die abgelehnten
 * Einstellungen: Die übrigen gehen einzeln erneut raus, statt den gesamten
 * Sync zu blockieren (F-23).
 */
export async function pushSettingChanges(
  clientId: string,
  batch: PushChange[],
  onSaved: (key: UiSettingKey, serialized: string, revision: number | null) => void,
  onRejected: (key: UiSettingKey) => void,
): Promise<PushOutcome> {
  const save = (changes: PushChange[]) => apiClient.saveUiSettings({
    clientId,
    changes: changes.map((change) => ({ key: change.key, value: change.value as never })),
  });
  try {
    const response = await save(batch);
    if (!response) return { kind: "retryable", error: new Error("Antwort fehlt") };
    for (const change of batch) onSaved(change.key, change.serialized, response.entries[change.key]?.revision ?? null);
    return { kind: "saved" };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 409) return { kind: "conflict" };
    if (!isPermanentClientError(error)) return { kind: "retryable", error };
    if (batch.length === 1) {
      onRejected(batch[0]!.key);
      return { kind: "rejected", keys: [batch[0]!.key] };
    }
    const rejected: UiSettingKey[] = [];
    for (const change of batch) {
      try {
        const response = await save([change]);
        if (!response) throw new Error("Antwort fehlt", { cause: error });
        onSaved(change.key, change.serialized, response.entries[change.key]?.revision ?? null);
      } catch (singleError) {
        if (!isPermanentClientError(singleError)) return { kind: "retryable", error: singleError };
        onRejected(change.key);
        rejected.push(change.key);
      }
    }
    return { kind: "rejected", keys: rejected };
  }
}
