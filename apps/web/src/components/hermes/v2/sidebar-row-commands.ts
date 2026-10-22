import type {
  SidebarActionIntent,
  SidebarDropPlan,
  SidebarDropTarget,
  SidebarRowView,
} from "./sidebar-types";

/** Reine UI-Befehle der Zeile; Ausführung hält die Sidebar bzw. die Surface. */
export type RowCommand =
  | { type: "organize"; intent: SidebarActionIntent }
  | { type: "snooze"; sessionId: string; expectedRevision: number }
  | { type: "delete"; sessionId: string }
  | { type: "drop"; plan: SidebarDropPlan };

export interface RowMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  /** Verständlicher Grund bei ausdrücklich deaktivierten Punkten (z. B. Reorder). */
  reason?: string;
  command: RowCommand | null;
}

function intent(
  sessionId: string,
  expectedRevision: number,
  action: Exclude<SidebarActionIntent["action"], "snooze">,
): SidebarActionIntent {
  return { sessionId, expectedRevision, action };
}

/** Reorder-Eintrag: der Plan entscheidet, ob er tatsächlich wirkt. */
function moveItem(
  id: string,
  label: string,
  plan: SidebarDropPlan,
): RowMenuItem {
  const item: RowMenuItem = {
    id,
    label,
    disabled: !plan.allowed,
    command: { type: "drop", plan },
  };
  if (!plan.allowed) item.reason = plan.reason;
  return item;
}

/**
 * Der Erledigen-Befehl der Zeile, falls die Sitzung noch nicht erledigt ist.
 * Der Haken-Knopf der Zeile nutzt denselben Befehl wie das Menü; er braucht
 * keine eigene Serveraktion.
 */
export function settleCommand(
  items: readonly RowMenuItem[],
): RowCommand | null {
  const item = items.find((entry) => entry.id === "settle");
  return item?.command ?? null;
}

/**
 * Jede Geste erhält eine sichtbare Menü- und Tastaturalternative. Das Menü ist
 * die Alternative zum Ziehen: Verschieben in eine Gruppe läuft über denselben
 * planDrop-Weg wie das Loslassen. Nachbarn enables die Pinned-Reihenfolge.
 */
export function buildRowMenuItems(
  row: SidebarRowView,
  neighbors: {
    previousId: string | null;
    nextId: string | null;
    planDrop: (
      sessionId: string,
      target: SidebarDropTarget,
      beforeSessionId?: string,
    ) => SidebarDropPlan;
  },
  options: { deleteEnabled?: boolean } = {},
): RowMenuItem[] {
  const items: RowMenuItem[] = [];
  const revision = row.metadata.revision;
  const pin = (label: string, action: "pin" | "unpin"): RowMenuItem => ({
    id: action,
    label,
    command: { type: "organize", intent: intent(row.id, revision, action) },
  });
  // Ziehen in Pinned/Active/Settled entspricht fachlich Pin/Unpin/Wake/
  // Unsettle/Settle und hat damit dieselbe Menüalternative. Lediglich die
  // Reihenfolge innerhalb der Pins braucht eigene Einträge.
  // Pin ist ein sichtbarer Modifikator: eine angeheftete Row kann auch in
  // Needs input, Working, Snoozed oder Settled stehen und braucht dann
  // weiterhin Lösen statt erneutem Anheften.
  if (row.pinned) {
    items.push(pin("Lösen", "unpin"));
  } else {
    items.push(pin("Anheften", "pin"));
  }
  // Reihenfolge nur innerhalb der sichtbaren Pinned-Gruppe. "Nach unten"
  // plant den Nachbarn vor die aktuelle Row, sonst würde die eigene Row
  // vor dem bisherigen Nachfolger eingefügt und nichts würde sich ändern.
  if (row.group === "pinned") {
    if (neighbors.previousId) {
      items.push(
        moveItem(
          "move-up",
          "Nach oben",
          neighbors.planDrop(row.id, "pinned", neighbors.previousId),
        ),
      );
    }
    if (neighbors.nextId) {
      items.push(
        moveItem(
          "move-down",
          "Nach unten",
          neighbors.planDrop(neighbors.nextId, "pinned", row.id),
        ),
      );
    }
  }
  if (row.group === "snoozed")
    items.push({
      id: "wake",
      label: "Jetzt wecken",
      command: { type: "organize", intent: intent(row.id, revision, "wake") },
    });
  if (row.group === "settled")
    items.push({
      id: "unsettle",
      label: "Wieder aktiv",
      command: {
        type: "organize",
        intent: intent(row.id, revision, "unsettle"),
      },
    });
  if (row.group !== "snoozed" && row.group !== "settled") {
    items.push({
      id: "snooze",
      label: "Zurückstellen",
      command: {
        type: "snooze",
        sessionId: row.id,
        expectedRevision: revision,
      },
    });
  }
  if (row.group !== "settled")
    items.push({
      id: "settle",
      label: "Erledigen",
      command: { type: "organize", intent: intent(row.id, revision, "settle") },
    });
  // Natives Delete mit echter Semantik öffnet die Bestätigung; der Befehl
  // existiert nur, wenn die eigene Fläche einen Pfad dafür beisteuert.
  if (options.deleteEnabled) {
    items.push({
      id: "delete",
      label: `Sitzung löschen: ${row.title || row.id}`,
      command: { type: "delete", sessionId: row.id },
    });
  }
  return items;
}
