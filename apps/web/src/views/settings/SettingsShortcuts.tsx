import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Card } from "../../components/Card";
import { defaultShortcuts, eventModifiers, hasModifiers, modifierKey, normalizeShortcuts, shortcutActions, shortcutConflict, shortcutLabels, shortcutText, type ShortcutAction, type ShortcutBinding, type ShortcutModifiers } from "../../config/shortcuts";
import { useAppPreferences } from "../../stores/appPreferences";
import { useShortcutState } from "../../components/shortcuts/shortcutState";

type Recording = ShortcutAction | "numbers";

export function SettingsShortcuts() {
  const preferences = useAppPreferences((state) => state.shortcuts);
  const save = useAppPreferences((state) => state.setShortcuts);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modifiers = useRef<ShortcutModifiers | null>(null);
  const [pending, setPending] = useState<ShortcutModifiers | null>(null);
  useEffect(() => () => { useShortcutState.setState({ recording: false }); }, []);

  const stop = () => {
    useShortcutState.setState({ recording: false });
    setRecording(null);
    setPending(null);
    modifiers.current = null;
  };
  const start = (id: Recording) => {
    setError(null);
    setRecording(id);
    modifiers.current = null;
    setPending(null);
    useShortcutState.setState({ recording: true, showingNumbers: false });
  };
  const apply = (id: Recording, value: ShortcutBinding | ShortcutModifiers | null) => {
    const next = id === "numbers" ? { ...preferences, numbers: value } : {
      ...preferences, bindings: { ...preferences.bindings, [id]: value },
    };
    const conflict = shortcutConflict(next);
    if (conflict) { setError(conflict); return; }
    save(next);
    setError(null);
    stop();
  };
  const keyDown = (id: Recording, event: KeyboardEvent<HTMLButtonElement>) => {
    if (recording !== id) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Escape") { stop(); return; }
    if (event.nativeEvent.isComposing || event.getModifierState("AltGraph")) return;
    const current = eventModifiers(event);
    if (id === "numbers") {
      if (modifierKey(event.code) && hasModifiers(current)) {
        modifiers.current = current;
        setPending(current);
      } else setError("Halte nur Zusatztasten wie Ctrl, Shift, Alt oder Command und lasse sie los.");
      return;
    }
    if (modifierKey(event.code)) return;
    if (!hasModifiers(current) || !/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9])|Space|Arrow(Up|Down|Left|Right))$/.test(event.code)) {
      setError("Drücke mindestens eine Zusatztaste und einen Buchstaben, eine Zahl, Pfeil- oder Funktionstaste.");
      return;
    }
    apply(id, { ...current, code: event.code });
  };

  const rows: { id: Recording; label: string }[] = [
    { id: "numbers", label: "Seitenwahl mit 1–9 und 0" },
    ...shortcutActions.map((id) => ({ id, label: shortcutLabels[id] })),
  ];
  return <div id="settings-shortcuts"><Card title="Tastenkürzel" action={
    <button type="button" className="quiet-button" onClick={() => { stop(); setError(null); save(normalizeShortcuts(defaultShortcuts)); }}>Zurücksetzen</button>
  }>
    <p className="settings-section-note">Halte die Zusatztasten der Seitenwahl: Die ersten zehn Seiten zeigen ihre Nummer. Direktkürzel haben Vorrang vor den eingebetteten Werkzeugen. Browser- und Systembelegungen können Vorrang haben.</p>
    <div className="shortcut-settings-list">
      {rows.map(({ id, label }) => {
        const value = id === "numbers" ? preferences.numbers : preferences.bindings[id];
        const active = recording === id;
        return <div className="shortcut-settings-row" key={id}>
          <span>{label}</span>
          <button type="button" className={`shortcut-record-button${active ? " is-recording" : ""}`}
            aria-label={`${label}: Tastenkürzel ändern`} aria-pressed={active} data-shortcut-recording={active || undefined}
            onClick={() => active ? stop() : start(id)} onKeyDown={(event) => keyDown(id, event)}
            onKeyUp={(event) => {
              if (!active) return;
              event.preventDefault(); event.stopPropagation();
              if (id === "numbers" && modifiers.current) apply(id, modifiers.current);
            }} onBlur={() => { if (active) stop(); }}>
            <kbd>{active ? pending ? `${shortcutText(pending)} …` : "Kombination drücken …" : shortcutText(value)}</kbd>
          </button>
          <button type="button" className="shortcut-enable-button" role="switch" aria-checked={!!value}
            aria-label={`${label} aktivieren`} onClick={() => apply(id, value ? null : id === "numbers" ? defaultShortcuts.numbers : defaultShortcuts.bindings[id])}>
            <span className={`settings-toggle-switch${value ? " is-on" : ""}`} aria-hidden="true"><span className="settings-toggle-thumb" /></span>
          </button>
        </div>;
      })}
    </div>
    {error ? <p className="shortcut-settings-error" role="alert">{error}</p> : null}
    {recording ? <p className="settings-section-note" role="status">{recording === "numbers" ? "Zusatztasten halten und zum Speichern loslassen." : "Neue Kombination drücken."} Escape bricht ab.</p> : null}
  </Card></div>;
}
