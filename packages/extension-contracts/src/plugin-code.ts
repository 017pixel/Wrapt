import { z } from "zod";
import { extensionIdSchema } from "./ids.js";
import { semanticVersionSchema } from "./versioning.js";

export const pluginSourcePathSchema = z.string().min(1).max(240)
  .regex(/^(?!.*(?:^|\/)\.\.(?:\/|$))(?!\/)[a-zA-Z0-9_./-]+$/)
  .refine((value) => !value.split("/").some((part) => part.startsWith(".") || part === ""));

const pluginEntrypointSchema = pluginSourcePathSchema.refine((value) => !value.endsWith(".d.ts") && /\.(?:tsx?|jsx?|mjs)$/.test(value), {
  message: "Einstiegspunkte müssen ausführbare TypeScript- oder JavaScript-Module sein.",
});

/** Persönliche Quellen sind unabhängig vom generierten Extension-Release. */
export const localPluginDefinitionSchema = z.strictObject({
  formatVersion: z.literal(3),
  id: extensionIdSchema.refine((value) => !/^(?:wrapt|workbench|host|system)\./.test(value), "Persönliche Plugin-IDs dürfen keinen reservierten Host-Namespace verwenden."),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  version: semanticVersionSchema,
  server: pluginEntrypointSchema.optional(),
  ui: pluginEntrypointSchema.optional(),
  dependencies: z.record(extensionIdSchema, z.string().min(1).max(100)).default({}),
}).refine((value) => value.server !== undefined || value.ui !== undefined, {
  message: "Ein Code-Plugin benötigt einen Server- oder UI-Einstiegspunkt.",
});

export const localPluginSourceFileSchema = z.strictObject({
  path: pluginSourcePathSchema,
  content: z.string().max(200_000),
});

export const localPluginSourceSchema = z.strictObject({
  definition: localPluginDefinitionSchema,
  revision: z.number().int().nonnegative(),
  files: z.array(localPluginSourceFileSchema).min(1).max(128),
}).superRefine((value, ctx) => {
  const paths = new Set<string>();
  for (const [index, file] of value.files.entries()) {
    if (paths.has(file.path)) ctx.addIssue({ code: "custom", message: "Dateipfade müssen eindeutig sein.", path: ["files", index, "path"] });
    paths.add(file.path);
  }
  for (const key of ["server", "ui"] as const) {
    const entry = value.definition[key];
    if (entry !== undefined && !paths.has(entry)) ctx.addIssue({ code: "custom", message: "Der Einstiegspunkt fehlt in den Quelldateien.", path: ["definition", key] });
  }
});

export const localPluginWriteSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  definition: localPluginDefinitionSchema,
  files: z.array(localPluginSourceFileSchema).min(1).max(128),
});

export const pluginDiagnosticSchema = z.strictObject({
  file: z.string(),
  line: z.number().int().positive().optional(),
  message: z.string(),
  severity: z.enum(["error", "warning"]),
});

export const localPluginStateSchema = z.strictObject({
  id: extensionIdSchema,
  name: z.string(),
  sourceDirectory: z.string(),
  sourceRevision: z.number().int().nonnegative(),
  builtRevision: z.number().int().nonnegative().nullable(),
  trusted: z.boolean(),
  development: z.boolean(),
  diagnostics: z.array(pluginDiagnosticSchema),
});

export type LocalPluginDefinition = z.infer<typeof localPluginDefinitionSchema>;
export type LocalPluginSource = z.infer<typeof localPluginSourceSchema>;
export type LocalPluginWrite = z.infer<typeof localPluginWriteSchema>;
export type LocalPluginState = z.infer<typeof localPluginStateSchema>;
export type PluginDiagnostic = z.infer<typeof pluginDiagnosticSchema>;

export interface PluginWireCall {
  kind: "call";
  id: string;
  method: string;
  input: unknown;
}

export interface PluginWireResult {
  kind: "result";
  id: string;
  value?: unknown;
  error?: { code: string; message: string };
}

export type PluginWireMessage = PluginWireCall | PluginWireResult;
