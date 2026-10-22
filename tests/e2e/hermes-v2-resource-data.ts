import {
  hermesV2CronJobSchema, hermesV2MemorySchema, hermesV2PendingSchema,
  hermesV2ResourceSkillsSchema, hermesV2DiagnosticsSchema,
  type HermesV2CronJob, type HermesV2ResourceText,
} from "../../packages/contracts/src/hermes-v2";

export const resourceScope = "b".repeat(64);
export const resourceText = (text: string, truncated = false): HermesV2ResourceText => ({
  text, status: text ? "available" : "empty", bytes: Buffer.byteLength(text), truncated,
});

export function browserCron(id = "own-cron", values: Partial<HermesV2CronJob> = {}): HermesV2CronJob {
  return hermesV2CronJobSchema.parse({ id, name: "Eigener Prüfjob", prompt: "Nur synthetische Browserdaten prüfen",
    schedule: "every 30m", repeat: "forever", completedRuns: 2, paused: true, state: "paused",
    nextRunAt: "2080-10-17T09:00:00Z", lastRunAt: "2080-10-16T09:00:00Z", lastStatus: "completed",
    lastError: null, workdir: "/testprojekt", execution: { mode: "agent", script: null, noAgent: false },
    additional: [{ key: "model", value: "browser-model", truncated: false }], valid: true, truncated: false,
    ...values,
  });
}

export const browserMemory = () => hermesV2MemorySchema.parse({ scope: resourceScope, active: "builtin",
  providers: [{ name: "builtin", description: "Dateibasierter Speicher", available: true, configured: true,
    status: "active", setup: null }],
  files: [{ name: "MEMORY.md", ...resourceText("Eigene synthetische Projektnotiz") },
    { name: "USER.md", text: null, status: "missing", bytes: null, truncated: false }],
  builtinOnly: true, truncated: false,
});

export const browserPending = () => hermesV2PendingSchema.parse({ scope: resourceScope,
  records: [{ id: "aabb0011", subsystem: "memory", status: "pending", action: "add",
    summary: "Eigener ausstehender Memoryvorschlag", origin: "background_review", createdAt: 1_800_000_000_000,
    payload: resourceText('{"target":"memory","content":"Synthetischer Vorschlag"}'),
    matchedEntryComplete: true, truncated: false },
  { id: "aabb0022", subsystem: "skills", status: "unknown", action: null,
    summary: "Unvollständiger Skillvorschlag", origin: null, createdAt: null,
    payload: { text: null, status: "unknown", bytes: null, truncated: true },
    matchedEntryComplete: false, truncated: true }],
  coverage: "partial", truncated: true, review: { supported: false, adminPath: "/hermes" },
});

export const browserSkills = () => hermesV2ResourceSkillsSchema.parse({ scope: resourceScope,
  skills: [{ name: "eigener-browser-skill", description: "Persönlicher synthetischer Skill", enabled: true,
    usage: 3, provenance: "external", slashCommand: "/eigener-browser-skill", readOnly: true },
  { name: "offizieller-browser-skill", description: "Synthetischer gebündelter Skill", enabled: false,
    usage: null, provenance: "bundled", slashCommand: null, readOnly: true }],
  truncated: false, editorPath: "/ki-skills",
});

export const browserDiagnostics = () => hermesV2DiagnosticsSchema.parse({ scope: resourceScope,
  connection: { state: "online", epoch: "browser-epoch", subscriptions: 0, protectedRuntime: false },
  dashboard: { reachable: true, version: "browser-test", gatewayState: "ready", error: null },
  update: { phase: "idle", pending: false, lastResult: "succeeded", lastCheckedAt: "2080-10-17T08:00:00Z",
    logTail: resourceText("Eigener redigierter Updatelog") },
  logs: resourceText("Eigener redigierter Agentlog. token=***"), truncated: false, adminPath: "/hermes",
});
