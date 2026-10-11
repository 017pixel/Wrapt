import { useEffect, useState } from "react";
import { ModalFrame } from "../ModalDialog";
import { isValidSkillName } from "../../lib/skillEditor";

export type NewSkillMode = "skills" | "hermes";

interface NewSkillDialogProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; description: string; license?: string; category?: string }) => void;
  mode?: NewSkillMode;
  /** Bestehende Hermes-Kategorien als Vorschläge; freie Eingabe bleibt möglich. */
  categories?: string[];
}

export function NewSkillDialog({ open, busy, onClose, onCreate, mode = "skills", categories = [] }: NewSkillDialogProps) {
  const hermes = mode === "hermes";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [license, setLicense] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setLicense("");
    setCategory("");
  }, [open, mode]);

  const nameTouched = name.trim().length > 0;
  const nameValid = isValidSkillName(name);
  const categoryTouched = category.trim().length > 0;
  const categoryValid = isValidSkillName(category);
  const valid = nameValid && description.trim().length > 0 && (!hermes || categoryValid);

  return (
    <ModalFrame
      open={open}
      title={hermes ? "Hermes-Skill anlegen" : "Neuen Skill anlegen"}
      description={hermes
        ? "Der Hermes-Skill entsteht in der gewählten Kategorie und steht den Hermes-Agenten zur Verfügung."
        : "Der Skill entsteht im Skills-Repository und wird an alle angebundenen Harnesses verteilt."}
      className="new-skill-dialog"
      onClose={onClose}
    >
      {(requestClose) => (
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid || busy) return;
            onCreate({
              name: name.trim(),
              description: description.trim(),
              ...(license.trim() ? { license: license.trim() } : {}),
              ...(hermes ? { category: category.trim() } : {}),
            });
            requestClose();
          }}
        >
          <div className="skill-field">
            <label htmlFor={`new-skill-name-${mode}`}>Name</label>
            <input
              id={`new-skill-name-${mode}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="mein-neuer-skill"
              maxLength={64}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-invalid={nameTouched && !nameValid}
              aria-describedby={`new-skill-name-hint-${mode}`}
            />
            <p id={`new-skill-name-hint-${mode}`} className={`skill-dialog-hint ${nameTouched && !nameValid ? "is-bad" : ""}`}>
              Kleinbuchstaben, Ziffern und Bindestriche. Der Name wird zum Ordnernamen.
            </p>
          </div>
          {hermes ? (
            <div className="skill-field">
              <label htmlFor="new-hermes-category">Kategorie</label>
              <input
                id="new-hermes-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="kategorie wählen oder neu tippen"
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                list="new-hermes-category-suggestions"
                aria-invalid={categoryTouched && !categoryValid}
                aria-describedby="new-hermes-category-hint"
              />
              <datalist id="new-hermes-category-suggestions">
                {categories.map((entry) => <option key={entry} value={entry} />)}
              </datalist>
              <p id="new-hermes-category-hint" className={`skill-dialog-hint ${categoryTouched && !categoryValid ? "is-bad" : ""}`}>
                Bestandsliste als Vorschlag — freie Eingabe möglich. Gleiche Regeln wie beim Skillnamen.
              </p>
            </div>
          ) : null}
          <div className="skill-field">
            <label htmlFor={`new-skill-description-${mode}`}>Beschreibung</label>
            <input
              id={`new-skill-description-${mode}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Wofür ist dieser Skill da und wann soll er greifen?"
              maxLength={1_024}
              aria-describedby={`new-skill-description-hint-${mode}`}
            />
            <p id={`new-skill-description-hint-${mode}`} className="skill-dialog-hint">Pflichtfeld — ohne Beschreibung lädt kein Agent den Skill.</p>
          </div>
          <div className="skill-field">
            <label htmlFor={`new-skill-license-${mode}`}>Lizenz (optional)</label>
            <input
              id={`new-skill-license-${mode}`}
              value={license}
              onChange={(event) => setLicense(event.target.value)}
              placeholder="MIT"
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="quiet-button" onClick={requestClose}>Abbrechen</button>
            <button type="submit" className="quiet-button-primary" disabled={!valid || busy}>Anlegen</button>
          </div>
        </form>
      )}
    </ModalFrame>
  );
}
