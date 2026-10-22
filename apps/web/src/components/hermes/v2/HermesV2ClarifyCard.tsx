import { useRef, useState } from "react";
import type { HermesV2Request, HermesV2Response } from "./chat-types";
import {
  REQUEST_KIND_LABEL,
  type HermesV2ClarifyCardProps,
  deriveClarifyAnswer,
  type ClarifyQuestion,
} from "./request-cards";
import {
  HermesV2QuestionField,
  type HermesV2QuestionValue,
} from "./HermesV2QuestionField";

type Drafts = Record<string, HermesV2QuestionValue>;

function seedDrafts(
  request: Extract<HermesV2Request, { kind: "clarify" }>,
): Drafts {
  const drafts: Drafts = {};
  for (const question of request.questions) {
    if (question.id in request.lockedAnswers) continue;
    drafts[question.id] = { choices: [], text: "" };
  }
  return drafts;
}

/**
 * native Clarify-Karte: alle ein bis fünf echten Fragen, frühe Lock-Antworten
 * und Gesamtantwort teilen sich eine Sperre; bestätigte Werte sind
 * schreibgeschützt. Eingaben anderer Fragen bleiben bei neuen Snapshots
 * desselben Requests erhalten.
 */
export function HermesV2ClarifyCard({
  request,
  blocked,
  blockedReason,
  onRespond,
  onLock,
}: HermesV2ClarifyCardProps) {
  const [, bump] = useState(0);
  const draftRef = useRef<{ identity: string; drafts: Drafts }>({
    identity: "",
    drafts: {},
  });
  const identity = JSON.stringify([
    request.sessionId,
    request.epoch,
    request.key,
  ]);
  if (draftRef.current.identity !== identity)
    draftRef.current = { identity, drafts: seedDrafts(request) };
  const { drafts } = draftRef.current;

  const setDraft = (questionId: string, value: HermesV2QuestionValue) => {
    drafts[questionId] = value;
    bump((count) => count + 1);
  };

  const answerFor = (question: ClarifyQuestion): string | null => {
    const locked = request.lockedAnswers[question.id];
    if (locked !== undefined) return locked;
    const draft = drafts[question.id] ?? { choices: [], text: "" };
    return deriveClarifyAnswer(question, draft);
  };

  const respondAll = () => {
    const answers: Record<string, string | null> = {};
    for (const question of request.questions)
      answers[question.id] = answerFor(question);
    const response: HermesV2Response = { kind: "clarify", answers };
    onRespond(response);
  };

  const cancel = () => {
    const response: HermesV2Response = { kind: "cancel" };
    onRespond(response);
  };

  return (
    <article
      className="hermesv2-request-card"
      aria-label={REQUEST_KIND_LABEL.clarify}
    >
      <h3 className="hermesv2-request-card-title">
        {REQUEST_KIND_LABEL.clarify}
      </h3>
      <div className="hermesv2-request-card-questions">
        {request.questions.map((question) => (
          <div key={question.id} className="hermesv2-question-wrap">
            <HermesV2QuestionField
              question={question}
              lockedAnswer={request.lockedAnswers[question.id]}
              value={drafts[question.id] ?? { choices: [], text: "" }}
              disabled={blocked}
              onChange={(value) => setDraft(question.id, value)}
            />
            {request.lockedAnswers[question.id] === undefined && !blocked ? (
              <div className="hermesv2-question-actions">
                <button
                  type="button"
                  className="quiet-button"
                  disabled={answerFor(question) === null}
                  onClick={() => onLock(question.id, answerFor(question))}
                >
                  Antwort sichern
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => onLock(question.id, null)}
                >
                  Überspringen
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {blocked ? (
        <p className="hermesv2-request-card-note" role="status">
          {blockedReason}
        </p>
      ) : null}
      <div className="hermesv2-request-card-actions">
        <button
          type="button"
          className="quiet-button-primary"
          disabled={blocked}
          onClick={respondAll}
        >
          Antworten senden
        </button>
        <button
          type="button"
          className="quiet-button"
          disabled={blocked}
          onClick={cancel}
        >
          Abbrechen
        </button>
      </div>
    </article>
  );
}
