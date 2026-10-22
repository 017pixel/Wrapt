import type { HermesV2Command } from "@wrapt/contracts/hermes-v2";

export type ChatCommandIntent =
  | { kind: "native"; action: "new" | "resume" | "stop" | "model" | "help" | "title" | "queue" | "steer"; argument: string }
  | { kind: "draft"; text: string; skill: string }
  | { kind: "unsupported"; reason: string };
const keyOf = (value: string) => value.trim().replace(/^\//, "").toLocaleLowerCase();

/** Kanonische Metadaten auf UI-Aktionen abbilden, niemals freie Commands ausführen. */
export function resolveChatCommand(commands: readonly HermesV2Command[], key: string, argument = ""): ChatCommandIntent {
  const requested = keyOf(key);
  const matches = commands.filter((command) => keyOf(command.key) === requested || command.aliases?.some((alias) => keyOf(alias) === requested));
  if (matches.length !== 1) return { kind: "unsupported", reason: "Dieser Befehl ist nicht eindeutig im aktuellen Katalog verfügbar." };
  const command = matches[0]!;
  if (command.disabledReason || command.kind === "unsupported") return { kind: "unsupported", reason: command.disabledReason ?? "Dieser Befehl ist nur in der klassischen Oberfläche verfügbar." };
  if (command.kind === "skill" && command.action === "skill") {
    const skill = command.key.replace(/^\//, "");
    return { kind: "draft", skill, text: `Verwende den Hermes-Skill ${JSON.stringify(skill)} für diese Aufgabe:\n${argument}` };
  }
  if (command.kind === "builtin" && command.action && ["new", "resume", "stop", "model", "help", "title", "queue", "steer"].includes(command.action)) {
    return { kind: "native", action: command.action as Extract<ChatCommandIntent, { kind: "native" }>["action"], argument };
  }
  return { kind: "unsupported", reason: "Für diesen Befehl gibt es keine verfügbare native Aktion." };
}
