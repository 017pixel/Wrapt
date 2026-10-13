import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { loadNoteCodeLanguage } from "./lowlight";

const refresh = "wrapt-code-grammar-ready";

/** Der öffentliche Plugin-State wird ohne Dokumentmutation neu dekoriert. */
export function lazyCodeHighlightPlugins(plugins: Plugin[]): Plugin[] {
  const decorated = plugins.map((plugin) => {
    const state = plugin.spec.state;
    if (!state) return plugin;
    return new Plugin({ ...plugin.spec, state: {
      ...state,
      apply(transaction, value, oldState, newState) {
        if (transaction.getMeta(refresh)) return state.init.call(this, {}, newState);
        return state.apply.call(this, transaction, value, oldState, newState);
      },
    } });
  });
  return [...decorated, new Plugin({ view(view) {
    let destroyed = false;
    let generation = 0;
    const load = (current: EditorView) => {
      const languages = new Set<string>();
      current.state.doc.descendants((node) => {
        if (node.type.name === "codeBlock") languages.add(String(node.attrs.language || "plaintext"));
      });
      const version = ++generation;
      if (!languages.size) return;
      void Promise.all([...languages].map(loadNoteCodeLanguage)).then(() => {
        if (!destroyed && version === generation) current.dispatch(current.state.tr.setMeta(refresh, true));
      }).catch(() => {
        // Klartext bleibt editierbar. Ein vom Browser gecachter Importfehler
        // benötigt nach dem Speichern ein Neuladen der Workbench.
      });
    };
    load(view);
    return {
      update(current, previous) { if (current.state.doc !== previous.doc) load(current); },
      destroy() { destroyed = true; },
    };
  } })];
}
