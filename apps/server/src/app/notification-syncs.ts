import { join } from "node:path";
import { settings } from "../config/settings.js";
import type { NotificationDatabase } from "../notifications/database.js";
import { T3StatusSync } from "../notifications/t3-status-sync.js";
import { TerminalStatusSync } from "../notifications/terminal-status-sync.js";
import { AgentSessionSync } from "../notifications/agent-session-sync.js";

export function createNotificationSyncs(notificationDatabase: NotificationDatabase) {
  const t3StatusSync = new T3StatusSync({
    databasePath: join(settings.systemHomeDirectory, ".t3/userdata/state.sqlite"),
    environmentIdPath: join(settings.systemHomeDirectory, ".t3/userdata/environment-id"),
    notifications: notificationDatabase,
    pollSeconds: settings.notifications.pollSeconds,
    completionMinimumSeconds: settings.notifications.t3CompletionMinimumSeconds,
    miniTaskSeconds: settings.notifications.t3MiniTaskSeconds,
    finalSettleSeconds: settings.notifications.finalSettleSeconds,
    cursorPath: join(settings.dataDirectory, "notifications/t3-status-cursor.json"),
    remoteSources: settings.notifications.t3RemoteSyncs,
    remoteScheduling: settings.remoteT3Poll,
  });
  const terminalStatusSync = new TerminalStatusSync({
    databasePath: settings.databasePath,
    notifications: notificationDatabase,
    pollSeconds: settings.notifications.pollSeconds,
    terminalMinimumSeconds: settings.notifications.terminalMinimumSeconds,
    agentMinimumSeconds: settings.notifications.agentMinimumSeconds,
    inputIdleMilliseconds: settings.notifications.terminalInputIdleMilliseconds,
  });
  const agentSessionSync = new AgentSessionSync({
    // Die konfigurierten gemeinsamen Homes gelten auch für die Verlaufsquellen;
    // sonst würden abweichende Pfade (Config oder Profil) ins Leere lesen.
    opencodeDatabasePath: join(settings.sharedHomes.opencode.sharedHome, "opencode.db"),
    t3DatabasePath: join(settings.systemHomeDirectory, ".t3/userdata/state.sqlite"),
    codexSessionsPath: join(settings.sharedHomes.codex.sharedHome, "sessions"),
    codexRead: settings.codexSessionRead,
    cursorPath: join(settings.dataDirectory, "notifications/agent-session-cursor.json"),
    notifications: notificationDatabase,
    pollSeconds: settings.notifications.pollSeconds,
    completionMinimumSeconds: settings.notifications.agentMinimumSeconds,
    runIdleSeconds: settings.notifications.agentRunIdleSeconds,
  });
  return { t3StatusSync, terminalStatusSync, agentSessionSync };
}
