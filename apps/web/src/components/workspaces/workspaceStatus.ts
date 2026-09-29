import { healthResponseSchema } from "@wrapt/contracts";

export type WorkspaceStatus = "live" | "offline" | "not-tailnet" | "no-access" | "incompatible" | "not-checked" | "checking";

export interface WorkspaceProbeResult {
  status: WorkspaceStatus;
  reachable: boolean;
  version: string | null;
  instanceName: string | null;
  appName: string | null;
  bootId: string | null;
}

export function resolveWorkspaceSelfName(instanceName?: string | null, appName?: string | null): string {
  return instanceName?.trim() || appName?.trim() || "Dieses Gerät";
}

export const workspaceStatusLabels: Record<WorkspaceStatus, string> = {
  live: "Live",
  offline: "Offline",
  "not-tailnet": "Nicht im Tailnet (DNS-Fehler)",
  "no-access": "Kein Zugriff",
  incompatible: "Version inkompatibel",
  "not-checked": "Noch nicht geprüft",
  checking: "Prüfe Verbindung …",
};

export function deriveWorkspaceStatusFromFetchError(error: unknown): WorkspaceStatus {
  if (!error || typeof error !== "object") return "offline";
  const candidate = error as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
  const status = candidate.status ?? candidate.statusCode;
  if (status === 401 || status === 403) return "no-access";
  const message = [candidate.message, candidate.code].filter((value): value is string => typeof value === "string").join(" ");
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|NXDOMAIN|DNS lookup|name .*not .*resolved/i.test(message)) return "not-tailnet";
  return "offline";
}

export function deriveWorkspaceStatusFromHealth(statusCode: number, body: unknown, expectedVersion: string): WorkspaceProbeResult {
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
  status: WorkspaceStatus,
  reachable: boolean,
  version: string | null = null,
  instanceName: string | null = null,
  appName: string | null = null,
  bootId: string | null = null,
): WorkspaceProbeResult {
  return { status, reachable, version, instanceName, appName, bootId };
}

export async function probeWorkspaceHealth(
  url: string,
  expectedVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<WorkspaceProbeResult> {
  try {
    const response = await fetcher(`${url}/api/v1/health`, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(7_000),
    });
    if (response.status === 401 || response.status === 403) return probeResult("no-access", false);
    if (!response.ok) return probeResult("offline", false);
    return deriveWorkspaceStatusFromHealth(response.status, await response.json(), expectedVersion);
  } catch (error) {
    return probeResult(deriveWorkspaceStatusFromFetchError(error), false);
  }
}
