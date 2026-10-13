import type { PreviewDevServerDatabase } from "./devServerDatabase.js";
import type { RuntimeProfileResult } from "./runtimeProfiles.js";

export function selectedRuntimeMainPort(database: PreviewDevServerDatabase, allowedPorts: readonly number[],
  userId: string, projectId: string, profile: RuntimeProfileResult): number | null {
    const stored = database.projectPreference(userId, projectId);
    if (stored?.mainServiceId) {
      const servicePort = profile.services.find((service) => service.id === stored.mainServiceId)?.port;
      if (servicePort !== undefined) return servicePort;
    }
    if (stored?.mainPort !== null && stored?.mainPort !== undefined && allowedPorts.includes(stored.mainPort) && profile.services.some((service) => service.port === stored.mainPort)) return stored.mainPort;
    return profile.services.find((service) => service.id === profile.mainServiceId)?.port ?? null;
}

export function applyRuntimeSessionPorts(profile: RuntimeProfileResult, raw: string | null,
  allowedPorts: readonly number[]): RuntimeProfileResult {
    if (!raw) return profile;
    try {
      const ports = JSON.parse(raw) as Record<string, unknown>;
      const services = profile.services.map((service) => {
        const port = ports[service.id];
        if (port === null) return { ...service, port: null };
        if (typeof port === "number" && allowedPorts.includes(port)) return { ...service, port };
        return service;
      });
      return { ...profile, services };
    } catch {
      return profile;
    }
}
