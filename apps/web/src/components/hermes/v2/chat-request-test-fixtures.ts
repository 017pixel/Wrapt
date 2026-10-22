import { hermesV2RequestSchema, type HermesV2Request } from "@wrapt/contracts/hermes-v2";
export const requestKey = "00000000-0000-4000-8000-000000000001";
export const otherRequestKey = "00000000-0000-4000-8000-000000000002";
export const approval = (sessionId = "a", patch: Partial<Extract<HermesV2Request, { kind: "approval" }>> = {}): HermesV2Request => hermesV2RequestSchema.parse({
  key: requestKey, epoch: "epoch", sessionId, createdAt: 1, kind: "approval", method: "approval",
  description: "Befehl freigeben", command: "echo test", choices: ["once", "deny"], ...patch,
});
export const clarify = (sessionId = "a", patch: Partial<Extract<HermesV2Request, { kind: "clarify" }>> = {}): HermesV2Request => hermesV2RequestSchema.parse({
  key: requestKey, epoch: "epoch", sessionId, createdAt: 1, kind: "clarify", method: "clarify", lockedAnswers: {},
  questions: [{ id: "q1", text: "Erste Frage", choices: ["A", "B"], multiple: true },
    { id: "q2", text: "Zweite Frage", choices: [], multiple: false }], ...patch,
});
export const secret = (sessionId = "a", method: "secret" | "sudo" | "vault.code" | "vault.unlock_prompt" | "vault.save_login" = "secret"): HermesV2Request => hermesV2RequestSchema.parse({
  key: requestKey, epoch: "epoch", sessionId, createdAt: 1, kind: "secret", method, label: "Synthetischer Testwert", hint: "",
});
