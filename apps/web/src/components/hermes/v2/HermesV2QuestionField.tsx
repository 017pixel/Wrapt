import { useId } from "react";
import type { ClarifyQuestion } from "./request-cards";

export interface HermesV2QuestionValue {
  choices: string[];
  text: string;
}

export interface HermesV2QuestionFieldProps {
  question: ClarifyQuestion;
  /** Bestätigte Serverantwort einer frühen Lock-Aktion; null = ausdrücklich übersprungen. */
  lockedAnswer: string | null | undefined;
  value: HermesV2QuestionValue;
  disabled: boolean;
  onChange: (value: HermesV2QuestionValue) => void;
}

function formatAnswer(answer: string): string {
  try {
    const parsed: unknown = JSON.parse(answer);
    if (Array.isArray(parsed))
      return parsed.map((entry) => String(entry)).join(", ");
  } catch {
    // Reiner Freitext ohne JSON-Gehalt bleibt unverändert.
  }
  return answer;
}

/** Eine echte Frage als Radio- oder Checkboxgruppe, Freitext bleibt zusätzlich zulässig. */
export function HermesV2QuestionField({
  question,
  lockedAnswer,
  value,
  disabled,
  onChange,
}: HermesV2QuestionFieldProps) {
  const id = useId();
  const fieldName = `${id}-choice`;
  const eindeutig = (index: number) => `${id}-opt-${index}`;

  if (lockedAnswer !== undefined) {
    return (
      <div className="hermesv2-question" data-locked="true">
        <p className="hermesv2-question-label">{question.text}</p>
        <p className="hermesv2-question-locked">
          {lockedAnswer === null
            ? "Übersprungen"
            : `Gesicherte Antwort: ${formatAnswer(lockedAnswer)}`}
        </p>
      </div>
    );
  }

  const toggle = (choice: string, checked: boolean) => {
    if (question.multiple) {
      const next = checked
        ? [...value.choices, choice]
        : value.choices.filter((entry) => entry !== choice);
      onChange({ choices: next, text: value.text });
    } else {
      onChange({ choices: checked ? [choice] : [], text: "" });
    }
  };

  return (
    <fieldset className="hermesv2-question" disabled={disabled}>
      <legend className="hermesv2-question-label">{question.text}</legend>
      <div
        className={
          question.multiple
            ? "hermesv2-question-options is-multiple"
            : "hermesv2-question-options"
        }
      >
        {question.choices.map((choice, index) => (
          <label
            key={choice}
            className="hermesv2-question-choice"
            htmlFor={eindeutig(index)}
          >
            <input
              id={eindeutig(index)}
              type={question.multiple ? "checkbox" : "radio"}
              name={fieldName}
              checked={value.choices.includes(choice)}
              disabled={disabled}
              onChange={(event) => toggle(choice, event.target.checked)}
            />
            <span>{choice}</span>
          </label>
        ))}
      </div>
      <label className="hermesv2-field" htmlFor={`${id}-text`}>
        Freitext
        <input
          id={`${id}-text`}
          type="text"
          className="hermesv2-question-input"
          value={value.text}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) =>
            onChange({
              choices: question.multiple ? value.choices : [],
              text: event.target.value,
            })
          }
        />
      </label>
    </fieldset>
  );
}
