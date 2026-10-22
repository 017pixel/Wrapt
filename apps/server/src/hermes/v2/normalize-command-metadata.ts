import type { HermesV2Command } from "@wrapt/contracts/hermes-v2";
import { object, text } from "./normalize-values.js";

const keyValid = (key: string) => /^\/\S{1,199}$/u.test(key)
  && [...key].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
export function commandMetadata(value: unknown, key: string, shadowed: Set<string>): Pick<HermesV2Command, "aliases"|"argumentMode"|"subcommands"|"desktopSubcommands"> {
  const raw = object(value);
  const canon = object(raw.canon);
  const meta = object(object(raw.commands)[key]);
  const aliases = new Set<string>();
  const seen = new Set<string>([key.toLowerCase()]);
  for (const [alias, target] of Object.entries(canon)) {
    if (!keyValid(alias) || target !== key || seen.has(alias.toLowerCase()) || shadowed.has(alias.toLowerCase())) continue;
    seen.add(alias.toLowerCase()); aliases.add(alias);
    if (aliases.size === 100) break;
  }
  const strings = (input: unknown) => Array.isArray(input) ? input.filter((item): item is string => typeof item === "string").slice(0, 100).map((item) => text(item, 200)) : [];
  return {
    aliases: [...aliases],
    argumentMode: meta.argument_mode === "options" || meta.argument_mode === "text" || meta.argument_mode === "mixed" ? meta.argument_mode : null,
    subcommands: strings(object(raw.sub)[key.slice(1)]),
    desktopSubcommands: Array.isArray(meta.desktop_subcommands) ? strings(meta.desktop_subcommands) : null,
  };
}
