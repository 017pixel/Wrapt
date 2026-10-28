import { z } from "zod";
import {
  activationEventsV1Schema,
} from "./activation-events.js";
import {
  agentSkillContributionsSchema,
} from "./agent-skill-contributions.js";
import { agentToolContributionsSchema } from "./agent-tool-contributions.js";
import { backgroundServiceContributionsSchema } from "./background-service-contributions.js";
import {
  commandContributionsSchema,
  dashboardContributionsSchema,
  navigationContributionsSchema,
  pageContributionsSchema,
  routeContributionsSchema,
} from "./contributions.js";
import {
  contextMenuContributionsSchema,
} from "./context-menus.js";
import {
  extensionConflictsSchema,
  extensionDependencyMapSchema,
} from "./dependencies.js";
import { fileContributionsSchema } from "./file-contributions.js";
import {
  httpContributionsSchema,
  rpcContributionsSchema,
} from "./http-rpc-contributions.js";
import { extensionIdSchema } from "./ids.js";
import { keyboardShortcutContributionsSchema } from "./keyboard-shortcuts.js";
import { notificationContributionsSchema } from "./notification-contributions.js";
import {
  extensionEntrypointPathSchema,
  extensionIconPathSchema,
  extensionMarkdownPathSchema,
} from "./package-paths.js";
import {
  extensionApiCompatibilitySchema,
  manifestVersionSchema,
  wraptCompatibilitySchema,
  semanticVersionSchema,
} from "./versioning.js";
import { extensionPermissionRequestsSchema } from "./permissions.js";
import { previewContributionsSchema } from "./preview-contributions.js";
import { realtimeContributionsSchema } from "./realtime-contributions.js";
import { scheduledJobContributionsSchema } from "./scheduled-job-contributions.js";
import { settingsContributionsSchema } from "./settings-contributions.js";
import { statusBarContributionsSchema } from "./status-bar.js";
import { terminalContributionsSchema } from "./terminal-contributions.js";
import { themeContributionsSchema } from "./theme-contributions.js";
import { topbarContributionsSchema } from "./topbar.js";

export * from "./package-paths.js";

export const EXTENSION_NAME_MAX_LENGTH = 80;
export const EXTENSION_DESCRIPTION_MAX_LENGTH = 500;
export const EXTENSION_PUBLISHER_MAX_LENGTH = 64;
export const EXTENSION_LICENSE_MAX_LENGTH = 128;
export const EXTENSION_CATEGORY_MAX_LENGTH = 64;
export const EXTENSION_KEYWORD_MAX_LENGTH = 48;
export const EXTENSION_KEYWORDS_MAX_COUNT = 20;
export const EXTENSION_SCHEMA_REFERENCE_MAX_LENGTH = 512;

const slugPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function boundedTextSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => value === value.trim() && !containsControlCharacter(value),
      `${fieldName} darf keine äußeren Leerzeichen oder Steuerzeichen enthalten.`,
    );
}

function slugSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .regex(slugPattern, `${fieldName} muss ein kleingeschriebener Slug sein.`);
}

export const extensionSchemaReferenceSchema = z
  .string()
  .min(1)
  .max(EXTENSION_SCHEMA_REFERENCE_MAX_LENGTH)
  .refine(
    (value) => value === value.trim() && !containsControlCharacter(value),
    "Die Schema-Referenz darf keine äußeren Leerzeichen oder Steuerzeichen enthalten.",
  );

export const extensionNameSchema = boundedTextSchema(
  EXTENSION_NAME_MAX_LENGTH,
  "Der Name",
);
export const extensionDescriptionSchema = boundedTextSchema(
  EXTENSION_DESCRIPTION_MAX_LENGTH,
  "Die Beschreibung",
);
export const extensionPublisherSchema = slugSchema(
  EXTENSION_PUBLISHER_MAX_LENGTH,
  "Der Publisher",
);
export const extensionLicenseSchema = boundedTextSchema(
  EXTENSION_LICENSE_MAX_LENGTH,
  "Die Lizenz",
);
export const extensionCategorySchema = slugSchema(
  EXTENSION_CATEGORY_MAX_LENGTH,
  "Die Kategorie",
);
export const extensionKeywordSchema = boundedTextSchema(
  EXTENSION_KEYWORD_MAX_LENGTH,
  "Ein Keyword",
);

export const extensionKeywordsSchema = z
  .array(extensionKeywordSchema)
  .max(EXTENSION_KEYWORDS_MAX_COUNT)
  .superRefine((keywords, context) => {
    const normalized = new Set<string>();
    for (const [index, keyword] of keywords.entries()) {
      const comparableKeyword = keyword.toLowerCase();
      if (normalized.has(comparableKeyword)) {
        context.addIssue({
          code: "custom",
          message: "Keywords dürfen nicht doppelt vorkommen.",
          path: [index],
        });
      }
      normalized.add(comparableKeyword);
    }
  });

export const extensionTrustLevels = [
  "system",
  "builtin",
  "catalog-first-party",
  "developer",
  "sandboxed-webview",
] as const;

export const extensionTrustLevelSchema = z.enum(extensionTrustLevels);
export type ExtensionTrustLevel = z.infer<typeof extensionTrustLevelSchema>;

const extensionEnginesShape = z.strictObject({
  wrapt: wraptCompatibilitySchema,
  extensionApi: extensionApiCompatibilitySchema,
});

/**
 * Akzeptiert alte `engines.remoteWorkplace`-Manifeste beim Einlesen, erzeugt
 * aber ausschließlich das kanonische `engines.wrapt`-Format.
 */
export const extensionEnginesSchema = z.preprocess((value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  if (source.wrapt !== undefined) return value;
  if (source.remoteWorkplace === undefined) return value;
  const { remoteWorkplace, ...rest } = source;
  return { ...rest, wrapt: remoteWorkplace };
}, extensionEnginesShape);

export type ExtensionEngines = z.infer<typeof extensionEnginesSchema>;

export const extensionEntrypointsSchema = z.strictObject({
  ui: extensionEntrypointPathSchema.optional(),
  server: extensionEntrypointPathSchema.optional(),
});

export type ExtensionEntrypoints = z.infer<typeof extensionEntrypointsSchema>;

// Manifest V1 öffnet Surfaces erst mit ihrem typisierten Contract. Contributions bleiben bis
// zu ihrem Phase-1-Subgoal fail-closed.
export const extensionPermissionsV1Schema = extensionPermissionRequestsSchema;
export const extensionActivationEventsV1Schema = activationEventsV1Schema;
export const extensionContributionsV1Schema = z.strictObject({
  commands: commandContributionsSchema.optional(),
  pages: pageContributionsSchema.optional(),
  routes: routeContributionsSchema.optional(),
  navigation: navigationContributionsSchema.optional(),
  dashboard: dashboardContributionsSchema.optional(),
  settings: settingsContributionsSchema.optional(),
  keyboardShortcuts: keyboardShortcutContributionsSchema.optional(),
  contextMenus: contextMenuContributionsSchema.optional(),
  statusBar: statusBarContributionsSchema.optional(),
  topbar: topbarContributionsSchema.optional(),
  files: fileContributionsSchema.optional(),
  terminal: terminalContributionsSchema.optional(),
  previews: previewContributionsSchema.optional(),
  agentTools: agentToolContributionsSchema.optional(),
  agentSkills: agentSkillContributionsSchema.optional(),
  backgroundServices: backgroundServiceContributionsSchema.optional(),
  scheduledJobs: scheduledJobContributionsSchema.optional(),
  http: httpContributionsSchema.optional(),
  rpc: rpcContributionsSchema.optional(),
  realtime: realtimeContributionsSchema.optional(),
  notifications: notificationContributionsSchema.optional(),
  themes: themeContributionsSchema.optional(),
});

export const extensionManifestBaseSchema = z
  .strictObject({
    $schema: extensionSchemaReferenceSchema.optional(),
    manifestVersion: manifestVersionSchema,
    id: extensionIdSchema,
    name: extensionNameSchema,
    version: semanticVersionSchema,
    publisher: extensionPublisherSchema,
    description: extensionDescriptionSchema,
    license: extensionLicenseSchema,
    category: extensionCategorySchema.optional(),
    keywords: extensionKeywordsSchema.optional(),
    icon: extensionIconPathSchema.optional(),
    readme: extensionMarkdownPathSchema.optional(),
    changelog: extensionMarkdownPathSchema.optional(),
    dataSchemaVersion: z.number().int().positive().optional(),
    engines: extensionEnginesSchema,
    trust: extensionTrustLevelSchema,
    entrypoints: extensionEntrypointsSchema,
    permissions: extensionPermissionsV1Schema,
    activationEvents: extensionActivationEventsV1Schema,
    extensionDependencies: extensionDependencyMapSchema.optional(),
    optionalExtensionDependencies: extensionDependencyMapSchema.optional(),
    extensionConflicts: extensionConflictsSchema.optional(),
    contributes: extensionContributionsV1Schema,
  })
  .refine(
    (manifest) =>
      manifest.entrypoints.ui !== undefined ||
      manifest.entrypoints.server !== undefined ||
      Object.keys(manifest.contributes).length > 0,
    {
      message:
        "Eine Extension benötigt mindestens einen Entrypoint oder eine Contribution.",
      path: ["entrypoints"],
    },
  )
;

export type ExtensionManifestInput = z.infer<typeof extensionManifestBaseSchema>;
