export const shortcutActions = ["settings", "usage", "plugins", "server", "limits"] as const;
export type ShortcutAction = typeof shortcutActions[number];
export type ShortcutModifiers = { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
export type ShortcutBinding = ShortcutModifiers & { code: string };
export interface ShortcutPreferences {
  numbers: ShortcutModifiers | null;
  bindings: Record<ShortcutAction, ShortcutBinding | null>;
}
export const shortcutLabels: Record<ShortcutAction, string> = {
  settings: "Einstellungen", usage: "Nutzung und Limits", plugins: "Plugins",
  server: "Server wechseln", limits: "Limits-Popup",
};
const modifiers: ShortcutModifiers = { ctrl: true, shift: true, alt: false, meta: false };
export const defaultShortcuts: ShortcutPreferences = {
  numbers: modifiers,
  bindings: Object.fromEntries(shortcutActions.map((action, index) => [action,
    { ...modifiers, code: ["KeyE", "KeyN", "KeyP", "KeyS", "KeyL"][index] },
  ])) as ShortcutPreferences["bindings"],
};

export function eventModifiers(event: Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "altKey" | "metaKey">): ShortcutModifiers {
  return { ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, meta: event.metaKey };
}
export function sameModifiers(left: ShortcutModifiers, right: ShortcutModifiers): boolean {
  return left.ctrl === right.ctrl && left.shift === right.shift && left.alt === right.alt && left.meta === right.meta;
}
export function hasModifiers(value: ShortcutModifiers): boolean {
  return value.ctrl || value.shift || value.alt || value.meta;
}
export function modifierKey(code: string): boolean {
  return /^(Control|Shift|Alt|Meta)(Left|Right)$/.test(code);
}
export function shortcutText(binding: ShortcutModifiers & { code?: string } | null): string {
  if (!binding) return "Deaktiviert";
  return [binding.ctrl && "Ctrl", binding.alt && "Alt", binding.shift && "Shift", binding.meta && "Command",
    binding.code?.replace(/^(Key|Digit|Numpad)/, "").replace("Space", "Leertaste")].filter(Boolean).join(" + ");
}
function validModifiers(value: unknown): value is ShortcutModifiers {
  return !!value && typeof value === "object" && ["ctrl", "shift", "alt", "meta"].every((key) => typeof (value as Record<string, unknown>)[key] === "boolean") && hasModifiers(value as ShortcutModifiers);
}
export function normalizeShortcuts(value: unknown): ShortcutPreferences {
  const raw = value && typeof value === "object" ? value as Partial<ShortcutPreferences> & { windows?: Partial<ShortcutPreferences> } : {};
  const bindings = { ...defaultShortcuts.bindings };
  for (const action of shortcutActions) {
    const binding = raw.bindings?.[action];
    if (binding === null) bindings[action] = null;
    else if (validModifiers(binding) && typeof binding.code === "string" && /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9])|Space|Arrow(Up|Down|Left|Right))$/.test(binding.code)) bindings[action] = { ...binding };
  }
  const numbers = raw.numbers === null ? null : validModifiers(raw.numbers) ? { ...raw.numbers } : { ...defaultShortcuts.numbers! };
  // Auch ältere oder fremde Synchronisationswerte müssen eindeutig bedienbar bleiben.
  const accepted: ShortcutBinding[] = [];
  for (const action of shortcutActions) {
    const binding = bindings[action];
    if (!binding) continue;
    const overlapsNumbers = numbers && /^Digit\d$/.test(binding.code) && sameModifiers(binding, numbers);
    const duplicate = accepted.some((other) => other.code === binding.code && sameModifiers(binding, other));
    if (overlapsNumbers || duplicate) bindings[action] = null;
    else accepted.push(binding);
  }
  // Bisher getrennte Windows-Belegungen werden einmalig in die gemeinsame Belegung übernommen.
  if (raw.windows && typeof raw.windows === "object") {
    const windows = normalizeShortcuts({ numbers: raw.windows.numbers, bindings: raw.windows.bindings });
    const shared = encodeShortcuts(windows, "Win32");
    // Unveränderte Windows-Vorgaben dürfen neuere gemeinsame Anpassungen nicht verdrängen.
    for (const action of shortcutActions) {
      const binding = shared.bindings[action];
      const standard = defaultShortcuts.bindings[action]!;
      if (binding?.code === standard.code && sameModifiers(binding, standard)) shared.bindings[action] = bindings[action];
    }
    if (shared.numbers && sameModifiers(shared.numbers, defaultShortcuts.numbers!)) shared.numbers = numbers;
    return normalizeShortcuts(shared);
  }
  return { numbers, bindings };
}

/** Doppelte Belegungen und Überlappungen mit der Zahlenwahl werden nicht gespeichert. */
export function shortcutConflict(preferences: ShortcutPreferences): string | null {
  const entries = shortcutActions.flatMap((action) => preferences.bindings[action] ? [[action, preferences.bindings[action]!] as const] : []);
  for (let index = 0; index < entries.length; index++) {
    const [action, binding] = entries[index]!;
    if (preferences.numbers && /^Digit\d$/.test(binding.code) && sameModifiers(binding, preferences.numbers)) return "Diese Kombination gehört bereits zur Seitenwahl.";
    const duplicate = entries.slice(index + 1).find(([, other]) => other.code === binding.code && sameModifiers(binding, other));
    if (duplicate) return `Diese Kombination ist bereits für „${shortcutLabels[action]}“ belegt.`;
  }
  return null;
}


/** Intern bezeichnet Ctrl die gemeinsame Haupttaste: Alt unter Windows, Control auf dem Mac. */
function mapPlatformShortcuts(preferences: ShortcutPreferences, platform: string): ShortcutPreferences {
  const key = /Win/i.test(platform) ? "alt" : null;
  if (!key) return preferences;
  const map = <T extends ShortcutModifiers>(value: T): T => ({ ...value, ctrl: value[key], [key]: value.ctrl });
  return {
    numbers: preferences.numbers ? map(preferences.numbers) : null,
    bindings: Object.fromEntries(shortcutActions.map((action) => [action,
      preferences.bindings[action] ? map(preferences.bindings[action]!) : null,
    ])) as ShortcutPreferences["bindings"],
  };
}

export function resolveShortcuts(preferences: ShortcutPreferences, platform = globalThis.navigator?.platform ?? ""): ShortcutPreferences {
  return mapPlatformShortcuts(preferences, platform);
}

/** Die Umkehrung derselben Tastenabbildung wird serverseitig gemeinsam gespeichert. */
export function encodeShortcuts(preferences: ShortcutPreferences, platform = globalThis.navigator?.platform ?? ""): ShortcutPreferences {
  return normalizeShortcuts(mapPlatformShortcuts(preferences, platform));
}
