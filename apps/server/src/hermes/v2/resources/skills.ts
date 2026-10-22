import type { HermesV2ResourceSkill, HermesV2ResourceSkills, HermesV2ResourceSkillDetail } from "@wrapt/contracts/hermes-v2";
import { object } from "../normalize-values.js";
import { normalizeCommands } from "../normalize-catalog.js";
import type { ResourceHost } from "./host.js";
import type { ResourceContext } from "./context.js";
import { ResourceError } from "./errors.js";
import { resourceText } from "./projection.js";

export async function skillsRead(host: ResourceHost, binding: ResourceContext, owner: string): Promise<HermesV2ResourceSkills> {
  const raw = await host.read(binding, host.path(binding, "/api/skills"));
  if (!Array.isArray(raw)) throw new ResourceError(503, "RESOURCE_UNAVAILABLE", "Die native Skillliste ist nicht bestätigt.");
  let truncated = raw.length > 500; const commands = new Set<string>();
  const manager = host.pool.peek(owner);
  if (manager?.upstream.state === "online") {
    const transport = manager.upstream.transportId; const epoch = manager.upstream.epoch;
    try {
      const result = await manager.upstream.call("commands.catalog", { profile: binding.scope.profile }); await binding.current();
      if (manager.upstream.transportId === transport && manager.upstream.epoch === epoch && manager.upstream.state === "online") {
        for (const command of normalizeCommands(result)) if (command.kind === "skill") commands.add(command.key);
      }
    } catch { binding.assert(); await binding.current(); }
  }
  const names = new Set<string>();
  const skills: HermesV2ResourceSkill[] = raw.slice(0, 500).flatMap((value) => {
    const row = object(value);
    if (typeof row.name !== "string" || !row.name || row.name.length > 200 || [...row.name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || names.has(row.name)) { truncated = true; return []; }
    names.add(row.name); const description = resourceText(host.secrets, row.description, 4000); truncated ||= description.truncated;
    const provenance = ["hub", "bundled", "external", "agent"].includes(String(row.provenance)) ? row.provenance as HermesV2ResourceSkill["provenance"] : "unknown";
    return [{ name: row.name, description: description.text, enabled: typeof row.enabled === "boolean" ? row.enabled : null,
      usage: typeof row.usage === "number" && Number.isFinite(row.usage) && row.usage >= 0 ? row.usage : null, provenance,
      slashCommand: commands.has(`/${row.name}`) ? `/${row.name}` : null, readOnly: true }];
  });
  return { scope: binding.token, skills, truncated, editorPath: "/ki-skills" };
}
export async function skillDetail(host: ResourceHost, binding: ResourceContext, owner: string, name: string): Promise<HermesV2ResourceSkillDetail> {
  const list = await skillsRead(host, binding, owner); const skill = list.skills.find((row) => row.name === name);
  if (!skill) throw new ResourceError(404, "TARGET_UNAVAILABLE", "Der genaue Skill ist nicht aktuell gelistet.");
  const raw = object(await host.read(binding, host.path(binding, `/api/skills/content?name=${encodeURIComponent(name)}`)));
  if (raw.name !== name || typeof raw.content !== "string") throw new ResourceError(503, "RESOURCE_UNAVAILABLE", "Der genaue Skilltext ist nicht bestätigt.");
  const result = resourceText(host.secrets, raw.content, 65_536, true);
  return { scope: binding.token, skill, content: { text: result.text, bytes: Buffer.byteLength(raw.content), status: raw.content ? "available" : "empty", truncated: result.truncated }, editorPath: "/ki-skills" };
}
