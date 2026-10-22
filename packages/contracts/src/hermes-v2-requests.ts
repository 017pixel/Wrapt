import { z } from "zod";
import { hermesV2IdSchema } from "./hermes-v2-sessions.js";

export const hermesV2ApprovalChoiceSchema = z.enum(["once", "session", "always", "deny"]);
const answer = z.string().max(65_536).nullable();
const base = z.strictObject({
  key: z.string().uuid(), epoch: z.string().min(1).max(200),
  sessionId: hermesV2IdSchema, createdAt: z.number().nonnegative(),
});
export const hermesV2QuestionSchema = z.strictObject({
  id: hermesV2IdSchema, text: z.string().max(10_000),
  choices: z.array(z.string().max(2_000)).max(100), multiple: z.boolean(),
});
export const hermesV2RequestSchema = z.discriminatedUnion("kind", [
  base.extend({ kind: z.literal("approval"), method: z.literal("approval"),
    command: z.string().max(65_536), description: z.string().max(10_000),
    choices: z.array(hermesV2ApprovalChoiceSchema).min(1).max(4) }),
  base.extend({ kind: z.literal("clarify"), method: z.literal("clarify"),
    questions: z.array(hermesV2QuestionSchema).min(1).max(5),
    lockedAnswers: z.record(hermesV2IdSchema, answer) }),
  base.extend({ kind: z.literal("secret"),
    method: z.enum(["sudo", "secret", "vault.code", "vault.unlock_prompt", "vault.save_login"]),
    label: z.string().max(2_000), hint: z.string().max(10_000) }),
  base.extend({ kind: z.literal("setup"), method: z.literal("setup_choose"),
    question: z.string().max(10_000), multiple: z.boolean(),
    options: z.array(z.strictObject({ id: hermesV2IdSchema, label: z.string().max(2_000) })).max(100) }),
]);
export const hermesV2ResponseSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("approval"), choice: hermesV2ApprovalChoiceSchema }),
  z.strictObject({ kind: z.literal("clarify"), answers: z.record(hermesV2IdSchema, answer) }),
  z.strictObject({ kind: z.literal("cancel") }),
  z.strictObject({ kind: z.literal("secret"), value: z.string().max(65_536) }),
  z.strictObject({ kind: z.literal("setup"), picked: z.union([hermesV2IdSchema, z.array(hermesV2IdSchema).max(100), z.null()]) }),
]);
export type HermesV2Request = z.infer<typeof hermesV2RequestSchema>;
export type HermesV2Response = z.infer<typeof hermesV2ResponseSchema>;
