import type { UpdateStatusResponse } from "@wrapt/contracts";

export function hasRemoteUpdate(status: UpdateStatusResponse | undefined): boolean {
  if (!status?.localHash || !status?.remoteHash) return false;
  return status.localHash !== status.remoteHash;
}

export function updateStatusTone(
  status: UpdateStatusResponse | undefined,
): "default" | "ok" | "warn" | "bad" | "accent" {
  if (!status) return "default";
  if (status.localHash === null || status.remoteHash === null) return "warn";
  if (status.dirty && hasRemoteUpdate(status)) return "bad";
  if (status.dirty) return "warn";
  if (hasRemoteUpdate(status)) return "accent";
  return "ok";
}

export function updateStatusLabel(status: UpdateStatusResponse | undefined): string {
  if (!status) return "Wird geprüft";
  if (status.localHash === null) return "Kein Git-Stand";
  if (status.remoteHash === null) return "GitHub offline";
  if (status.dirty && hasRemoteUpdate(status)) return "Update plus lokale Änderungen";
  if (status.dirty) return "Lokale Änderungen";
  if (hasRemoteUpdate(status)) return "Update verfügbar";
  return "Aktuell";
}

export function buildUpdateAgentPrompt(status: UpdateStatusResponse): string {
  const update = hasRemoteUpdate(status);
  const dirtyList = status.dirtyFiles.length > 0
    ? status.dirtyFiles.map((file) => `- ${file}`).join("\n")
    : "- (keine Dateiliste vom Server, prüfe mit git status)";
  const lines = [
    "Aktualisiere das Wrapt-Projekt auf den neuesten GitHub-Stand und erhalte meine lokalen Änderungen.",
    "",
    `Festgestellter Stand in den Einstellungen: Branch ${status.branch}, lokal ${status.localShort ?? "?"} (${status.localHash ?? "unbekannt"}), GitHub ${status.remoteShort ?? "?"} (${status.remoteHash ?? "unbekannt"}), Version ${status.version}, geprüft ${status.checkedAt}.`,
    update
      ? `Es gibt ein Update im GitHub-Repository (origin/${status.branch}). Führe den Abgleich aus.`
      : "Laut Stand gibt es gerade kein entferntes Update. Prüfe trotzdem mit git fetch, ob origin aktuell ist, und gleiche ab.",
    status.dirty
      ? `Es gibt ${status.dirtyCount} lokale Änderung(en). Sorge dafür, dass nach dem Update alles mit meinen Änderungen übereinstimmt und nichts verloren geht.`
      : "Der Arbeitsbaum ist laut Stand sauber. Prüfe das mit git status erneut, bevor du ziehst.",
    "",
    "Geänderte Dateien laut Status:",
    dirtyList,
    "",
    "Gehe so vor:",
    `1. Prüfe den Stand: git status --porcelain, git rev-parse --abbrev-ref HEAD, git rev-parse HEAD, git fetch origin ${status.branch}, danach git rev-parse origin/${status.branch} und git log --oneline HEAD..origin/${status.branch}.`,
    status.dirty
      ? "2. Sichere meine Änderungen zuerst: zeige git diff --stat und git status, lege bei Bedarf einen Sicherungs-Branch oder Stash an (git stash push -m wrapt-update). Verwerfe nichts ohne meine Freigabe."
      : "2. Wenn dabei doch lokale Änderungen auftauchen, verwerfe nichts. Sichere sie erst (Stash oder Branch) und hole meine Freigabe ein.",
    `3. Hole das Update mit git pull --ff-only origin ${status.branch}. Wenn Fast-Forward wegen Divergenz scheitert, löse es per Rebase meiner gesicherten Änderungen auf origin/${status.branch} und stelle sicher, dass meine Änderungen erhalten bleiben. Kein Force-Push auf ${status.branch}.`,
    "4. Danach: pnpm install, dann pnpm --filter @wrapt/extension-contracts build, pnpm --filter @wrapt/contracts build, dann pnpm typecheck. Baue Frontend und Backend (bash scripts/restart-frontend.sh, bash scripts/restart-backend.sh oder zusammen bash scripts/restart-all.sh). Frage vor dem Neustart, weil ein Neustart die laufende KI-Session beendet.",
    "5. Plugins bleiben erhalten: extensions/personal-plugins/, config/*.local.json und data/ sind git-ignoriert und werden nicht überschrieben. Installierte Plugins nicht löschen, keine fremden Preview-Sessions oder Slots anfassen.",
    "6. Prüfe danach: git status, git rev-parse HEAD gegen den erwarteten Remote-Stand, pnpm typecheck grün, relevante Tests (mindestens Update- und Settings-Tests). Melde bootId und webBuildId aus GET /api/v1/health als Nachweis für den Neustart.",
    "",
    "Verbote: keine Secrets oder Tokens committen oder ausgeben, keine Nutzerdaten unter data/ löschen, keine fremden Dienste stoppen.",
    "",
    "Lege am Ende eine kurze Zusammenfassung vor: von welchem auf welchen Commit aktualisiert wurde, wie meine Änderungen übernommen wurden, welche Builds und Tests liefen und ob ein Neustart noch aussteht.",
  ];
  return lines.join("\n");
}
