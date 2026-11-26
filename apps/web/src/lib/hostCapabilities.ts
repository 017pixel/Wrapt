import { hostCapabilitiesSchema, type HostCapabilities } from "@wrapt/contracts";
import { request } from "./apiClient/transport";

/**
 * Optionale Host-Funktionen. Der Server entscheidet beim Start, welche Werkzeuge
 * tatsächlich existieren; die Oberfläche registriert nur passende Routen und
 * Navigationseinträge. Bis die Antwort da ist, gilt der sichere Zustand: alles
 * Optionale ist aus.
 */
let current: HostCapabilities = Object.freeze({ opencodeWeb: false });

export function getHostCapabilities(): HostCapabilities {
  return current;
}

export function hasHostCapability(name: keyof HostCapabilities): boolean {
  return current[name];
}

/** Setzt den Stand neu — vor dem Bootstrap und für isolierte Tests. */
export function applyHostCapabilities(next: HostCapabilities): void {
  current = Object.freeze(hostCapabilitiesSchema.parse(next));
}

/**
 * Holt den Stand vor dem Registrieren der Built-ins. Ein Fehler blockiert den
 * Start nicht: Dann bleibt die optionale Funktion einfach aus.
 */
export async function loadHostCapabilities(): Promise<void> {
  try {
    applyHostCapabilities(await request("/system/capabilities", hostCapabilitiesSchema, AbortSignal.timeout(2_000)));
  } catch {
    applyHostCapabilities({ opencodeWeb: false });
  }
}
