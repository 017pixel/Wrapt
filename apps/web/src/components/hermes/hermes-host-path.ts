import { safeHermesPath } from "./HermesAdminFrame";

function hasControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

/** Bestehender interner SPApfad, niemals eine freie URL aus Hostmetadaten. */
export function hermesHostPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048 || /[\\#]/.test(value) || hasControl(value)) return null;
  if (safeHermesPath(value) !== value) return null;
  try {
    const pathname = decodeURIComponent(value.split("?")[0]!);
    if (pathname.startsWith("//") || pathname.split("/").includes("..") || pathname.includes("\\") || hasControl(pathname)) return null;
  } catch { return null; }
  return value;
}

export function hermesSessionFromHostPath(value: unknown): string | null {
  const path = hermesHostPath(value);
  if (!path?.startsWith("/chat?")) return null;
  const ids = new URLSearchParams(path.slice("/chat?".length)).getAll("resume");
  const id = ids[0];
  return ids.length === 1 && id && id.length <= 200 && !hasControl(id) ? id : null;
}

export function hermesPathFromHostState(state: unknown): string | null {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  return hermesHostPath((state as Record<string, unknown>).hermesAdminPath);
}
