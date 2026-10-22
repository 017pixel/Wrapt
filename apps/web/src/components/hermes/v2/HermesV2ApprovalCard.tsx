import type { HermesV2Response } from "./chat-types";
import {
  REQUEST_KIND_LABEL,
  type ApprovalChoice,
  type HermesV2ApprovalCardProps,
} from "./request-cards";

const CHOICE_LABEL: Record<ApprovalChoice, string> = {
  once: "Einmal erlauben",
  session: "Für Sitzung erlauben",
  always: "Dauerhaft erlauben",
  deny: "Ablehnen",
};

/** Nur tatsächlich angebotene choices; die dauerhafte Option benennt die bleibende Entscheidung. */
const CHOICE_HINT: Record<ApprovalChoice, string | undefined> = {
  once: undefined,
  session: undefined,
  always:
    "Diese Entscheidung bleibt auch für künftige Anfragen dieser Art bestehen.",
  deny: undefined,
};

/** Native Approval-Karte: Beschreibung, Befehl als Code, ausschließlich echte choices. */
export function HermesV2ApprovalCard({
  request,
  blocked,
  blockedReason,
  onRespond,
}: HermesV2ApprovalCardProps) {
  const respond = (choice: ApprovalChoice) => {
    const response: HermesV2Response = { kind: "approval", choice };
    onRespond(response);
  };
  return (
    <article
      className="hermesv2-request-card"
      aria-label={REQUEST_KIND_LABEL.approval}
    >
      <h3 className="hermesv2-request-card-title">
        {REQUEST_KIND_LABEL.approval}
      </h3>
      <p className="hermesv2-request-card-body">{request.description}</p>
      <pre className="hermesv2-request-command">{request.command}</pre>
      {blocked ? (
        <p className="hermesv2-request-card-note" role="status">
          {blockedReason}
        </p>
      ) : null}
      <div className="hermesv2-request-card-actions">
        {request.choices.map((choice) => (
          <button
            key={choice}
            type="button"
            className={
              choice === "deny" ? "quiet-button" : "quiet-button-primary"
            }
            disabled={blocked}
            title={CHOICE_HINT[choice]}
            aria-label={
              CHOICE_HINT[choice]
                ? `${CHOICE_LABEL[choice]} – ${CHOICE_HINT[choice]}`
                : undefined
            }
            onClick={() => respond(choice)}
          >
            {CHOICE_LABEL[choice]}
          </button>
        ))}
      </div>
    </article>
  );
}
