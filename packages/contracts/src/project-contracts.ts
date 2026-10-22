import { z } from "zod";
import { isoDateSchema, serviceModeSchema } from "./host-system.js";
import { previewDependencySchema } from "./preview-sessions.js";

export const previewPathSchema = z.string().startsWith("/").max(4_096).refine(
  (value) => !value.startsWith("//") && !value.includes("\\") && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
  "Preview-Pfade müssen relative Root-Pfade ohne Backslashes oder Steuerzeichen sein.",
);

export const previewSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  url: z.url().nullable().default(null),
  targetPort: z.number().int().min(1).max(65_535).nullable().default(null),
  path: previewPathSchema.default("/"),
  mode: serviceModeSchema,
  dependencies: z.array(previewDependencySchema).max(11).default([]),
});

export const projectAvailabilitySchema = z.enum([
  "available",
  "missing",
  "inaccessible",
  "symlink",
]);

export const projectActivitySchema = z.object({
  lastWorkbenchUseAt: isoDateSchema.nullable(),
  lastFilesystemChangeAt: isoDateSchema.nullable(),
  lastGitCommitAt: isoDateSchema.nullable(),
  effectiveAt: isoDateSchema.nullable(),
});

export const projectSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string(),
  path: z.string().startsWith("/"),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  availability: projectAvailabilitySchema,
  activity: projectActivitySchema,
  previews: z.array(previewSchema),
  links: z.object({
    t3Code: z.url().nullable(),
    codeServer: z.url().nullable(),
  }),
});

export const projectsResponseSchema = z.object({
  projects: z.array(projectSchema),
  projectsRoot: z.string().startsWith("/"),
  recentLimit: z.number().int().min(3).max(20).default(8),
});

export const projectResponseSchema = z.object({ project: projectSchema });

export const projectActivityTouchResponseSchema = z.object({
  projectId: z.string().min(1),
  lastUsedAt: isoDateSchema,
});

export const registerProjectRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
});

export const registerProjectResponseSchema = z.object({
  project: projectSchema,
  created: z.boolean(),
});

export const createProjectFileRequestSchema = z.object({
  path: z.string().trim().min(1).max(512),
  content: z.string().max(1_000_000),
  overwrite: z.boolean().default(false),
  expectedVersion: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

export const projectFileResponseSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  created: z.boolean(),
  version: z.string().regex(/^[0-9a-f]{64}$/),
});

export type Preview = z.infer<typeof previewSchema>;

export type Project = z.infer<typeof projectSchema>;

export type ProjectActivity = z.infer<typeof projectActivitySchema>;

export type ProjectsResponse = z.infer<typeof projectsResponseSchema>;

export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export type ProjectActivityTouchResponse = z.infer<typeof projectActivityTouchResponseSchema>;

export type RegisterProjectRequest = z.infer<typeof registerProjectRequestSchema>;

export type RegisterProjectResponse = z.infer<typeof registerProjectResponseSchema>;

export type CreateProjectFileRequest = z.infer<typeof createProjectFileRequestSchema>;

export type ProjectFileResponse = z.infer<typeof projectFileResponseSchema>;
