import { z } from "zod";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const slug = z.string().min(1).max(48).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);

export const pluginPageModeSchema = z.enum(["blocks", "html", "iframe"]);
export const pluginCreationModeSchema = z.enum(["ai", "visual", "code"]);
export const pluginIconNames = [
  "extensions",
  "dashboard",
  "terminal",
  "code",
  "browser",
  "chart",
  "clock",
  "check-circle",
  "checklist",
  "note",
  "link",
  "calendar",
  "search",
  "folder",
  "file",
  "bell",
  "shield",
  "database",
  "rocket",
  "pencil",
  "play",
  "layout",
  "globe",
  "list",
  "sparkles",
] as const;
export const pluginIconPresetSchema = z.enum(pluginIconNames);
export type PluginIconName = z.infer<typeof pluginIconPresetSchema>;
export const pluginIconSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/, "Das Icon-Codewort darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.");
export const pluginActivationStatusSchema = z.enum([
  "draft",
  "validating",
  "ready",
  "active",
  "disabled",
  "error",
]);
export const pluginSurfaceSchema = z.enum([
  "page",
  "sidebar",
  "topbar",
  "bottom-bar",
  "dashboard",
  "orbit",
  "right-rail",
  "overlay",
  "bottom-sheet",
  "context-menu",
  "preview",
]);
export const pluginTokenSchema = z.enum([
  "surfaceBase",
  "surfaceRaised",
  "surfaceOverlay",
  "text",
  "textMuted",
  "textFaint",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
]);
export const pluginCapabilitySchema = z.strictObject({
  id: slug,
  label: text(120),
  kind: z.enum(["content", "action", "data", "agent-tool"]),
  surface: pluginSurfaceSchema,
  description: z.string().max(500),
  permission: z.string().max(120).nullable(),
  enabled: z.boolean(),
});
export const pluginSurfaceContributionSchema = z.strictObject({
  id: slug,
  surface: pluginSurfaceSchema,
  title: text(120),
  description: z.string().max(500),
  mobileBehavior: z.enum(["same", "bottom-sheet", "full-screen", "hidden"]),
  token: pluginTokenSchema,
});
export const pluginPackageFileSchema = z.strictObject({
  path: z.string().min(1).max(240).regex(/^(?!.*\.\.)(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/),
  content: z.string().max(200_000),
});
export const pluginFunctionActionSchema = z.enum([
  "open-route",
  "copy-text",
  "toggle-panel",
  "notify",
  "open-overlay",
  "open-bottom-sheet",
  "set-filter",
  "save-state",
  "load-state",
  "run-command",
  "activate-account",
  "refresh-data",
  "start-timer",
  "stop-timer",
  "reset-timer",
]);

export const pluginBlockSchema = z.strictObject({
  id: slug,
  type: z.enum([
    "heading",
    "text",
    "button",
    "stat",
    "list",
    "divider",
    "input",
    "select",
    "checkbox",
    "tabs",
    "notice",
    "progress",
    "table",
    "filter",
    "timer",
  ]),
  title: text(120),
  content: z.string().max(10_000),
  actionId: slug.nullable(),
});

export const pluginFunctionSchema = z.strictObject({
  id: slug,
  label: text(120),
  action: pluginFunctionActionSchema,
  value: z.string().max(2_000),
});

export const pluginOrbitSchema = z.strictObject({
  enabled: z.boolean(),
  title: text(120),
  description: z.string().max(500),
  placement: z.enum(["orbit", "dashboard", "both"]),
  nodeType: z.enum(["note", "frame", "todo"]),
  accent: z.enum(["accent", "ok", "warn", "neutral"]),
});

export const pluginWizardAnswersSchema = z.strictObject({
  goal: z.string().max(4_000),
  audience: z.string().max(1_000),
  design: z.enum(["klar", "kompakt", "editorial", "technisch", "eigen"]),
  layout: z.enum(["einspaltig", "zweispaltig", "dashboard", "frei"]),
  tone: z.enum(["ruhig", "direkt", "freundlich", "fokussiert"]),
  includeHtml: z.boolean(),
  includeIframe: z.boolean(),
  includeOrbit: z.boolean(),
  additionalDescription: z.string().max(4_000),
  wishes: z.string().max(4_000),
  editRequest: z.string().max(6_000).default(""),
  additionalRequirements: z.string().max(6_000).default(""),
  iconDescription: z.string().max(500).default(""),
  restartBehavior: z.enum(["never", "ask", "approved"]).default("ask"),
  agent: z.enum(["codex", "claude", "opencode", "anderer"]),
  permissions: z.array(z.string().max(120)).max(12),
  surfaces: z.array(pluginSurfaceSchema).max(12).default(["page"]),
  dataNeeds: z.array(z.string().max(120)).max(12).default([]),
  interactions: z.array(z.string().max(120)).max(16).default([]),
  mobileBehavior: z.enum(["responsive", "bottom-sheet", "full-screen"]).default("responsive"),
});

export const pluginDraftContentSchema = z.strictObject({
  formatVersion: z.number().int().min(1).max(2).default(2),
  creationMode: pluginCreationModeSchema.default("visual"),
  slug,
  name: text(80),
  description: text(500),
  icon: pluginIconSchema.default("extensions"),
  publisher: slug,
  category: slug,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  routePath: z.string().min(2).max(160).regex(/^\/[a-z0-9][a-z0-9\-/:]*$/),
  pageMode: pluginPageModeSchema,
  iframeUrl: z.string().max(2_048).nullable(),
  html: z.string().max(100_000),
  blocks: z.array(pluginBlockSchema).max(40),
  functions: z.array(pluginFunctionSchema).max(24),
  orbit: pluginOrbitSchema,
  wizard: pluginWizardAnswersSchema,
  sourceExampleId: slug.nullable(),
  status: z.enum(["draft", "published"]),
  capabilities: z.array(pluginCapabilitySchema).max(48).default([]),
  surfaces: z.array(pluginSurfaceSchema).max(12).default(["page"]),
  surfaceContributions: z.array(pluginSurfaceContributionSchema).max(24).default([]),
  activationStatus: pluginActivationStatusSchema.default("draft"),
  revision: z.number().int().nonnegative().default(0),
  packageFiles: z.array(pluginPackageFileSchema).max(64).default([]),
});

export const pluginDraftSchema = pluginDraftContentSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

/** Bedingter Write für den serverseitig gespeicherten Draft. */
export const pluginDraftUpdateRequestSchema = z.union([
  z.strictObject({
    expectedRevision: z.number().int().nonnegative(),
    content: pluginDraftContentSchema,
  }),
  // Alte Clients dürfen weiterhin den Content direkt senden; dessen Revision
  // ist dann die implizite If-Match-Version.
  pluginDraftContentSchema,
]);

export const pluginExampleSchema = pluginDraftContentSchema.extend({
  exampleId: slug,
  sourceDirectory: z.string().min(1).max(260),
});

export const pluginExamplesResponseSchema = z.strictObject({
  examples: z.array(pluginExampleSchema),
  total: z.number().int().nonnegative(),
});

/** Inhalt, den der Server aus einem verifizierten Runtime-Release-Slot liest. */
export const pluginRuntimeEntrySchema = z.strictObject({
  extensionId: z.string().min(1).max(128),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  packageIntegrity: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  content: pluginDraftContentSchema,
});

export const pluginRuntimeResponseSchema = z.strictObject({
  runtimes: z.array(pluginRuntimeEntrySchema).max(1_024),
});

export const pluginDraftsResponseSchema = z.strictObject({
  drafts: z.array(pluginDraftSchema),
});

export const pluginDraftResponseSchema = z.strictObject({
  draft: pluginDraftSchema,
});

export const pluginPublishResponseSchema = z.strictObject({
  draft: pluginDraftSchema,
  extensionId: z.string().min(1),
});

export const pluginValidationIssueSchema = z.strictObject({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string().min(1),
});
export const pluginValidationResponseSchema = z.strictObject({
  draft: pluginDraftSchema,
  valid: z.boolean(),
  errors: z.array(pluginValidationIssueSchema),
});
export const pluginActivationResponseSchema = z.strictObject({
  draft: pluginDraftSchema,
  extensionId: z.string().min(1),
});
export const pluginCreatorSkillResponseSchema = z.strictObject({
  fileName: z.literal("SKILL.md"),
  content: z.string().max(262_144),
  modifiedAt: z.iso.datetime(),
  sizeBytes: z.number().int().nonnegative().max(262_144),
});

export type PluginBlock = z.infer<typeof pluginBlockSchema>;
export type PluginFunction = z.infer<typeof pluginFunctionSchema>;
export type PluginOrbit = z.infer<typeof pluginOrbitSchema>;
export type PluginCreationMode = z.infer<typeof pluginCreationModeSchema>;
export type PluginActivationStatus = z.infer<typeof pluginActivationStatusSchema>;
export type PluginCapability = z.infer<typeof pluginCapabilitySchema>;
export type PluginSurface = z.infer<typeof pluginSurfaceSchema>;
export type PluginSurfaceContribution = z.infer<typeof pluginSurfaceContributionSchema>;
export type PluginPackageFile = z.infer<typeof pluginPackageFileSchema>;
export type PluginWizardAnswers = z.infer<typeof pluginWizardAnswersSchema>;
export type PluginDraftContent = z.infer<typeof pluginDraftContentSchema>;
export type PluginDraft = z.infer<typeof pluginDraftSchema>;
export type PluginDraftUpdateRequest = z.infer<typeof pluginDraftUpdateRequestSchema>;
export type PluginExample = z.infer<typeof pluginExampleSchema>;
export type PluginRuntimeEntry = z.infer<typeof pluginRuntimeEntrySchema>;
export type PluginValidationIssue = z.infer<typeof pluginValidationIssueSchema>;
export type PluginCreatorSkillResponse = z.infer<typeof pluginCreatorSkillResponseSchema>;
