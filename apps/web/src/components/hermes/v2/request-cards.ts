import type {
  ChatConnectionView,
  ChatRequestState,
  HermesV2Chat,
  HermesV2Request,
  HermesV2Response,
} from "./chat-types";

export type ApprovalChoice = Extract<
  HermesV2Request,
  { kind: "approval" }
>["choices"][number];
export type ClarifyQuestion = Extract<
  HermesV2Request,
  { kind: "clarify" }
>["questions"][number];

export type HermesV2RequestCardProps = {
  request: HermesV2Request;
  blocked: boolean;
  blockedReason: string | null;
  onRespond: (response: HermesV2Response) => void;
  onLock: (questionId: string, answer: string | null) => void;
};

/** Kartenprops je Art mit passend narrowser Request-Typ. */
type WithRequest<K extends HermesV2Request["kind"]> = Omit<
  HermesV2RequestCardProps,
  "request"
> & {
  request: Extract<HermesV2Request, { kind: K }>;
};
export type HermesV2ApprovalCardProps = WithRequest<"approval">;
export type HermesV2ClarifyCardProps = WithRequest<"clarify">;
export type HermesV2SecretCardProps = WithRequest<"secret">;
export type HermesV2SetupCardProps = WithRequest<"setup">;

export const REQUEST_KIND_LABEL = {
  approval: "Freigabe angefragt",
  clarify: "Rückfrage",
  secret: "Geheime Eingabe angefragt",
  setup: "Einrichtung angefragt",
} as const satisfies Record<HermesV2Request["kind"], string>;

/** Opaque Identität einer Anfrage über Aliasansichten hinweg; kollisionsfrei. */
export function requestEpochId(request: HermesV2Request): string {
  return JSON.stringify([request.epoch, request.key]);
}

export interface RequestBlockInput {
  interactive: boolean;
  connectionState: ChatConnectionView["state"];
  writable: boolean;
  requestState: ChatRequestState | undefined;
}

const STATE_REASONS: Record<"pending" | "unknown", string> = {
  pending: "Eine Antwort wird gerade übermittelt.",
  unknown:
    "Der Ausgang einer vorherigen Antwort ist unklar; bitte zuerst abgleichen.",
};

/**
 * Ehrlicher Sperrgrund. Die synchrone Klicksperre kommt ergänzend vom Deck;
 * hier zählt nur der zustandsbasierte Teil.
 */
export function requestBlock({
  interactive,
  connectionState,
  writable,
  requestState,
}: RequestBlockInput): { blocked: boolean; reason: string | null } {
  if (requestState)
    return { blocked: true, reason: STATE_REASONS[requestState.status] };
  if (!interactive)
    return {
      blocked: true,
      reason: "Diese Fläche ist gerade nicht aktiv; Anfragen sind gesperrt.",
    };
  if (connectionState !== "online") {
    return {
      blocked: true,
      reason:
        connectionState === "incompatible"
          ? "Die Hermes-Verbindung ist nicht kompatibel."
          : connectionState === "reconnecting" ||
              connectionState === "connecting"
            ? "Die Verbindunganfrage läuft; bitte kurz warten."
            : "Keine Verbindung zu Hermes.",
    };
  }
  if (!writable)
    return { blocked: true, reason: "Nur lesender Zugriff auf diese Sitzung." };
  return { blocked: false, reason: null };
}

/** Gemeinsamer lokaler Status: pending/unknown für key+epoch, sonst Abwesenheit. */
export function findRequestState(
  states: HermesV2Chat["requestStates"],
  request: HermesV2Request,
): ChatRequestState | undefined {
  return states.find(
    (state) => state.key === request.key && state.epoch === request.epoch,
  );
}

/**
 * Freitext bleibt neben Choices zulässig; Mehrfachauswahl wird als
 * JSON.stringify(string[]) im Stringantwortfeld übertragen.
 */
export function deriveClarifyAnswer(
  question: ClarifyQuestion,
  draft: { choices: readonly string[]; text: string },
): string | null {
  const text = draft.text.trim();
  if (question.multiple) {
    const parts = [...draft.choices, ...(text ? [text] : [])];
    return parts.length > 0 ? JSON.stringify(parts) : null;
  }
  if (text) return text;
  return draft.choices[0] ?? null;
}
