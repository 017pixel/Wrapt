import { settings } from "../config/settings.js";
import type { TerminalDatabase } from "../terminal/database.js";
import { TerminalManager } from "../terminal/Manager.js";
import { defaultTerminalSocketPath, TmuxSupervisor } from "../terminal/TmuxSupervisor.js";
import { ensureSupervisorOnStartup } from "../terminal/supervisorStartup.js";
import type { TerminalStatusSync } from "../notifications/terminal-status-sync.js";
import type { UsageDatabase } from "../usage/database.js";

interface RuntimeDependencyOptions {
  terminalDatabase: TerminalDatabase;
  terminalStatusSync: TerminalStatusSync;
  usageDatabase: UsageDatabase;
  warn?: (message: string, error?: unknown) => void;
}

export async function createRuntimeDependencies(options: RuntimeDependencyOptions) {
  const terminalSupervisor = settings.terminalSupervisor === "tmux"
    ? new TmuxSupervisor(
      settings.tmuxPath,
      settings.tmuxSocketPath ?? defaultTerminalSocketPath(settings.dataDirectory),
      undefined,
      undefined,
      settings.runtimeMode === "production",
    )
    : null;
  try {
    await terminalSupervisor?.ready();
  } catch (error) {
    // Ein transienter tmux-Timeout darf den Backend-Start nicht verhindern.
    options.warn?.("tmux ist beim Start nicht erreichbar. Terminals versuchen es beim ersten Öffnen erneut.", error);
  }
  // In Produktion und auf macOS wird der Supervisor angestoßen, ein false
  // blockiert den Start aber nicht. Die Terminals bleiben lazy.
  await ensureSupervisorOnStartup(terminalSupervisor, {
    runtimeMode: settings.runtimeMode,
    ...(options.warn ? { warn: options.warn } : {}),
  });

  const terminals = new TerminalManager({
    allowedRoots: settings.terminalAllowedRoots,
    // S-011: Server-Config und Datenschlüssel liegen außerhalb jeder
    // Terminal-Arbeit, auch wenn sie unter einer erlaubten Wurzel stehen.
    deniedRoots: [settings.configDirectory, settings.dataDirectory],
    defaultCwd: settings.terminalDefaultCwd,
    homeDirectory: settings.systemHomeDirectory,
    shell: settings.terminalShell,
    maxSessions: settings.terminalMaxSessions + settings.codexMaxSessions + settings.opencodeMaxSessions + settings.claudeMaxSessions,
    maxSessionsByKind: {
      shell: settings.terminalMaxSessions,
      codex: settings.codexMaxSessions,
      opencode: settings.opencodeMaxSessions,
      claude: settings.claudeMaxSessions,
    },
    cliPaths: { codex: settings.codexCliPath, opencode: settings.opencodeCliPath, claude: settings.claudeCliPath },
    database: options.terminalDatabase,
    persistentSessionOwners: settings.terminalAllowedUsers,
    onOutput: (session, data) => options.terminalStatusSync.noteOutput(session, data),
    onInput: (session) => options.terminalStatusSync.resolveWaiting(session.kind, session.id),
    ...(terminalSupervisor ? { supervisor: terminalSupervisor } : {}),
    ...(settings.terminalAllowedUsers.length === 1 ? { externalSessionOwnerId: settings.terminalAllowedUsers[0] } : {}),
    resolveAccountProfile: (accountId, kind) => {
      const account = options.usageDatabase.getAccount(accountId);
      if (account.provider !== kind) throw new Error("Provider mismatch");
      return account.profilePath;
    },
  });

  await terminals.ready();
  return { terminalSupervisor, terminals };
}
