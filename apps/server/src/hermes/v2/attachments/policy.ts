/** Fachliche Uploadgrenzen; keine globale Hermes-Konfiguration ändern. */
export const attachmentPolicy = {
  fileBytes: 4_194_304, references: 10, perOwner: 1, concurrent: 2, bodyMs: 60_000,
  pendingOwner: 64, pendingTotal: 512, recordsOwner: 512, recordsTotal: 4096,
  unusedMs: 86400_000, usedMs: 90 * 86400_000,
} as const;
