const legacyAliases = {
  PROJECT_BROWSER_ROOT: "ORBIT_PROJECT_BROWSER_ROOT",
  PROJECT_BROWSER_PAGE_SIZE: "ORBIT_PROJECT_BROWSER_PAGE_SIZE",
  RECENT_PROJECT_LIMIT: "ORBIT_RECENT_PROJECT_LIMIT",
  WRAPT_PROFILES_ROOT: "WORKBENCH_PROFILES_ROOT",
  WRAPT_DEV_TAILSCALE_USER: "WORKBENCH_DEV_TAILSCALE_USER",
  WRAPT_DEV_BACKEND_URL: "WORKBENCH_DEV_BACKEND_URL",
  WRAPT_HEALTH_URL: "WORKBENCH_HEALTH_URL",
  WRAPT_BASE_URL: "WORKBENCH_BASE_URL",
  WRAPT_DATA_DIR: "WORKBENCH_DATA_DIR",
  WRAPT_API: "WORKBENCH_API",
} as const;

const legacyPathEnvironmentKeys = [
  "DATABASE_PATH",
  "DATA_DIR",
  "FILE_GALLERY_DIR",
  "WRAPT_PROFILES_ROOT",
] as const;

function canonicalizeKnownPath(value: string): string {
  return value
    .replaceAll("/.local/share/remote-workplace", "/.local/share/wrapt")
    .replaceAll("/.workbench-profiles", "/.wrapt-profiles")
    .replaceAll("/workbench.sqlite", "/wrapt.sqlite");
}

export function canonicalizeWraptEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result = { ...input };
  for (const [canonical, legacy] of Object.entries(legacyAliases)) {
    if (result[canonical] === undefined && result[legacy as keyof NodeJS.ProcessEnv] !== undefined) {
      result[canonical] = result[legacy as keyof NodeJS.ProcessEnv];
    }
  }
  for (const key of legacyPathEnvironmentKeys) {
    const value = result[key];
    if (value !== undefined) result[key] = canonicalizeKnownPath(value);
  }
  return result;
}
