import type {
  HermesV2Event, HermesV2Message, HermesV2Request, HermesV2ServerMessage,
  HermesV2Session, HermesV2Snapshot, HermesV2Subagent, HermesV2ComposerSettings,
} from "@wrapt/contracts/hermes-v2";
import type { SecretRedactor } from "./secret-redactor.js";
import { HERMES_V2_TEXT_MAX_LENGTH } from "@wrapt/contracts/hermes-v2";
import { redactWork, redactWorkRoster } from "./work/redact.js";
import { boundedOutput, boundedOutputResult } from "./work/normalize.js";

/** Nur darstellbare Inhalte maskieren. Routing, IDs, Choices und Protokollzustände bleiben exakt. */
export function redactBrowserMessage(message: HermesV2ServerMessage, secrets: SecretRedactor): HermesV2ServerMessage {
  const t = (value: string) => secrets.boundedText(value, Math.max(value.length, 3));
  const n = (value: string | null) => value === null ? null : t(value);
  const composer = (value: HermesV2ComposerSettings): HermesV2ComposerSettings => ({ ...value,
    reasoning: { effort: n(value.reasoning.effort)?.slice(0, 40) ?? null, wire: n(value.reasoning.wire)?.slice(0, 40) ?? null } });
  const session = (value: HermesV2Session): HermesV2Session => ({ ...value, title: t(value.title), preview: t(value.preview), cwd: n(value.cwd) });
  const row = (value: HermesV2Message): HermesV2Message => ({ ...value, text: t(value.text), reasoning: n(value.reasoning), toolName: n(value.toolName), input: n(value.input),
    ...(value.attachments ? { attachments: value.attachments.map((file) => ({ ...file, name: t(file.name).slice(0, 200), mime: t(file.mime).slice(0, 100) })) } : {}) });
  const subagent = (value: HermesV2Subagent): HermesV2Subagent => ({ ...value, goal: secrets.boundedText(value.goal, 10_000),
    model: value.model === null ? null : secrets.boundedText(value.model, 200), lastTool: value.lastTool === null ? null : secrets.boundedText(value.lastTool, 200) });
  const request = (value: HermesV2Request): HermesV2Request => {
    switch (value.kind) {
      case "approval": return { ...value, command: t(value.command), description: t(value.description) };
      case "secret": return { ...value, label: t(value.label), hint: t(value.hint) };
      case "setup": return { ...value, question: t(value.question), options: value.options.map((option) => ({ ...option, label: t(option.label) })) };
      case "clarify": return {
        ...value,
        questions: value.questions.map((question) => ({ ...question, text: t(question.text), choices: question.choices.map(t) })),
        lockedAnswers: Object.fromEntries(Object.entries(value.lockedAnswers).map(([key, answer]) => [key, n(answer)])),
      };
    }
  };
  const snapshot = (value: HermesV2Snapshot): HermesV2Snapshot => ({
    ...value, session: session(value.session), blockedReason: n(value.blockedReason), queuedText: n(value.queuedText),
    ...(value.composer ? { composer: composer(value.composer) } : {}),
    messages: value.messages.map(row), requests: value.requests.map(request),
    inflight: value.inflight ? {
      ...value.inflight, user: t(value.inflight.user), assistant: t(value.inflight.assistant),
      displayText: n(value.inflight.displayText), corrections: value.inflight.corrections.map(t), error: n(value.inflight.error),
    } : null,
  });
  const event = (value: HermesV2Event): HermesV2Event => {
    switch (value.type) {
      case "message.delta": case "reasoning.delta":
        return { ...value, payload: { ...value.payload, text: t(value.payload.text).slice(0, HERMES_V2_TEXT_MAX_LENGTH) } };
      case "message.interim": return { ...value, payload: { ...value.payload, text: t(value.payload.text) } };
      case "message.completed": return { ...value, payload: { ...value.payload, text: t(value.payload.text), reasoning: n(value.payload.reasoning), error: n(value.payload.error) } };
      case "tool.generating": return { ...value, payload: { ...value.payload, name: t(value.payload.name) } };
      case "tool.started": return { ...value, payload: { ...value.payload, name: t(value.payload.name), input: t(value.payload.input), preview: t(value.payload.preview) } };
      case "tool.completed": return { ...value, payload: { ...value.payload, name: t(value.payload.name), output: t(value.payload.output) } };
      case "session.updated": return { ...value, payload: { ...value.payload, session: session(value.payload.session),
        ...(value.payload.composer ? { composer: composer(value.payload.composer) } : {}) } };
      case "request.opened": return { ...value, payload: request(value.payload) };
      case "subagent.updated": return { ...value, payload: subagent(value.payload) };
      case "background.completed": return { ...value, payload: { ...value.payload, text: secrets.boundedText(value.payload.text, 200_000) } };
      case "work.updated": return { ...value, payload: { ...value.payload, change: redactWork(value.payload.change, secrets) } };
      case "session.error": return { ...value, payload: { ...value.payload, message: t(value.payload.message) } };
      default: return value;
    }
  };
  switch (message.type) {
    case "connection": return message;
    case "error": return { ...message, message: t(message.message) };
    case "snapshot": return { ...message, snapshot: snapshot(message.snapshot) };
    case "event": return { ...message, event: event(message.event) };
    case "result": {
      switch (message.op) {
        case "session.create": case "session.subscribe": return { ...message, data: { snapshot: snapshot(message.data.snapshot) } };
        case "sessions.list": return { ...message, data: { ...message.data, sessions: message.data.sessions.map(session) } };
        case "history.read": return { ...message, data: { ...message.data, messages: message.data.messages.map(row) } };
        case "model.select": return { ...message, data: { ...message.data, confirmation: n(message.data.confirmation) } };
        case "session.title": return { ...message, data: { ...message.data, title: t(message.data.title).slice(0, 200) } };
        case "reasoning.select": return { ...message, data: { ...message.data, observed: composer(message.data.observed) } };
        case "work.read": return { ...message, data: redactWorkRoster(message.data, secrets) };
        case "work.subagent.tail": {
          const output = boundedOutputResult(message.data.text, secrets);
          return { ...message, data: { ...message.data, text: output.text, truncated: message.data.truncated || output.truncated } };
        }
        case "work.process.kill": return { ...message, data: { ...message.data, output: boundedOutput(message.data.output, secrets),
          error: message.data.error === null ? null : secrets.boundedText(message.data.error, 4_000) } };
        case "subagents.read": return { ...message, data: {
          subagents: message.data.subagents.map(subagent),
          background: message.data.background.map((value) => ({ ...value, command: secrets.boundedText(value.command, 4_000), output: secrets.boundedText(value.output, 16_384) })),
        } };
        case "catalog.read": return { ...message, data: {
          ...message.data,
          commands: message.data.commands.map((value) => ({ ...value, label: t(value.label), description: t(value.description), argumentHint: n(value.argumentHint), disabledReason: n(value.disabledReason),
            ...(value.subcommands ? { subcommands: value.subcommands.map((item) => t(item).slice(0, 200)) } : {}),
            ...(value.desktopSubcommands ? { desktopSubcommands: value.desktopSubcommands.map((item) => t(item).slice(0, 200)) } : {}) })),
          models: { ...message.data.models, providers: message.data.models.providers.map((provider) => ({
            ...provider, label: t(provider.label), models: provider.models.map((model) => ({ ...model, label: t(model.label), priceInput: n(model.priceInput), priceOutput: n(model.priceOutput) })),
          })) },
        } };
        default: return message;
      }
    }
  }
}
