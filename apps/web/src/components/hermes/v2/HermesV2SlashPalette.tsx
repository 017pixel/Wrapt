// Slashpalette am Composer: listbox mit aktivescendant, keine Fokusfalle.
import type { HermesV2Command } from "@wrapt/contracts/hermes-v2";
import { slashDescription, slashHint, type SlashEntry } from "./composer-slash";

export interface HermesV2SlashPaletteProps {
  open: boolean;
  /** Vorberechnete gefilterte Reihenfolge des Orchesters. */
  entries: readonly SlashEntry[];
  listId: string;
  /** Aktive Positionsindex in der übergebenen Reihenfolge. */
  activeIndex: number;
  onActiveIndex: (index: number) => void;
  onPick: (entry: SlashEntry) => void;
  /** Explizit schließen (Escape oder Klick außerhalb); kein heimlicher Versand. */
  onDismiss: () => void;
}

/** Animation nur transform/opacity, reduced-motion im Stylesheet. */
export function HermesV2SlashPalette(props: HermesV2SlashPaletteProps) {
  const {
    open,
    entries,
    listId,
    activeIndex,
    onActiveIndex,
    onPick,
    onDismiss,
  } = props;
  if (!open) return null;
  if (entries.length === 0) {
    return (
      <div className="hermesv2-slash" role="status">
        Kein Befehl im dynamischen Katalog. Die klassische Oberfläche kennt
        mehr.
      </div>
    );
  }
  const active = Math.min(Math.max(activeIndex, 0), entries.length - 1);
  return (
    <div
      className="hermesv2-slash"
      id={listId}
      role="listbox"
      aria-label="Hermes-Befehle"
    >
      {entries.map((entry, index) => {
        const command: HermesV2Command = entry.command;
        const disabled =
          Boolean(command.disabledReason) || command.kind === "unsupported";
        return (
          <div
            key={command.key}
            id={`${listId}-option-${index}`}
            role="option"
            aria-selected={index === active}
            aria-disabled={disabled || undefined}
            className={`hermesv2-slash-option${disabled ? " is-disabled" : ""}${index === active ? " is-active" : ""}`}
            data-slash-key={command.key}
            data-slash-kind={command.kind}
            onPointerDown={(event) => {
              // Pointer statt Klick: die Palette darf der Textarea den Fokus
              // nicht wegnehmen, sonst bricht die IME-Kette.
              event.preventDefault();
              if (disabled) return;
              onActiveIndex(index);
              onPick(entry);
              onDismiss();
            }}
            onPointerEnter={() => onActiveIndex(index)}
          >
            <div className="hermesv2-slash-line">
              <code className="hermesv2-slash-key">{command.key}</code>
              <span className="hermesv2-slash-label">{command.label}</span>
              <span className="hermesv2-slash-tag">
                {tagLabel(command.kind)}
              </span>
              {aliasesInfo(command)}
            </div>
            <div className="hermesv2-slash-detail">
              {disabled
                ? (command.disabledReason ??
                  "Nur in der klassischen Oberfläche verfügbar.")
                : slashDescription(command)}
              {slashHint(command) ? (
                <span className="hermesv2-slash-hint">
                  {slashHint(command)}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function tagLabel(kind: HermesV2Command["kind"]): string {
  return kind === "builtin" ? "Befehl" : kind === "skill" ? "Skill" : "Classic";
}

function aliasesInfo(command: HermesV2Command) {
  const aliases = command.aliases ?? [];
  if (aliases.length === 0) return null;
  return (
    <span className="hermesv2-slash-aliases">
      Alias {aliases.slice(0, 3).join(" · ")}
    </span>
  );
}
