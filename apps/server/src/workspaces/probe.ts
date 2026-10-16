import { healthResponseSchema, type WorkspaceProbeResponse, type WorkspaceProbeStatus } from "@wrapt/contracts";

const PROBE_TIMEOUT_MS = 7_000;

/**
 * Erreichbarkeits-Test gegen einen anderen Workspace. Läuft bewusst auf dem
 * Server statt im Browser: Der Health-Endpunkt sendet seit der S-008-Härtung
 * kein `Access-Control-Allow-Origin` mehr (kein fremdes Cross-Origin-Lesen),
 * ein Browser-Probe gegen einen anderen Origin wäre deshalb immer „offline".
 */
export async function probeWorkspaceUrl(
  url: string,
  expectedVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<WorkspaceProbeResponse> {
  const target = parseProbeTarget(url);
  if (!target) return probeResult("offline", false);
  try {
    const response = await fetcher(new URL("/api/v1/health", target).toString(), {
      method: "GET",
      // Keine Redirects folgen: Ein Ziel darf den Probe-Request nicht auf
      // andere Hosts umleiten.
      redirect: "manual",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) return probeResult("no-access", false);
    if (response.status < 200 || response.status >= 300) return probeResult("offline", false);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return probeResult("offline", false);
    }
    return deriveWorkspaceStatusFromHealth(response.status, body, expectedVersion);
  } catch (error) {
    return probeResult(deriveWorkspaceStatusFromFetchError(error), false);
  }
}

/** Nur HTTPS oder Loopback-HTTP: kein Klartext zu fremden Hosts, kein SSRF-Pfad in interne Netze. */
function parseProbeTarget(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  if (parsed.protocol === "https:") return parsed;
  if (parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname)) return parsed;
  return null;
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || host.startsWith("127.");
}

export function deriveWorkspaceStatusFromFetchError(error: unknown): WorkspaceProbeStatus {
  if (!error || typeof error !== "object") return "offline";
  const candidate = error as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown; cause?: unknown };
  const status = candidate.status ?? candidate.statusCode;
  if (status === 401 || status === 403) return "no-access";
  const cause = candidate.cause && typeof candidate.cause === "object"
    ? candidate.cause as { message?: unknown; code?: unknown }
    : null;
  const message = [candidate.message, candidate.code, cause?.message, cause?.code]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|NXDOMAIN|DNS lookup|name .*not .*resolved/i.test(message)) return "not-tailnet";
  return "offline";
}

export function deriveWorkspaceStatusFromHealth(statusCode: number, body: unknown, expectedVersion: string): WorkspaceProbeResponse {
  if (statusCode === 401 || statusCode === 403) return probeResult("no-access", false);
  if (statusCode < 200 || statusCode >= 300) return probeResult("offline", false);

  const parsed = healthResponseSchema.safeParse(body);
  if (parsed.success) {
    const { version, instanceName, appName, bootId } = parsed.data;
    if (!instanceName) return probeResult("incompatible", true, version, null, appName, bootId);
    return probeResult(versionsCompatible(version, expectedVersion) ? "live" : "incompatible", true, version, instanceName, appName, bootId);
  }

  if (isLegacyHealth(body)) {
    return probeResult("incompatible", true, body.version, typeof body.instanceName === "string" ? body.instanceName : null, body.appName);
  }
  return probeResult("offline", false);
}

function isLegacyHealth(value: unknown): value is { status: "ok"; version: string; appName: string; instanceName?: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.status === "ok" && typeof candidate.version === "string" && typeof candidate.appName === "string";
}

function versionsCompatible(remote: string, expected: string): boolean {
  const remoteVersion = parseReleaseLine(remote);
  const expectedVersion = parseReleaseLine(expected);
  return remoteVersion && expectedVersion
    ? remoteVersion.major === expectedVersion.major && remoteVersion.minor === expectedVersion.minor
    : remote === expected;
}

function parseReleaseLine(version: string): { major: number; minor: number } | null {
  const match = /^(\d+)\.(\d+)\.\d+(?:[-+][\w.-]+)?$/.exec(version.trim());
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
}

function probeResult(
  status: WorkspaceProbeStatus,
  reachable: boolean,
  version: string | null = null,
  instanceName: string | null = null,
  appName: string | null = null,
  bootId: string | null = null,
): WorkspaceProbeResponse {
  return { status, reachable, version, instanceName, appName, bootId };
}
