import { eventModifiers, modifierKey, sameModifiers, shortcutActions, type ShortcutAction, type ShortcutPreferences } from "../../config/shortcuts";
import { numberShortcutIndex } from "./navigationTargets";

interface Options {
  preferences(): ShortcutPreferences;
  numbersAllowed(): boolean;
  recording(): boolean;
  showNumbers(show: boolean): void;
  navigateNumber(index: number): boolean;
  execute(action: ShortcutAction): boolean;
}

/** Liefert synchron zurück, ob das Werkzeug die Taste noch erhalten darf. */
export function createShortcutController(options: Options) {
  const swallowed = new Set<string>();
  let cancelled = false;
  const reset = () => { options.showNumbers(false); cancelled = false; swallowed.clear(); };
  const handle = (event: KeyboardEvent): boolean => {
    if (options.recording()) { options.showNumbers(false); return false; }
    if (event.type === "keyup") {
      const consumed = swallowed.delete(event.code);
      const numbers = options.preferences().numbers;
      if (!numbers || !sameModifiers(eventModifiers(event), numbers)) {
        options.showNumbers(false);
        cancelled = false;
      }
      return consumed;
    }
    if (event.type === "keypress") return swallowed.has(event.code);
    if (event.isComposing || event.key === "Process" || event.getModifierState?.("AltGraph")) { options.showNumbers(false); return false; }
    const preferences = options.preferences();
    const modifiers = eventModifiers(event);
    const numbers = preferences.numbers && sameModifiers(modifiers, preferences.numbers);
    const showing = !!numbers && !cancelled && options.numbersAllowed();
    options.showNumbers(showing);
    if (numbers && event.code === "Escape") {
      cancelled = true;
      options.showNumbers(false);
      swallowed.add(event.code);
      return true;
    }
    if (modifierKey(event.code)) return false;
    // Die Wiederholung einer behandelten Taste darf nicht in der Shell landen.
    if (event.repeat && swallowed.has(event.code)) return true;
    const index = numberShortcutIndex(event.code);
    if (showing && index !== null && !event.repeat && options.navigateNumber(index)) {
      swallowed.add(event.code);
      return true;
    }
    const action = shortcutActions.find((candidate) => {
      const binding = preferences.bindings[candidate];
      return binding?.code === event.code && sameModifiers(modifiers, binding);
    });
    if (action && !event.repeat && options.execute(action)) {
      options.showNumbers(false);
      swallowed.add(event.code);
      return true;
    }
    return false;
  };
  return { handle, reset };
}
