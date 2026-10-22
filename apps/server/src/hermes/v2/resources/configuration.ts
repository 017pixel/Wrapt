import type { HermesV2Configuration, HermesV2ConfigurationUpdate } from "@wrapt/contracts/hermes-v2";
import { object } from "../normalize-values.js";
import type { ResourceHost, ResourceMutation } from "./host.js";
import type { ResourceContext } from "./context.js";
import { ResourceError } from "./errors.js";

const text = (value: unknown, limit: number) => typeof value === "string" && value.length <= limit ? value : null;

/** Nur freigegebene Einzelwerte verlassen den Adapter, niemals die ganze Konfiguration. */
export async function configurationRead(host: ResourceHost, binding: ResourceContext): Promise<HermesV2Configuration> {
  const raw = object(await host.read(binding, host.path(binding, "/api/config")));
  if (!Object.keys(raw).length) throw new ResourceError(503, "RESOURCE_UNAVAILABLE", "Die Hermes-Konfiguration ist nicht verfügbar.");
  const agent = object(raw.agent);
  const compression = object(raw.compression);
  const maxTurns = agent.max_turns;
  return {
    scope: binding.token,
    profile: binding.scope.profile,
    model: text(raw.model, 500) ?? text(object(raw.model).default, 500),
    approvalMode: text(object(raw.approvals).mode, 40),
    values: {
      timezone: text(raw.timezone, 100),
      maxTurns: typeof maxTurns === "number" && Number.isInteger(maxTurns) && maxTurns >= 1 && maxTurns <= 10_000 ? maxTurns : null,
      compressionEnabled: typeof compression.enabled === "boolean" ? compression.enabled : null,
    },
  };
}

export async function configurationUpdate(
  host: ResourceHost,
  binding: ResourceContext,
  mutation: ResourceMutation,
  input: HermesV2ConfigurationUpdate,
): Promise<HermesV2Configuration> {
  const changes = input.changes;
  if (changes.timezone) {
    try { new Intl.DateTimeFormat("de-DE", { timeZone: changes.timezone }); }
    catch { throw new ResourceError(400, "INVALID_RESOURCE_REQUEST", "Diese Zeitzone ist nicht gültig."); }
  }
  const config: Record<string, unknown> = {};
  if (changes.timezone !== undefined) config.timezone = changes.timezone;
  if (changes.maxTurns !== undefined) config.agent = { max_turns: changes.maxTurns };
  if (changes.compressionEnabled !== undefined) config.compression = { enabled: changes.compressionEnabled };
  const guard = async () => {
    const current = await configurationRead(host, binding);
    if (JSON.stringify(current.values) !== JSON.stringify(input.expected)) {
      throw new ResourceError(409, "STALE_RESOURCE_CONTEXT", "Die Konfiguration wurde inzwischen geändert. Bitte neu laden.");
    }
  };
  const receipt = object(await mutation.send(host, binding, "put", host.path(binding, "/api/config"), { config }, guard));
  if (receipt.ok !== true) throw new ResourceError(503, "UNKNOWN_OUTCOME", "Der Speicherausgang ist unklar. Bitte neu laden.", "unknown");
  const result = await configurationRead(host, binding);
  for (const key of ["timezone", "maxTurns", "compressionEnabled"] as const) {
    if (changes[key] !== undefined && result.values[key] !== changes[key]) {
      throw new ResourceError(503, "UNKNOWN_OUTCOME", "Die gespeicherten Werte konnten nicht bestätigt werden. Bitte neu laden.", "unknown");
    }
  }
  return result;
}
