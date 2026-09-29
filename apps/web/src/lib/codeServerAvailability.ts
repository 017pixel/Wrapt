import type { Service } from "@wrapt/contracts";

export type CodeServerState = Service["state"] | undefined;

export function codeServerState(services: readonly Service[] | undefined): CodeServerState {
  return services?.find((service) => service.id === "code-server")?.state;
}

export function codeServerUnavailableReason(configured: boolean, state: CodeServerState): string | null {
  if (!configured) return "Code-Server ist für dieses Projekt nicht eingerichtet.";
  if (state === "active") return null;
  if (state === "inactive" || state === "error") return "Code-Server läuft auf diesem Gerät nicht. Starte den Dienst und versuche es erneut.";
  if (state === "unknown") return "Code-Server ist derzeit nicht erreichbar. Prüfe den Dienststatus.";
  return "Code-Server-Status ist noch nicht verfügbar. Bitte versuche es gleich erneut.";
}
