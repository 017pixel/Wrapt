import { commandContributionSchema, contextMenuContributionSchema } from "@wrapt/extension-contracts";
import { commandRegistry } from "./commandRegistry";
import { contextMenuRegistry } from "./contextMenuRegistry";

const ownerId = "wrapt.context-menu";

type Definition = readonly [
  key: string,
  surface: ReturnType<typeof contextMenuContributionSchema.parse>["surface"],
  title: string,
  group: ReturnType<typeof contextMenuContributionSchema.parse>["group"],
  order: number,
];

const definitions: readonly Definition[] = [
  ["tool.open", "host.context-menu.tool", "Öffnen", "open", 10],
  ["tool.new-tab", "host.context-menu.tool", "In neuem Tab öffnen", "open", 20],
  ["tool.reload", "host.context-menu.tool", "Neu laden", "run", 10],
  ["tool.fullscreen", "host.context-menu.tool", "Vollbild", "view", 10],
  ["tool.maximize", "host.context-menu.tool", "Maximieren", "view", 20],
  ["tool.hide", "host.context-menu.tool", "Ausblenden", "view", 30],
  ["tool.pin", "host.context-menu.tool", "Anheften", "view", 40],
  ["tool.reorder", "host.context-menu.tool", "Reihenfolge ändern", "view", 50],
  ["tool.quick-pin", "host.context-menu.tool", "In Schnellaktionen fixieren", "view", 60],
  ["tool.settings", "host.context-menu.tool", "Einstellungen", "view", 70],
  ["tool.close", "host.context-menu.tool", "Schließen", "danger", 10],
  ["project.open", "host.context-menu.project", "Arbeitsfläche öffnen", "open", 10],
  ["project.rename", "host.context-menu.project", "Umbenennen", "edit", 10],
  ["project.duplicate", "host.context-menu.project", "Duplizieren", "edit", 20],
  ["project.delete", "host.context-menu.project", "Löschen", "danger", 10],
  ["statusbar.usage", "host.context-menu.statusbar", "Nutzung öffnen", "open", 10],
  ["statusbar.font-increase", "host.context-menu.statusbar", "Schrift vergrößern", "view", 10],
  ["statusbar.font-decrease", "host.context-menu.statusbar", "Schrift verkleinern", "view", 20],
  ["statusbar.always-show", "host.context-menu.statusbar", "Immer anzeigen", "view", 30],
  ["statusbar.codex", "host.context-menu.statusbar", "Codex anzeigen", "view", 40],
  ["statusbar.opencode", "host.context-menu.statusbar", "OpenCode anzeigen", "view", 50],
  ["statusbar.claude", "host.context-menu.statusbar", "Claude anzeigen", "view", 60],
  ["statusbar.reset", "host.context-menu.statusbar", "Limits zurücksetzen", "danger", 10],
  ["orbit-pane.note", "host.context-menu.orbit-pane", "Neue Textfläche", "create", 10],
  ["orbit-pane.todo", "host.context-menu.orbit-pane", "Neue To-do-Liste", "create", 20],
  ["orbit-pane.terminal", "host.context-menu.orbit-pane", "Neues Terminal", "create", 30],
  ["orbit-pane.codex", "host.context-menu.orbit-pane", "Codex öffnen", "create", 40],
  ["orbit-pane.opencode", "host.context-menu.orbit-pane", "OpenCode öffnen", "create", 50],
  ["orbit-pane.preview", "host.context-menu.orbit-pane", "Neue Preview", "create", 60],
  ["orbit-pane.files", "host.context-menu.orbit-pane", "Dateimanager öffnen", "open", 10],
  ["orbit-pane.all-actions", "host.context-menu.orbit-pane", "Alle Aktionen", "open", 20],
  ["orbit-node.properties", "host.context-menu.orbit-node", "Eigenschaften", "edit", 10],
  ["orbit-node.rename", "host.context-menu.orbit-node", "Name ändern", "edit", 20],
  ["orbit-node.duplicate", "host.context-menu.orbit-node", "Duplizieren", "edit", 30],
  ["orbit-node.lock", "host.context-menu.orbit-node", "Position sperren", "edit", 40],
  ["orbit-node.color", "host.context-menu.orbit-node", "Farbe ändern", "edit", 50],
  ["orbit-node.delete", "host.context-menu.orbit-node", "Löschen", "danger", 10],
  ["file.open", "host.context-menu.file", "Öffnen", "open", 10],
  ["file.preview", "host.context-menu.file", "Vorschau", "open", 20],
  ["file.download", "host.context-menu.file", "Herunterladen", "share", 10],
  ["file.editor", "host.context-menu.file", "Im Editor öffnen", "open", 30],
  ["file.terminal", "host.context-menu.file", "Im Terminal öffnen", "open", 40],
  ["file.favorite", "host.context-menu.file", "Zu Favoriten hinzufügen", "edit", 10],
  ["file.rename", "host.context-menu.file", "Umbenennen", "edit", 20],
  ["file.move", "host.context-menu.file", "Verschieben", "edit", 30],
  ["file.delete", "host.context-menu.file", "Löschen", "danger", 10],
  ["directory.open", "host.context-menu.directory", "Öffnen", "open", 10],
  ["directory.terminal", "host.context-menu.directory", "Im Terminal öffnen", "open", 20],
  ["directory.register", "host.context-menu.directory", "Als Projekt registrieren", "open", 30],
  ["directory.favorite", "host.context-menu.directory", "Zu Favoriten hinzufügen", "edit", 10],
  ["directory.rename", "host.context-menu.directory", "Umbenennen", "edit", 20],
  ["directory.move", "host.context-menu.directory", "Verschieben", "edit", 30],
  ["directory.delete", "host.context-menu.directory", "Löschen", "danger", 10],
  ["terminal.open", "host.context-menu.terminal", "Öffnen", "open", 10],
  ["terminal.split", "host.context-menu.terminal", "In Split öffnen", "open", 20],
  ["terminal.new", "host.context-menu.terminal", "Neues Terminal", "create", 10],
  ["terminal.new-folder", "host.context-menu.terminal", "Neuer Ordner", "create", 20],
  ["terminal.rename", "host.context-menu.terminal", "Umbenennen", "edit", 10],
  ["terminal.pin", "host.context-menu.terminal", "Pinnen", "edit", 20],
  ["terminal.persistent", "host.context-menu.terminal", "Persistent machen", "edit", 30],
  ["terminal.expand", "host.context-menu.terminal", "Alle aufklappen", "view", 10],
  ["terminal.collapse", "host.context-menu.terminal", "Alle zuklappen", "view", 20],
  ["terminal.reconnect", "host.context-menu.terminal", "Neu verbinden", "run", 10],
  ["terminal.restart", "host.context-menu.terminal", "Terminal neu starten", "run", 20],
  ["terminal.close-all", "host.context-menu.terminal", "Alle normalen Terminals schließen", "danger", 10],
  ["terminal.delete-folder", "host.context-menu.terminal", "Ordner löschen", "danger", 20],
  ["terminal.end", "host.context-menu.terminal", "Terminal beenden", "danger", 30],
  ["preview.open", "host.context-menu.preview", "Projekt öffnen", "open", 10],
  ["preview.rename", "host.context-menu.preview", "Umbenennen", "edit", 10],
  ["preview.duplicate", "host.context-menu.preview", "Duplizieren", "edit", 20],
  ["preview.window", "host.context-menu.preview", "In eigenem Fenster öffnen", "open", 20],
  ["preview.device", "host.context-menu.preview", "Gerät wechseln", "view", 10],
  ["preview.close", "host.context-menu.preview", "Schließen", "danger", 10],
  ["browser.back", "host.context-menu.browser", "Zurück", "navigation", 10],
  ["browser.forward", "host.context-menu.browser", "Vorwärts", "navigation", 20],
  ["browser.reload", "host.context-menu.browser", "Neu laden", "run", 10],
  ["browser.source", "host.context-menu.browser", "Seitenquelltext", "view", 10],
  ["browser.screenshot", "host.context-menu.browser", "Screenshot aufnehmen", "share", 10],
  ["browser.inspect", "host.context-menu.browser", "Untersuchen", "view", 20],
  ["extensions.toggle", "host.context-menu.extensions", "Aktivieren", "run", 10],
  ["extensions.uninstall", "host.context-menu.extensions", "Deinstallieren", "danger", 10],
  ["extensions.settings", "host.context-menu.extensions", "Einstellungen", "view", 10],
  ["extensions.quick-pin", "host.context-menu.extensions", "In Schnellaktionen fixieren", "view", 20],
  ["extensions.reload", "host.context-menu.extensions", "Neu laden", "run", 20],
  ["extensions.edit", "host.context-menu.extensions", "Draft bearbeiten", "edit", 10],
  ["agent-session.open", "host.context-menu.agent-session", "Sitzung öffnen", "open", 10],
  ["agent-session.rename", "host.context-menu.agent-session", "Umbenennen", "edit", 10],
  ["agent-session.history", "host.context-menu.agent-session", "Verlauf", "view", 10],
  ["agent-session.settings", "host.context-menu.agent-session", "Einstellungen", "view", 20],
  ["agent-session.close", "host.context-menu.agent-session", "Schließen", "danger", 10],
];

export function hostContextMenuId(key: string): string {
  return `${ownerId}.item.${key}`;
}

export function registerHostContextMenus(): void {
  commandRegistry.replaceOwner(ownerId, definitions.map(([key, , title]) => ({
    contribution: commandContributionSchema.parse({
      id: `${ownerId}.command.${key}`,
      title,
      category: "Kontextmenü",
    }),
    runtime: Object.freeze({ execute: () => undefined }),
  })));
  contextMenuRegistry.replaceOwner(ownerId, definitions.map(([key, surface, , group, order]) => ({
    contribution: contextMenuContributionSchema.parse({
      id: hostContextMenuId(key),
      surface,
      commandId: `${ownerId}.command.${key}`,
      group,
      order,
    }),
    runtime: Object.freeze({ requiresHostAction: true }),
  })));
}

let bootstrapped = false;

export function bootstrapHostContextMenus(): void {
  if (bootstrapped) return;
  registerHostContextMenus();
  bootstrapped = true;
}
