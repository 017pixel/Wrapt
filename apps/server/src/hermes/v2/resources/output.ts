import type { z } from "zod";
import type { ResourceHost } from "./host.js";
import type { ResourceContext } from "./context.js";
import { redactResource } from "./projection.js";
import { resourcePolicy } from "./policy.js";
import { ResourceError } from "./errors.js";

/** Der letzte Await liegt vor Redaction, Schema- und tatsächlicher JSON-Byteprüfung. */
export async function resourceOutput<T>(host: ResourceHost, binding: ResourceContext, schema: z.ZodType<T>, value: T): Promise<T> {
  await binding.current(); binding.assert();
  const output = redactResource(value, host.secrets) as T & Record<string, unknown>;
  const size = () => Buffer.byteLength(JSON.stringify(output));
  while (size() > resourcePolicy.responseBytes) {
    const key = ["jobs", "runs", "skills", "records", "providers"].find((name) => Array.isArray(output[name]) && (output[name] as unknown[]).length > 0);
    if (!key) throw new ResourceError(503, "RATE_LIMITED", "Die begrenzte Ressourcenansicht ist zu groß.");
    (output[key] as unknown[]).pop();
    if ("truncated" in output) (output as Record<string, unknown>).truncated = true;
    if ("coverage" in output) (output as Record<string, unknown>).coverage = "partial";
  }
  const parsed = schema.safeParse(output);
  if (!parsed.success) throw new ResourceError(503, "RESOURCE_UNAVAILABLE", "Die native Ressourcenprojektion ist nicht bestätigt.");
  return parsed.data;
}
