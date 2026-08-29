import type { BrowserDatabase } from "../browser/database.js";
import { BrowserManager } from "../browser/Manager.js";
import { settings } from "../config/settings.js";
import type { TerminalDatabase } from "../terminal/database.js";
import { TerminalManager } from "../terminal/Manager.js";
import { defaultTerminalSocketPath, TmuxSupervisor } from "../terminal/TmuxSupervisor.js";
import type { TerminalStatusSync } from "../notifications/terminal-status-sync.js";
import type { UsageDatabase } from "../usage/database.js";

interface RuntimeDependencyOptions {
  browserDatabase: BrowserDatabase;
  terminalDatabase: TerminalDatabase;
  terminalStatusSync: TerminalStatusSync;
  usageDatabase: UsageDatabase;
}

export function createRuntimeDependencies(options: RuntimeDependencyOptions) {
  const terminalSupervisor = settings.terminalSupervisor === "tmux"
    ? new TmuxSupervisor(settings.tmuxPath, settings.tmuxSocketPath ?? defaultTerminalSocketPath())
    : null;
  if (settings.runtimeMode === "production") terminalSupervisor?.ensureSupervisorUnit();

  const terminals = new TerminalManager({
    allowedRoots: settings.terminalAllowedRoots,
    defaultCwd: settings.terminalDefaultCwd,
    maxSessions: settings.terminalMaxSessions + settings.codexMaxSessions + settings.opencodeMaxSessions + settings.claudeMaxSessions,
    maxSessionsByKind: {
      shell: settings.terminalMaxSessions,
      codex: settings.codexMaxSessions,
      opencode: settings.opencodeMaxSessions,
      claude: settings.claudeMaxSessions,
    },
    cliPaths: { codex: settings.codexCliPath, opencode: settings.opencodeCliPath, claude: settings.claudeCliPath },
    database: options.terminalDatabase,
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

  const browsers = new BrowserManager({
    chromiumPath: settings.chromiumPath,
    profilesRoot: settings.browserProfilesRoot,
    database: options.browserDatabase,
    maxSessions: settings.browserMaxSessions,
    startupTimeoutMilliseconds: settings.browserStartupTimeoutMilliseconds,
    idleTimeoutMilliseconds: settings.browserIdleTimeoutMilliseconds,
    captureMaxWidth: settings.browserCaptureMaxWidth,
    captureMaxHeight: settings.browserCaptureMaxHeight,
    captureMaxScale: settings.browserCaptureMaxScale,
    captureJpegQuality: settings.browserCaptureJpegQuality,
    captureEveryNthFrame: settings.browserCaptureEveryNthFrame,
    allowNoSandbox: settings.browserAllowNoSandbox,
  });

  return { terminalSupervisor, terminals, browsers };
}
