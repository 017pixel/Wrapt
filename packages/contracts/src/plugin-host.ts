import { z } from "zod";
import { notificationSchema } from "./notification-contracts.js";

export const pluginNotificationCreateSchema = notificationSchema.pick({ title: true, body: true, severity: true })
  .extend({ link: z.string().startsWith("/").max(512).nullable().default(null) });

export const pluginGitRequestSchema = z.object({
  projectId: z.string().min(1),
  staged: z.boolean().default(false),
});

export const pluginGitResponseSchema = z.object({
  projectId: z.string(),
  output: z.string(),
});

export const pluginTerminalCreateSchema = z.object({
  cwd: z.string().min(1).optional(),
  projectId: z.string().min(1).nullable().default(null),
  cols: z.number().int().min(2).max(500).default(100),
  rows: z.number().int().min(1).max(300).default(30),
});
