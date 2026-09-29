import { InputRule } from "@tiptap/core";
import { canJoin, findWrapping } from "@tiptap/pm/transform";
import {
  bulletListInputRegex,
  inputRegex as taskItemInputRegex,
  orderedListInputRegex,
} from "@tiptap/extension-list";

const listTypeNames = new Set(["bulletList", "orderedList", "taskList"]);

/**
 * Listen-Shortcuts wie in Notion — mit einer wichtigen Abweichung aus Gründen
 * der Markdown-Treue: Steht der Cursor bereits in einer Liste, wird der
 * redundante Marker entfernt, statt als Text stehen zu bleiben. Ein literales
 * `- ` am Zeilenanfang würde beim Speichern als `- - Text` landen und beim
 * nächsten Laden fälschlich als verschachtelte Liste geparst.
 *
 * Bei einer anderen Listenart (`1. ` in einer Aufzählung) wird der aktuelle
 * Punkt in die gewünschte Art umgewandelt.
 */
function listInputRule(
  wrapTypeName: "bulletList" | "orderedList" | "taskItem",
  find: RegExp,
  getAttributes?: (match: RegExpMatchArray) => Record<string, unknown>,
) {
  const targetListName = wrapTypeName === "taskItem" ? "taskList" : wrapTypeName;

  return new InputRule({
    find,
    handler: ({ state, range, match, chain }) => {
      const $from = state.doc.resolve(range.from);
      let currentList: string | null = null;
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        const name = $from.node(depth).type.name;
        if (listTypeNames.has(name)) {
          currentList = name;
          break;
        }
      }

      if (currentList !== null) {
        const chainCommands = chain();
        if (currentList === targetListName) {
          // Nur den redundanten Marker entfernen; die Schritte liegen im
          // Transaktionsobjekt der Regel und werden vom Plugin ausgeführt.
          chainCommands.deleteRange(range);
          return undefined;
        }
        if (targetListName === "taskList") chainCommands.deleteRange(range).toggleTaskList();
        else if (targetListName === "orderedList") chainCommands.deleteRange(range).toggleOrderedList();
        else chainCommands.deleteRange(range).toggleBulletList();
        return undefined;
      }

      const wrapType = state.schema.nodes[wrapTypeName];
      if (!wrapType) return null;
      const attributes = getAttributes?.(match as RegExpMatchArray) ?? {};
      const tr = state.tr.delete(range.from, range.to);
      const blockRange = tr.doc.resolve(range.from).blockRange();
      const wrapping = blockRange && findWrapping(blockRange, wrapType, attributes);
      if (!wrapping) return null;
      tr.wrap(blockRange, wrapping);
      const before = tr.doc.resolve(range.from - 1).nodeBefore;
      if (before && before.type === wrapType && canJoin(tr.doc, range.from - 1)) {
        tr.join(range.from - 1);
      }
      // Wichtig: nicht `null` zurückgeben — das gilt für die Eingaberegel als
      // „kein Treffer“ und der Schritt würde verworfen.
      return undefined;
    },
  });
}

export const bulletListRule = listInputRule("bulletList", bulletListInputRegex);

export const orderedListRule = listInputRule("orderedList", orderedListInputRegex, (match) => ({
  start: Number(match[1] ?? 1),
}));

export const taskItemRule = listInputRule("taskItem", taskItemInputRegex, (match) => ({
  checked: match[match.length - 1] === "x",
}));
