import { lstatSync, realpathSync, type Stats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import type { OrganizationScope } from "./organization/scope.js";

interface HomeVersion { identity: string | null; generation: number }
const owners = new WeakMap<object, HomeVersion>();
const scopes = new WeakMap<OrganizationScope, HomeVersion>();
const stale = () => new Error("Die bestätigte HOME-Identität hat sich geändert.");
const identity = (scope: OrganizationScope, stat: Stats) => JSON.stringify([scope.id, stat.dev, stat.ino]);
function revoke(version: HomeVersion | undefined): never {
  if (version) { version.identity = null; version.generation++; }
  throw stale();
}
function observe(version: HomeVersion, value: string): void {
  if (version.identity !== value) { version.identity = value; version.generation++; }
}
function directory(stat: Stats, canonical: string, scope: OrganizationScope): boolean {
  return stat.isDirectory() && !stat.isSymbolicLink() && canonical === scope.home;
}

/** Auch ein nur asynchron beobachteter Ersatz entwertet alle alten HOME-Belege. */
export async function requireCanonicalHome(scope: OrganizationScope): Promise<void> {
  const version = scopes.get(scope);
  try {
    const canonical = await realpath(scope.home);
    const stat = await lstat(scope.home);
    if (!directory(stat, canonical, scope)) throw stale();
    if (version) observe(version, identity(scope, stat));
  } catch { revoke(version); }
}

/** Ein Besitzer pro ScopeResolver, gemeinsam für Anhänge und Ressourcen. */
export function captureHomeProof(scope: OrganizationScope, owner: object) {
  let version = owners.get(owner);
  if (!version) { version = { identity: null, generation: 0 }; owners.set(owner, version); }
  scopes.set(scope, version);
  const state = version;
  const stat = () => {
    try {
      const value = lstatSync(scope.home);
      if (directory(value, realpathSync(scope.home), scope)) return value;
    } catch { /* Fehlende Identität widerruft dieselbe gemeinsame Generation. */ }
    return revoke(state);
  };
  // Vor dem ersten Await einfrieren, damit die Erfassung selbst keinen Wechsel verdeckt.
  const home = stat();
  observe(state, identity(scope, home));
  const generation = state.generation;
  const assert = () => {
    if (state.generation !== generation) throw stale();
    const now = stat();
    if (now.dev !== home.dev || now.ino !== home.ino) revoke(state);
  };
  const current = async () => {
    assert(); await requireCanonicalHome(scope); assert();
    // Separater FS-Beleg: auch ein zurückgegebener Ersatzstat bleibt beobachtet.
    let now: Stats;
    try { now = await lstat(scope.home); } catch { return revoke(state); }
    assert();
    if (!now.isDirectory() || now.isSymbolicLink() || now.dev !== home.dev || now.ino !== home.ino) revoke(state);
  };
  return { dev: home.dev, ino: home.ino, generation, assert, current };
}
