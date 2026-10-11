/**
 * Feature-Flags des Preview-Slot-Dienstes (aus `slots.ts` ausgelagert, damit
 * die historisch gewachsene Datei nicht weiter wächst).
 */
export interface PreviewFlags {
  gatewayV2Enabled: boolean;
  bridgeEnabled: boolean;
  diagnosticsEnabled: boolean;
  storageSyncEnabled: boolean;
  slotResetEnabled: boolean;
  maxInjectableHtmlBytes: number;
  maxStorageBytes: number;
  maxStorageKeys: number;
  /** Testmodus: Slot-Origins als `http://127.0.0.1:<internalPort>` ausgeben. */
  loopbackPublicOrigins: boolean;
  /**
   * Strikter Slot-Token-Modus (S-005): Listener verlangen `?slotToken` pro
   * Request. Bleibt aus, bis die Workbench-Oberfläche (apps/web, eingefroren)
   * Token an Slot-URLs hängt — sonst brächen alle Previews.
   */
  requireSlotToken: boolean;
}

export const defaultFlags: PreviewFlags = {
  gatewayV2Enabled: false,
  bridgeEnabled: false,
  diagnosticsEnabled: false,
  storageSyncEnabled: false,
  slotResetEnabled: false,
  maxInjectableHtmlBytes: 2_097_152,
  maxStorageBytes: 262_144,
  maxStorageKeys: 1_000,
  loopbackPublicOrigins: false,
  requireSlotToken: false,
};
