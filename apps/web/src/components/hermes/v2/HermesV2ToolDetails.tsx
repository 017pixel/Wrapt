import { CopyButton, TextBlock } from "./HermesV2Markdown";
import type { ChatToolView } from "./chat-types";

/** JSON bleibt vollständig erhalten, Befehle werden als lesbares Skript gezeigt. */
export function toolInputParts(input: string): { command: string | null; parameters: string | null } {
  try {
    const parsed: unknown = JSON.parse(input);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const key = ["command", "cmd", "script"].find((name) => typeof record[name] === "string");
      if (key) {
        const rest = Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
        return {
          command: record[key] as string,
          parameters: Object.keys(rest).length ? JSON.stringify(rest, null, 2) : null,
        };
      }
    }
    return { command: null, parameters: JSON.stringify(parsed, null, 2) };
  } catch {
    return { command: null, parameters: input };
  }
}

function ToolSection({ label, text, kind }: { label: string; text: string; kind: string }) {
  return (
    <section className="hermesv2-tool-section">
      <header>
        <h4>{label}</h4>
        <CopyButton text={text} label={`${label} kopieren`} />
      </header>
      <TextBlock text={text} className={kind} />
    </section>
  );
}

export function HermesV2ToolDetails({ tool }: { tool: ChatToolView }) {
  const input = tool.input === null ? null : toolInputParts(tool.input);
  return (
    <>
      {input?.command !== null && input?.command !== undefined ? (
        <ToolSection label="Befehl" text={input.command} kind="is-input" />
      ) : null}
      {input?.parameters !== null && input?.parameters !== undefined ? (
        <ToolSection label={input.command === null ? "Eingabe" : "Parameter"} text={input.parameters} kind="is-input" />
      ) : null}
      {tool.output !== null ? (
        <ToolSection label="Ausgabe" text={tool.output} kind="is-output" />
      ) : null}
    </>
  );
}
