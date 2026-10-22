import { useId, useRef, useState } from "react";
import type { HermesV2Response } from "./chat-types";
import {
  REQUEST_KIND_LABEL,
  type HermesV2SetupCardProps,
} from "./request-cards";

/** Native Setup-Karte: ausschließlich echte options mit IDs, Cancel ist picked:null. */
export function HermesV2SetupCard({
  request,
  blocked,
  blockedReason,
  onRespond,
}: HermesV2SetupCardProps) {
  const [, bump] = useState(0);
  const identityRef = useRef<{ identity: string; picked: string[] }>({
    identity: "",
    picked: [],
  });
  const identity = JSON.stringify([
    request.sessionId,
    request.epoch,
    request.key,
  ]);
  if (identityRef.current.identity !== identity)
    identityRef.current = { identity, picked: [] };
  const { picked } = identityRef.current;

  const setPicked = (id: string, checked: boolean) => {
    identityRef.current.picked = request.multiple
      ? checked
        ? [...picked, id]
        : picked.filter((entry) => entry !== id)
      : checked
        ? [id]
        : [];
    bump((count) => count + 1);
  };

  const respond = (pickedIds: string | string[] | null) => {
    const response: HermesV2Response = { kind: "setup", picked: pickedIds };
    onRespond(response);
  };

  const idPrefix = useId();
  return (
    <article
      className="hermesv2-request-card"
      aria-label={REQUEST_KIND_LABEL.setup}
    >
      <h3 className="hermesv2-request-card-title">
        {REQUEST_KIND_LABEL.setup}
      </h3>
      <p className="hermesv2-request-card-body">{request.question}</p>
      <fieldset
        className="hermesv2-question"
        disabled={blocked}
        aria-label="Auswahl"
      >
        <div
          className={
            request.multiple
              ? "hermesv2-question-options is-multiple"
              : "hermesv2-question-options"
          }
        >
          {request.options.map((option, index) => (
            <label
              key={option.id}
              className="hermesv2-question-choice"
              htmlFor={`${idPrefix}-${index}`}
            >
              <input
                id={`${idPrefix}-${index}`}
                type={request.multiple ? "checkbox" : "radio"}
                name={`${idPrefix}-setup`}
                checked={picked.includes(option.id)}
                disabled={blocked}
                onChange={(event) => setPicked(option.id, event.target.checked)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {blocked ? (
        <p className="hermesv2-request-card-note" role="status">
          {blockedReason}
        </p>
      ) : null}
      <div className="hermesv2-request-card-actions">
        <button
          type="button"
          className="quiet-button-primary"
          disabled={blocked || picked.length === 0}
          onClick={() => {
            if (picked.length === 0) return;
            respond(request.multiple ? picked : (picked[0] ?? null));
          }}
        >
          Auswählen
        </button>
        <button
          type="button"
          className="quiet-button"
          disabled={blocked}
          onClick={() => respond(null)}
        >
          Abbrechen
        </button>
      </div>
    </article>
  );
}
