import type { DatabaseSync } from "node:sqlite";
import type { PreviewSlotState } from "@wrapt/contracts";

export interface AffinityRow {
  slotId: number;
  storageOwnerKey: string | null;
  storageProfileId: string | null;
  /** Projekt, dem die Slot-Origin gehört; Grundlage für die Reclaim-Prüfung. */
  storageProjectId: string | null;
  generation: number;
  state: PreviewSlotState;
  lastVerifiedResetAt: string | null;
  resetNonce: string | null;
  resetStartedAt: string | null;
}

const COLUMNS = `slot_id slotId, storage_owner_key storageOwnerKey,
  storage_profile_id storageProfileId, storage_project_id storageProjectId, generation, state,
  last_verified_reset_at lastVerifiedResetAt, reset_nonce resetNonce, reset_started_at resetStartedAt`;

/** Persistente Storage-Affinität eines Preview-Slots. */
export class PreviewAffinityStore {
  constructor(private readonly db: DatabaseSync) {}

  affinity(slotId: number): AffinityRow | null {
    return (this.db.prepare(`SELECT ${COLUMNS} FROM preview_slot_affinities WHERE slot_id = ?`).get(slotId) as AffinityRow | undefined) ?? null;
  }

  affinities(): AffinityRow[] {
    return this.db.prepare(`SELECT ${COLUMNS} FROM preview_slot_affinities ORDER BY slot_id`).all() as unknown as AffinityRow[];
  }

  writeAffinity(row: AffinityRow): void {
    this.db.prepare(`INSERT INTO preview_slot_affinities
      (slot_id, storage_owner_key, storage_profile_id, storage_project_id, generation, state, last_verified_reset_at, reset_nonce, reset_started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slot_id) DO UPDATE SET storage_owner_key=excluded.storage_owner_key,
        storage_profile_id=excluded.storage_profile_id, storage_project_id=excluded.storage_project_id,
        generation=excluded.generation, state=excluded.state,
        last_verified_reset_at=excluded.last_verified_reset_at, reset_nonce=excluded.reset_nonce,
        reset_started_at=excluded.reset_started_at, updated_at=excluded.updated_at`)
      .run(row.slotId, row.storageOwnerKey, row.storageProfileId, row.storageProjectId, row.generation, row.state,
        row.lastVerifiedResetAt, row.resetNonce, row.resetStartedAt, new Date().toISOString());
  }
}
