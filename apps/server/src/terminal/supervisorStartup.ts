export type SupervisorStartupRuntimeMode = "development" | "test" | "production";

export interface SupervisorStartupOptions {
  runtimeMode: SupervisorStartupRuntimeMode;
  platform?: NodeJS.Platform;
  warn?: (message: string, error?: unknown) => void;
}

/**
 * In Produktion (und auf macOS) wird der Supervisor beim Start verbindlich
 * angestoßen. Ein transienter Probe-Timeout bricht den Backend-Start trotzdem
 * nicht ab: Die Terminals bleiben lazy und versuchen den Supervisor beim
 * ersten Öffnen erneut.
 */
export async function ensureSupervisorOnStartup(
  supervisor: { ensureSupervisorUnit(): Promise<boolean> } | null | undefined,
  options: SupervisorStartupOptions,
): Promise<boolean> {
  if (!supervisor || options.runtimeMode === "test") return false;
  const platform = options.platform ?? process.platform;
  if (options.runtimeMode !== "production" && platform !== "darwin") return false;
  try {
    if (await supervisor.ensureSupervisorUnit()) return true;
    options.warn?.("Der Terminal-Supervisor ist beim Start nicht erreichbar. Terminals versuchen es beim ersten Öffnen erneut.");
  } catch (error) {
    options.warn?.("Der Terminal-Supervisor konnte beim Start nicht geprüft werden. Terminals versuchen es beim ersten Öffnen erneut.", error);
  }
  return false;
}
