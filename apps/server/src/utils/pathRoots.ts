import { isAbsolute, relative, resolve, sep } from "node:path";
import { realpathSync } from "node:fs";

const DARWIN_PATH_ALIASES = ["/var", "/tmp", "/etc"] as const;

/** Vergleicht Pfade, ohne bekannte macOS-Systemaliases als Symlinks zu behandeln. */
export function normalizePlatformPathAlias(value: string): string {
  const absolute = resolve(value);
  if (process.platform !== "darwin") return absolute;
  for (const alias of DARWIN_PATH_ALIASES) {
    if (absolute === alias || absolute.startsWith(`${alias}/`)) {
      return absolute.replace(alias, `/private${alias}`);
    }
  }
  return absolute;
}

export function contained(root: string, target: string): boolean {
  const pathFromRoot = relative(normalizePlatformPathAlias(root), normalizePlatformPathAlias(target));
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

export function sameFilesystemPath(left: string, right: string): boolean {
  return normalizePlatformPathAlias(left) === normalizePlatformPathAlias(right);
}

/** Gibt einen physischen Pfad in der Schreibweise des konfigurierten Roots zurück. */
export function preserveRootAlias(value: string, configuredRoot: string): string {
  const root = resolve(configuredRoot);
  const canonicalRoot = normalizePlatformPathAlias(root);
  const canonicalValue = normalizePlatformPathAlias(value);
  if (!contained(canonicalRoot, canonicalValue)) return value;
  return resolve(root, relative(canonicalRoot, canonicalValue));
}

/** Normalisiert erlaubte Roots nur für bekannte Betriebssystem-Aliases. */
export function canonicalRootCandidates(roots: readonly string[]): string[] {
  return [...new Set(roots.flatMap((value) => {
    const lexical = normalizePlatformPathAlias(value);
    try { return [lexical, normalizePlatformPathAlias(realpathSync(resolve(value)))]; }
    catch { return [lexical]; }
  }))];
}

/** Normalisiert absolute Pfade unter einem konfigurierten Alias auf dessen Root. */
export function resolvePathWithinRootAliases(
  input: string | undefined,
  canonicalRoot: string,
  aliases: readonly string[],
): string {
  const value = input?.trim();
  if (!value || value === "~") return resolve(canonicalRoot);
  const root = normalizePlatformPathAlias(canonicalRoot);
  const requested = value.startsWith("~/")
    ? resolve(root, value.slice(2))
    : normalizePlatformPathAlias(resolve(root, value));
  const alias = aliases.find((candidate) => contained(candidate, requested));
  return alias ? preserveRootAlias(resolve(root, relative(normalizePlatformPathAlias(alias), requested)), canonicalRoot) : requested;
}
