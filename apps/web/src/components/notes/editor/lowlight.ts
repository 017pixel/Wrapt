import { createLowlight } from "lowlight";
import plaintext from "highlight.js-notes/lib/languages/plaintext";
import type { LanguageFn } from "highlight.js";

/** Sprachumfang bleibt gleich; Grammatiken folgen tatsächlichen Codeblöcken. */
const loaders: Record<string, () => Promise<{ default: LanguageFn }>> = {
  "arduino": () => import("highlight.js-notes/lib/languages/arduino"),
  "bash": () => import("highlight.js-notes/lib/languages/bash"),
  "c": () => import("highlight.js-notes/lib/languages/c"),
  "cpp": () => import("highlight.js-notes/lib/languages/cpp"),
  "csharp": () => import("highlight.js-notes/lib/languages/csharp"),
  "css": () => import("highlight.js-notes/lib/languages/css"),
  "diff": () => import("highlight.js-notes/lib/languages/diff"),
  "go": () => import("highlight.js-notes/lib/languages/go"),
  "graphql": () => import("highlight.js-notes/lib/languages/graphql"),
  "ini": () => import("highlight.js-notes/lib/languages/ini"),
  "java": () => import("highlight.js-notes/lib/languages/java"),
  "javascript": () => import("highlight.js-notes/lib/languages/javascript"),
  "json": () => import("highlight.js-notes/lib/languages/json"),
  "kotlin": () => import("highlight.js-notes/lib/languages/kotlin"),
  "less": () => import("highlight.js-notes/lib/languages/less"),
  "lua": () => import("highlight.js-notes/lib/languages/lua"),
  "makefile": () => import("highlight.js-notes/lib/languages/makefile"),
  "markdown": () => import("highlight.js-notes/lib/languages/markdown"),
  "objectivec": () => import("highlight.js-notes/lib/languages/objectivec"),
  "perl": () => import("highlight.js-notes/lib/languages/perl"),
  "php": () => import("highlight.js-notes/lib/languages/php"),
  "php-template": () => import("highlight.js-notes/lib/languages/php-template"),
  "python": () => import("highlight.js-notes/lib/languages/python"),
  "python-repl": () => import("highlight.js-notes/lib/languages/python-repl"),
  "r": () => import("highlight.js-notes/lib/languages/r"),
  "ruby": () => import("highlight.js-notes/lib/languages/ruby"),
  "rust": () => import("highlight.js-notes/lib/languages/rust"),
  "scss": () => import("highlight.js-notes/lib/languages/scss"),
  "shell": () => import("highlight.js-notes/lib/languages/shell"),
  "sql": () => import("highlight.js-notes/lib/languages/sql"),
  "swift": () => import("highlight.js-notes/lib/languages/swift"),
  "typescript": () => import("highlight.js-notes/lib/languages/typescript"),
  "vbnet": () => import("highlight.js-notes/lib/languages/vbnet"),
  "wasm": () => import("highlight.js-notes/lib/languages/wasm"),
  "xml": () => import("highlight.js-notes/lib/languages/xml"),
  "yaml": () => import("highlight.js-notes/lib/languages/yaml"),
};
const aliases: Record<string, readonly string[]> = {
  "arduino": ["ino"],
  "bash": ["sh", "zsh"],
  "c": ["h"],
  "cpp": ["cc", "c++", "h++", "hpp", "hh", "hxx", "cxx"],
  "csharp": ["cs", "c#"],
  "diff": ["patch"],
  "go": ["golang"],
  "graphql": ["gql"],
  "ini": ["toml"],
  "java": ["jsp"],
  "javascript": ["js", "jsx", "mjs", "cjs"],
  "json": ["jsonc", "json5"],
  "kotlin": ["kt", "kts"],
  "lua": ["pluto"],
  "makefile": ["mk", "mak", "make"],
  "markdown": ["md", "mkdown", "mkd"],
  "objectivec": ["mm", "objc", "obj-c", "obj-c++", "objective-c++"],
  "perl": ["pl", "pm"],
  "plaintext": ["text", "txt"],
  "python": ["py", "gyp", "ipython"],
  "python-repl": ["pycon"],
  "ruby": ["rb", "gemspec", "podspec", "thor", "irb"],
  "rust": ["rs"],
  "shell": ["console", "shellsession"],
  "typescript": ["ts", "tsx", "mts", "cts"],
  "vbnet": ["vb"],
  "xml": ["html", "xhtml", "rss", "atom", "xjb", "xsd", "xsl", "plist", "wsf", "svg"],
  "yaml": ["yml"],
};
const canonical = new Map(Object.entries(aliases).flatMap(([name, values]) => values.map((alias) => [alias, name])));
export const noteCodeLanguages = ["plaintext", ...Object.keys(loaders)].sort();
export const lowlight = createLowlight({ plaintext });
const highlightAuto = lowlight.highlightAuto;
// Gleiche Tie-Break-Reihenfolge wie Common, unabhängig von der Importreihenfolge.
lowlight.highlightAuto = (value, options) => highlightAuto(value, {
  ...options, subset: options?.subset ?? noteCodeLanguages.filter((name) => lowlight.registered(name)),
});
const pending = new Map<string, Promise<void>>();

const embeddedLanguages: Record<string, readonly string[]> = {
  javascript: ["xml", "css", "graphql"], typescript: ["xml", "css", "graphql"],
  xml: ["javascript", "css"], markdown: ["xml"], "php-template": ["xml", "php"],
  "python-repl": ["python"], shell: ["bash"], yaml: ["ruby"],
};

function loadGrammar(name: string): Promise<void> {
  if (lowlight.registered(name)) return Promise.resolve();
  let loading = pending.get(name);
  if (!loading) {
    loading = loaders[name]!().then(({ default: grammar }) => { lowlight.register(name, grammar); })
      .catch((error: unknown) => { pending.delete(name); throw error; });
    pending.set(name, loading);
  }
  return loading;
}

export function loadNoteCodeLanguage(language: string): Promise<void> {
  const name = canonical.get(language.toLowerCase()) ?? language.toLowerCase();
  const required = new Set<string>();
  const visit = (current: string) => {
    if (required.has(current) || current === "plaintext") return;
    required.add(current);
    for (const embedded of embeddedLanguages[current] ?? []) visit(embedded);
  };
  // Unbekannte Sprachen behalten die bisherige automatische Erkennung.
  for (const current of loaders[name] ? [name] : name === "plaintext" ? [] : Object.keys(loaders)) visit(current);
  return Promise.all([...required].map(loadGrammar)).then(() => {});
}
