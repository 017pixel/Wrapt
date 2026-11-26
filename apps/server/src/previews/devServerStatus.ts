import type { PreviewDevServerStatus } from "@wrapt/contracts";
import type { RuntimeProfileResult } from "./runtimeProfiles.js";
import { serviceState, type PaneState } from "./runtimeStatus.js";

/** Baut den Preview-Status aus Profil, tmux-Panes und Veröffentlichung. */
export async function buildDevServerStatus(input: {
  userId: string;
  projectId: string;
  profile: (projectId: string) => Promise<RuntimeProfileResult>;
  profileForSession: (userId: string, projectId: string, profile: RuntimeProfileResult) => Promise<RuntimeProfileResult>;
  sessionName: (userId: string, projectId: string) => string;
  panes: (name: string) => Promise<PaneState[]>;
  selectedMainPort: (userId: string, projectId: string, profile: RuntimeProfileResult) => number | null;
  allowedProjectPorts: readonly number[];
  publicationUrl: () => string | null;
}): Promise<PreviewDevServerStatus> {
  const detectedProfile = await input.profile(input.projectId);
  const profile = await input.profileForSession(input.userId, input.projectId, detectedProfile);
  const name = input.sessionName(input.userId, input.projectId);
  const panes = new Map((await input.panes(name)).map((pane) => [pane.serviceId, pane]));
  const services = profile.services.map((service) => serviceState(service, panes.get(service.id)));
  const running = services.filter((service) => service.state === "running");
  const failed = services.filter((service) => service.state === "failed");
  const aggregate = failed.length > 0 ? "failed" : running.length > 0 ? "running" : "stopped";
  const mainPort = input.selectedMainPort(input.userId, input.projectId, profile);
  return {
    projectId: input.projectId,
    state: aggregate,
    command: services.length === 1 ? services[0]!.command : `${services.length} Dienste gemeinsam`,
    mainPort,
    mainServiceId: profile.services.find((service) => service.port === mainPort)?.id ?? profile.mainServiceId,
    profileSource: profile.source,
    services,
    allowedPorts: [...input.allowedProjectPorts],
    warnings: profile.warnings,
    publicUrl: input.publicationUrl(),
    pid: running[0]?.pid ?? null,
    startedAt: running.map((service) => service.startedAt).filter((value): value is string => value !== null).sort()[0] ?? null,
    updatedAt: new Date().toISOString(),
    exitCode: failed[0]?.exitCode ?? null,
    message: failed.length > 0 ? `${failed.length} ${failed.length === 1 ? "Dienst ist" : "Dienste sind"} fehlgeschlagen.` : null,
  } as PreviewDevServerStatus;
}
