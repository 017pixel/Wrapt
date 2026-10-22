import { z } from "zod";
import { isoDateSchema } from "./host-system.js";
import { usageProviderIdSchema } from "./usage-contracts.js";

export const managedAccountSchema = z.object({
  id: z.string().uuid(),
  provider: usageProviderIdSchema,
  label: z.string().trim().min(1).max(80),
  email: z.string().email().nullable(),
  profilePath: z.string().startsWith("/"),
  source: z.enum(["local", "login", "codexbar"]),
  enabled: z.boolean(),
  // Serverweit aktiver Account des Anbieters. Bei Codex ergibt sich der Wert aus dem
  // Symlink des gemeinsamen Codex-Homes, ist also immer der tatsächlich genutzte Stand.
  active: z.boolean().default(false),
  plan: z.string().min(1).nullable().default(null),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const accountsResponseSchema = z.object({ accounts: z.array(managedAccountSchema) });

export const discoveredAccountSchema = z.object({
  accountId: z.string().uuid().nullable(),
  provider: usageProviderIdSchema,
  label: z.string().min(1),
  profilePath: z.string().startsWith("/"),
  registered: z.boolean(),
  authenticated: z.boolean(),
  enabled: z.boolean().nullable(),
  source: z.enum(["local", "login", "codexbar"]).nullable(),
  active: z.boolean().default(false),
  email: z.string().email().nullable().default(null),
  plan: z.string().min(1).nullable().default(null),
});

export const discoveredAccountsResponseSchema = z.object({ accounts: z.array(discoveredAccountSchema) });

export const createAccountRequestSchema = z.object({
  provider: usageProviderIdSchema,
  label: z.string().trim().min(1).max(80),
  profilePath: z.string().startsWith("/").optional(),
  source: z.enum(["local", "login"]).default("local"),
});

export const updateAccountRequestSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export const accountResponseSchema = z.object({ account: managedAccountSchema });

export const activateAccountResponseSchema = z.object({
  account: managedAccountSchema,
  // Gesetzt, wenn beim Umschalten eine noch reguläre Anmeldedatei aus dem gemeinsamen
  // Home in einen Anmeldespeicher übernommen oder beiseitegelegt wurde.
  adoptedInto: z.string().startsWith("/").nullable(),
  backupPath: z.string().startsWith("/").nullable(),
  // Gesetzt, wenn der Account bisher direkt auf das gemeinsame Home zeigte und dafür
  // einen eigenen Anmeldespeicher bekommen hat.
  migratedTo: z.string().startsWith("/").nullable().default(null),
});

export const loginSessionResponseSchema = z.object({
  account: managedAccountSchema,
  terminalKind: z.enum(["codex", "opencode", "claude"]),
  command: z.string().min(1),
});

// Explizite Recovery-Saga (D-009): Journale abgeschlossen, Reparaturfehler als Warnungen.
export const accountReconcileResponseSchema = z.object({ reconciledProviders: z.array(usageProviderIdSchema), warnings: z.array(z.object({ provider: usageProviderIdSchema, message: z.string().min(1).max(500) })) });

export type ManagedAccount = z.infer<typeof managedAccountSchema>;

export type AccountsResponse = z.infer<typeof accountsResponseSchema>;

export type DiscoveredAccount = z.infer<typeof discoveredAccountSchema>;

export type DiscoveredAccountsResponse = z.infer<typeof discoveredAccountsResponseSchema>;

export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;

export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;

export type AccountResponse = z.infer<typeof accountResponseSchema>;

export type ActivateAccountResponse = z.infer<typeof activateAccountResponseSchema>;

export type LoginSessionResponse = z.infer<typeof loginSessionResponseSchema>;

export type AccountReconcileResponse = z.infer<typeof accountReconcileResponseSchema>;
