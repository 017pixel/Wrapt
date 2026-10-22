import { z } from "zod";
import { isoDateSchema } from "./host-system.js";

// --- KI-Skills (Skill-Editor) -----------------------------------------------
// Editor für den globalen Harness-Ordner; Skills sind Symlinks aufs Skills-Repo.
export const skillNameSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Nur Kleinbuchstaben, Ziffern und Bindestriche.");

export const skillEditorFileSchema = z.object({
  name: z.string().min(1),
  path: z.string().startsWith("/"),
  kind: z.enum(["file", "directory"]),
  sizeBytes: z.number().int().nonnegative().nullable(),
  modifiedAt: isoDateSchema.nullable(),
  symlink: z.boolean(),
  broken: z.boolean(),
  editable: z.boolean(),
});

export const skillEditorNodeSchema = z.object({
  name: z.string().min(1),
  path: z.string().startsWith("/"),
  description: z.string().nullable(),
  modifiedAt: isoDateSchema.nullable(),
  symlink: z.boolean(),
  broken: z.boolean(),
  files: z.array(skillEditorFileSchema),
});

// Regeleintrag im Skill-Baum (Harness- und Hermes-Regeln).
export const skillEditorRuleEntrySchema = z.object({ id: z.string().min(1), label: z.string().min(1), path: z.string().startsWith("/"),
  editable: z.boolean(), symlinkTarget: z.string().startsWith("/").nullable() });

// Hermes-Skillknoten: Skill-Knoten plus Kategorie (hermes-skills/<kategorie>/<name>).
export const hermesSkillEditorNodeSchema = skillEditorNodeSchema.extend({ category: z.string().min(1) });

export const skillEditorTreeResponseSchema = z.object({
  rootDirectory: z.string().startsWith("/"),
  agentsFile: skillEditorFileSchema.nullable(),
  ruleEntries: z.array(skillEditorRuleEntrySchema).default([]),
  skills: z.array(skillEditorNodeSchema),
  hermesSkills: z.array(hermesSkillEditorNodeSchema).default([]),
});

export const skillEditorRepositoryStatusSchema = z.object({ branch: z.string(), dirtyCount: z.number().int().nonnegative() });

export const skillEditorStatusResponseSchema = z.object({
  rootDirectory: z.string().startsWith("/"),
  repositoryConfigured: z.boolean(),
  repository: skillEditorRepositoryStatusSchema.nullable(),
  propagationTargets: z.array(z.string().startsWith("/")),
  autosaveDebounceMs: z.number().int().min(500).max(15_000),
  maxFileBytes: z.number().int().positive(),
});

export const skillEditorReadResponseSchema = z.object({
  path: z.string().startsWith("/"),
  name: z.string().min(1),
  content: z.string(),
  modifiedAt: isoDateSchema,
  sizeBytes: z.number().int().nonnegative(),
  /** Inhaltsgebundener Revisionstoken für konfliktfreies Speichern. */
  revisionToken: z.string().min(16),
});

export const skillEditorWriteRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
  content: z.string().max(2_097_152),
  expectedRevision: z.string().min(16).nullable().optional(),
  // Ältere Clients senden die Änderungszeit als schwächeren Erwartungswert.
  expectedModifiedAt: isoDateSchema.nullable().optional(),
}).refine(
  // Bewusstes Überschreiben braucht `null`; fehlende Felder werden abgelehnt.
  (value) => value.expectedRevision !== undefined || value.expectedModifiedAt !== undefined,
  "Für konfliktfreies Speichern ist ein Erwartungswert erforderlich.",
);

export const skillEditorCreateRequestSchema = z.object({
  name: skillNameSchema,
  description: z.string().trim().min(1).max(1_024),
  license: z.string().trim().min(1).max(120).optional(),
});

// Hermes-Anlage: normaler Skill plus Kategorie (hermes-skills/<kategorie>/<name>).
export const hermesSkillEditorCreateRequestSchema = skillEditorCreateRequestSchema.extend({ category: skillNameSchema });

// Gültigkeitsbereich; ohne Angabe gilt der Bestand ("skills").
export const skillEditorScopeSchema = z.enum(["skills", "hermes"]);

export const skillEditorCreateResponseSchema = z.object({
  path: z.string().startsWith("/"),
  name: skillNameSchema,
  propagated: z.array(z.string().startsWith("/")),
  readmeUpdated: z.boolean(),
  notice: z.string().nullable(),
});

export const skillEditorRenameRequestSchema = z.object({
  name: skillNameSchema,
  newName: skillNameSchema,
  scope: skillEditorScopeSchema.default("skills"),
});

export const skillEditorDeleteRequestSchema = z.object({ name: skillNameSchema, scope: skillEditorScopeSchema.default("skills") });

export const skillEditorGitChangeSchema = z.object({ name: z.string().min(1), action: z.enum(["hinzugefuegt", "geaendert", "entfernt"]) });

export const skillEditorGitResponseSchema = z.object({
  committed: z.boolean(),
  pushed: z.boolean(),
  message: z.string().nullable(),
  changedSkills: z.array(skillEditorGitChangeSchema),
  /** Explizit vorgemerkte Pfade — nie der gesamte Arbeitsbaum. */
  paths: z.array(z.string()),
  errorTail: z.string().nullable(),
  notice: z.string().nullable(),
});

export const skillEditorGitPreviewResponseSchema = z.object({
  branch: z.string(),
  changes: z.array(skillEditorGitChangeSchema),
  /** Pfade, die ein Commit ausdrücklich aufnehmen würde. */
  paths: z.array(z.string()),
  newFiles: z.array(z.string()),
  /** Vorhandene Änderungen, die bewusst nicht committet werden. */
  excludedPaths: z.array(z.string()),
  globalRulesChanged: z.boolean(),
  diff: z.string(),
  diffTruncated: z.boolean(),
  /** Bindet die Bestätigung an genau diesen Arbeitsstand. */
  intent: z.string().min(16),
  errorTail: z.string().nullable(),
  notice: z.string().nullable(),
});

export const skillEditorGitCommitRequestSchema = z.object({ intent: z.string().min(16) });

export type SkillEditorFile = z.infer<typeof skillEditorFileSchema>;

export type SkillEditorNode = z.infer<typeof skillEditorNodeSchema>;

export type SkillEditorRuleEntry = z.infer<typeof skillEditorRuleEntrySchema>;

export type HermesSkillEditorNode = z.infer<typeof hermesSkillEditorNodeSchema>;

export type SkillEditorScope = z.infer<typeof skillEditorScopeSchema>;

export type SkillEditorTreeResponse = z.infer<typeof skillEditorTreeResponseSchema>;

export type SkillEditorRepositoryStatus = z.infer<typeof skillEditorRepositoryStatusSchema>;

export type SkillEditorStatusResponse = z.infer<typeof skillEditorStatusResponseSchema>;

export type SkillEditorReadResponse = z.infer<typeof skillEditorReadResponseSchema>;

export type SkillEditorWriteRequest = z.infer<typeof skillEditorWriteRequestSchema>;

export type SkillEditorCreateRequest = z.infer<typeof skillEditorCreateRequestSchema>;

export type HermesSkillEditorCreateRequest = z.infer<typeof hermesSkillEditorCreateRequestSchema>;

export type SkillEditorCreateResponse = z.infer<typeof skillEditorCreateResponseSchema>;

export type SkillEditorRenameRequest = z.infer<typeof skillEditorRenameRequestSchema>;

export type SkillEditorDeleteRequest = z.infer<typeof skillEditorDeleteRequestSchema>;

export type SkillEditorGitChange = z.infer<typeof skillEditorGitChangeSchema>;

export type SkillEditorGitResponse = z.infer<typeof skillEditorGitResponseSchema>;

export type SkillEditorGitPreviewResponse = z.infer<typeof skillEditorGitPreviewResponseSchema>;

export type SkillEditorGitCommitRequest = z.infer<typeof skillEditorGitCommitRequestSchema>;
