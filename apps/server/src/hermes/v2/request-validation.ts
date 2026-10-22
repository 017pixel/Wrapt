import { hermesV2RequestSchema, type HermesV2Request, type HermesV2Response } from "@wrapt/contracts/hermes-v2";
import { GatewayError } from "./errors.js";
import { object, text } from "./normalize-values.js";
import type { UpstreamRequest } from "./types.js";

export const supportedRequestMethods = new Set(["approval", "clarify", "sudo", "secret", "vault.code", "vault.unlock_prompt", "vault.save_login", "setup_choose"]);

export function normalizeRequest(raw: UpstreamRequest, key: string, sessionId: string, epoch: string): HermesV2Request | null {
  const params = raw.params;
  const base = { key, sessionId, epoch, createdAt: Date.now(), method: raw.method };
  let value: unknown;
  if (raw.method === "approval") {
    value = { ...base, kind: "approval", command: text(params.command, 65_536), description: text(params.description, 10_000), choices: params.choices };
  } else if (raw.method === "clarify") {
    value = { ...base, kind: "clarify", questions: Array.isArray(params.questions) ? params.questions.map((entry) => {
      const question = object(entry);
      return { id: question.qid, text: text(question.question, 10_000), choices: Array.isArray(question.choices) ? question.choices.map((choice) => text(choice, 2_000)) : [], multiple: question.multi_select === true };
    }) : [], lockedAnswers: object(params.answers) };
  } else if (["sudo", "secret", "vault.code", "vault.unlock_prompt", "vault.save_login"].includes(raw.method)) {
    value = { ...base, kind: "secret", label: text(params.prompt ?? params.display_name ?? params.env_var ?? params.site ?? raw.method, 2_000), hint: text(params.command ?? params.hint ?? params.origin, 10_000) };
  } else if (raw.method === "setup_choose") {
    value = { ...base, kind: "setup", question: text(params.question, 10_000), multiple: params.multi_select === true, options: Array.isArray(params.options) ? params.options.map((entry) => ({ id: object(entry).id, label: text(object(entry).label, 2_000) })) : [] };
  } else return null;
  const result = hermesV2RequestSchema.safeParse(value);
  return result.success ? result.data : null;
}

function invalid(): never {
  throw new GatewayError("INVALID_MESSAGE", "Die Antwort passt nicht zur offenen Hermes-Anfrage.");
}

export function validateAnswer(request: HermesV2Request, response: HermesV2Response): Record<string, unknown> {
  if (request.kind === "approval" && response.kind === "approval") {
    if (!request.choices.includes(response.choice)) invalid();
    return { choice: response.choice };
  }
  if (request.kind === "clarify") {
    if (response.kind === "cancel") return {};
    if (response.kind !== "clarify") invalid();
    const questions = new Map(request.questions.map((question) => [question.id, question]));
    for (const [qid, answer] of Object.entries(response.answers)) {
      if (!questions.has(qid)) invalid();
      const locked = request.lockedAnswers[qid];
      if (locked !== undefined && locked !== answer) invalid();
    }
    // Freitext bleibt laut Hermes-Vertrag auch neben vorgegebenen Optionen zulässig.
    return { answers: { ...request.lockedAnswers, ...response.answers } };
  }
  if (request.kind === "secret" && response.kind === "secret") {
    if (request.method === "vault.save_login" && response.value) {
      let value: unknown;
      try { value = JSON.parse(response.value); } catch { invalid(); }
      const login = object(value);
      if (typeof login.identifier !== "string" || typeof login.password !== "string" || Object.keys(login).some((key) => !["identifier", "password"].includes(key))) invalid();
    }
    return { value: response.value };
  }
  if (request.kind === "setup" && response.kind === "setup") {
    const ids = response.picked === null ? [] : Array.isArray(response.picked) ? response.picked : [response.picked];
    if ((!request.multiple && ids.length > 1) || new Set(ids).size !== ids.length || ids.some((id) => !request.options.some((option) => option.id === id))) invalid();
    return { picked: response.picked };
  }
  return invalid();
}
