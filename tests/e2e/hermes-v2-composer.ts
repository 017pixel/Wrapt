import {
  hermesV2ModelCatalogSchema, type HermesV2ClientMessage, type HermesV2Command,
  type HermesV2ComposerSettings, type HermesV2Effort, type HermesV2Event,
  type HermesV2ModelCatalog, type HermesV2ServerMessage, type HermesV2Snapshot,
} from "../../packages/contracts/src/hermes-v2";

type Operation = Extract<HermesV2ClientMessage, { op: "catalog.read" | "model.select" | "reasoning.select" | "session.title" }>;
type Reply = Extract<HermesV2ServerMessage, { type: "result"; op: Operation["op"] }>;
interface Gateway {
  readonly stories: Map<string, { snapshot: HermesV2Snapshot }>;
  emit(sessionId: string, type: HermesV2Event["type"], payload: unknown): void;
}

export const composerSettings = (): HermesV2ComposerSettings => ({
  reasoning: { effort: "medium", wire: "medium" },
  approvals: { mode: "manual", effectiveBypass: false, scope: "global", editable: false, options: [] },
});
const native = ["new", "resume", "stop", "model", "help", "queue", "steer", "title"] as const;

/** Echte öffentliche Composerformen mit ausschließlich synthetischen Katalogdaten. */
export class HermesV2BrowserComposer {
  commands: HermesV2Command[] = [
    ...native.map((action): HermesV2Command => ({
      key: `/${action}`, label: `/${action}`, description: `Native Aktion ${action}`,
      kind: "builtin", action, argumentHint: action === "model" ? "list | set" : null,
      disabledReason: null, aliases: action === "model" ? ["/m"] : [],
      argumentMode: action === "model" ? "options" : null,
      subcommands: action === "model" ? ["list", "set"] : [], desktopSubcommands: null,
    })),
    { key: "/eigener_testskill", label: "/eigener_testskill", description: "Skill aus dem synthetischen Hermes-Katalog",
      kind: "skill", action: "skill", argumentHint: "Aufgabe", disabledReason: null },
    { key: "/update", label: "/update", description: "Hermes aktualisieren", kind: "unsupported", action: null,
      argumentHint: null, disabledReason: "Dieser Befehl ist nur in der klassischen Oberfläche verfügbar." },
  ];
  readonly observations: Array<{ op: Operation["op"]; sessionId: string; model?: string; provider?: string;
    confirmed?: boolean; effort?: string; title?: string }> = [];
  readonly hermesEfforts: HermesV2Effort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
  deferModelSelection = false;
  requireConfirmation = true;
  titlePending = false;
  unconfirmedReasoning = false;
  hold = false;
  private pending: Array<() => void> = [];

  constructor(private readonly gateway: Gateway) {}

  seed(sessionId: string): void { this.snapshot(sessionId).composer = composerSettings(); }
  finishPending(): void { for (const callback of this.pending.splice(0)) callback(); }
  dispose(): void { this.pending = []; }

  catalog(sessionId: string, optIn = true): HermesV2ModelCatalog {
    const model = (id: string, label: string, canDisableReasoning: boolean) => ({
      id, label, reasoningEfforts: [], fast: id === "fast-model", priceInput: null, priceOutput: null,
      ...(optIn ? { reportedReasoning: true, canDisableReasoning } : {}),
    });
    return hermesV2ModelCatalogSchema.parse({ current: this.snapshot(sessionId).selection, providers: [
      { id: "test", label: "Testanbieter", available: true, models: [model("browser-model", "Browser-Modell", false)] },
      { id: "fast", label: "Schneller Testanbieter", available: true, models: [model("fast-model", "Schnelles Testmodell", true)] },
      { id: "premium", label: "Premium-Testanbieter", available: true, models: [model("costly-model", "Kostenpflichtiges Testmodell", true)] },
      { id: "unavailable", label: "Nicht verfügbarer Testanbieter", available: false,
        models: [model("unavailable-model", "Nicht verfügbares Testmodell", false)] },
    ] });
  }

  handle(message: Operation, reply: (frame: Reply) => void, fail: () => void, optIn: boolean): void {
    const snapshot = this.snapshot(message.sessionId);
    const base = { v: 1 as const, type: "result" as const, id: message.id };
    if (message.op === "catalog.read") {
      reply({ ...base, op: message.op, data: { commands: this.commands.map((command) => {
        if (optIn) return command;
        return { key: command.key, label: command.label, description: command.description,
          kind: command.kind, action: command.action, argumentHint: command.argumentHint, disabledReason: command.disabledReason };
      }), models: this.catalog(message.sessionId, optIn), ...(optIn ? { hermesEfforts: this.hermesEfforts } : {}) } });
      return;
    }
    if (!optIn || !snapshot.writable) { fail(); return; }
    const finish = () => {
      if (message.op === "session.title") {
        this.observations.push({ op: message.op, sessionId: message.sessionId, title: message.title });
        if (!this.titlePending) { snapshot.session.title = message.title; this.changed(message.sessionId); }
        reply({ ...base, op: message.op, data: { title: message.title, pending: this.titlePending } });
      } else if (message.op === "model.select") {
        const provider = this.catalog(message.sessionId).providers.find((row) => row.id === message.selection.provider);
        if (!provider?.available || !provider.models.some((model) => model.id === message.selection.model)) { fail(); return; }
        this.observations.push({ op: message.op, sessionId: message.sessionId, ...message.selection, confirmed: message.confirmed === true });
        const confirmation = this.requireConfirmation && message.selection.provider === "premium" && message.confirmed !== true
          ? "Dieses Testmodell verursacht höhere Kosten. Wechsel bestätigen?" : null;
        if (!confirmation && !this.deferModelSelection) {
          snapshot.selection = message.selection;
          snapshot.session.model = message.selection.model;
          snapshot.session.provider = message.selection.provider;
          this.changed(message.sessionId);
        }
        reply({ ...base, op: message.op, data: { selection: message.selection, deferred: this.deferModelSelection, confirmation } });
      } else {
        if (snapshot.running !== false || snapshot.selection?.model !== message.selection.model
          || snapshot.selection.provider !== message.selection.provider) { fail(); return; }
        this.observations.push({ op: message.op, sessionId: message.sessionId, effort: message.effort });
        const settings = snapshot.composer ?? composerSettings();
        if (!this.unconfirmedReasoning) settings.reasoning = { effort: message.effort, wire: message.effort === "ultra" ? "high" : message.effort };
        snapshot.composer = settings;
        snapshot.reasoningEffort = settings.reasoning.effort;
        this.changed(message.sessionId);
        reply({ ...base, op: message.op, data: { requested: message.effort, observed: settings,
          observation: this.unconfirmedReasoning ? "unconfirmed" : "observed" } });
      }
    };
    if (this.hold) this.pending.push(finish); else finish();
  }

  private changed(sessionId: string): void {
    const snapshot = this.snapshot(sessionId);
    this.gateway.emit(sessionId, "session.updated", { session: snapshot.session, selection: snapshot.selection,
      turnStartedAt: snapshot.turnStartedAt, ...(snapshot.composer ? { composer: snapshot.composer } : {}) });
  }
  private snapshot(sessionId: string): HermesV2Snapshot {
    const snapshot = this.gateway.stories.get(sessionId)?.snapshot;
    if (!snapshot) throw new Error("Composer-Testsession fehlt.");
    return snapshot;
  }
}
