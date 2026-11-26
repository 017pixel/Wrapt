import { AppError } from "../utils/errors.js";
import type { PreviewSlotDatabase } from "./database.js";
import type { PreviewResetService } from "./reset.js";
import type { PreviewSlotDefinition } from "./routing.js";
import { expirePreviewSessions } from "./sessionLifecycle.js";

/**
 * Bereitet einen Slot für die Wiederherstellung vor. Nur Slots des
 * anfragenden Projekts oder Slots ohne Storage-Affinität kommen infrage;
 * der Storage eines anderen Projekts wird niemals geleert.
 */
export function beginPreviewSlotReclaim(
  options: {
    database: PreviewSlotDatabase;
    reset: PreviewResetService;
    definitions: readonly PreviewSlotDefinition[];
    releaseUnusedSlots: (slotIds: number[]) => void;
  },
  projectId: string | null,
): { slotId: number; nonce: string; affinity: ReturnType<PreviewResetService["affinity"]> } {
  const { database, reset, definitions } = options;
  return database.transaction(() => {
    expirePreviewSessions(database, (slots) => options.releaseUnusedSlots(slots));
    const persisted = new Map(database.list().map((slot) => [slot.slotId, slot]));
    let foreignAffinity = false;
    const candidates = definitions.flatMap((definition) => {
      const affinity = reset.affinity(definition.id);
      const targetPort = persisted.get(definition.id)?.targetPort ?? null;
      if (targetPort !== null || database.bindingCount(definition.id) > 0) return [];
      const own = projectId !== null && affinity.storageProjectId === projectId;
      if (affinity.storageOwnerKey === null) return [{ definition, affinity, priority: 1 }];
      if (own && affinity.state === "free") return [{ definition, affinity, priority: 0 }];
      if (own && affinity.state === "quarantined") return [{ definition, affinity, priority: 2 }];
      foreignAffinity = true;
      return [];
    }).sort((left, right) => left.priority - right.priority || left.definition.id - right.definition.id);
    for (const { definition, affinity } of candidates) {
      const started = reset.begin(definition.id, affinity.generation, affinity.storageProfileId);
      return { slotId: definition.id, ...started };
    }
    if (foreignAffinity) {
      throw new AppError(409, "PREVIEW_SLOT_NOT_OWNED", "Der einzige freie Preview-Slot gehört einem anderen Projekt. Sein Storage wird nicht geleert.");
    }
    throw new AppError(409, "PREVIEW_SLOTS_EXHAUSTED", "Es ist kein ungebundener Preview-Slot verfügbar, der im Browser sicher zurückgesetzt werden kann.");
  });
}
