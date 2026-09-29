import { Extension, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { filterSlashCommands, type SlashCommandContext, type SlashCommandItem } from "./slashCommands.js";
import { useSlashMenuStore, type SlashMenuRect } from "./slashMenuStore.js";

export interface SlashCommandOptions {
  /** Liefert die Host-Aktionen (Datei, Unterseite) aus der React-Schicht. */
  context: () => SlashCommandContext;
}

function rectFromClientRect(clientRect: (() => DOMRect | null) | null | undefined): SlashMenuRect | null {
  const rect = clientRect?.() ?? null;
  if (!rect) return null;
  return { left: rect.left, top: rect.top, bottom: rect.bottom };
}

/**
 * Slash-Menü (`/`) als Vorschlags-Plugin. Die UI liegt in `SlashMenu.tsx`,
 * der Zustand in `slashMenuStore`.
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      context: () => ({
        pickFile: () => undefined,
        createSubpage: () => undefined,
      }),
    };
  },

  addProseMirrorPlugins() {
    const resolveContext = this.options.context;
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => filterSlashCommands(query),
        command: ({ editor, range, props }) => {
          props.run(editor, range as Range, resolveContext());
        },
        render: () => ({
          onStart: (props: SuggestionProps<SlashCommandItem>) => {
            useSlashMenuStore.getState().set({
              open: true,
              query: props.query,
              items: props.items,
              index: 0,
              rect: rectFromClientRect(props.clientRect),
              execute: (item: SlashCommandItem) => props.command(item),
            });
          },
          onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
            useSlashMenuStore.getState().set({
              query: props.query,
              items: props.items,
              index: 0,
              rect: rectFromClientRect(props.clientRect),
              execute: (item: SlashCommandItem) => props.command(item),
            });
          },
          onKeyDown: (props) => {
            const { event } = props;
            const store = useSlashMenuStore.getState();
            if (!store.open) return false;
            if (event.key === "ArrowDown") {
              store.move(1);
              return true;
            }
            if (event.key === "ArrowUp") {
              store.move(-1);
              return true;
            }
            if (event.key === "Enter") {
              const item = store.items[store.index];
              if (item) store.execute?.(item);
              return true;
            }
            if (event.key === "Escape") {
              store.close();
              return true;
            }
            return false;
          },
          onExit: () => {
            useSlashMenuStore.getState().close();
          },
        }),
      }),
    ];
  },
});
