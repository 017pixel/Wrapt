import { hermesV2ResponseSchema } from "@wrapt/contracts/hermes-v2";
import type { HermesV2Request, HermesV2Response } from "./chat-types";
import { ChatError } from "./gateway-protocol";

const invalid = (): never => { throw new ChatError("INVALID_MESSAGE", "Die Antwort passt nicht zur aktuellen Anfrage."); };
/** Werte bleiben ausschließlich im flüchtigen Transportpfad. */
export function requestResponse(request: HermesV2Request, supplied: HermesV2Response): HermesV2Response {
  const parsed = hermesV2ResponseSchema.safeParse(supplied);
  if (!parsed.success) return invalid();
  const response = parsed.data;
  if (request.kind === "approval" && response.kind === "approval" && request.choices.includes(response.choice)) return response;
  if (request.kind === "clarify") {
    if (response.kind === "cancel") return response;
    if (response.kind !== "clarify" || Object.keys(response.answers).some((id) => !request.questions.some((question) => question.id === id))) return invalid();
    return { kind: "clarify", answers: { ...response.answers, ...request.lockedAnswers } };
  }
  if (request.kind === "secret" && response.kind === "secret") return response;
  if (request.kind === "setup" && response.kind === "setup") {
    const picked = response.picked === null ? [] : Array.isArray(response.picked) ? response.picked : [response.picked];
    if ((!request.multiple && picked.length > 1) || new Set(picked).size !== picked.length
      || picked.some((id) => !request.options.some((option) => option.id === id))) return invalid();
    return response;
  }
  return invalid();
}
