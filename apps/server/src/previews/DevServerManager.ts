import { serviceState } from "./runtimeStatus.js";
import { PreviewRuntimePublications, type PreviewRuntimePublication } from "./runtimePublications.js";
export type { PreviewRuntimePublication } from "./runtimePublications.js";
import { createHash } from "node:crypto";
import type {
  PreviewDevServerLogs,
  PreviewDevServerStatus,
  PreviewExternalOpenMode,
  PreviewHubPreference,
  PreviewRuntimeProfile,
  Project,
} from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { assertDevServerCommandConfirmed, devServerCommandPreview, type DevServerCommandPreview } from "./devServerConfirmations.js";
import { detectRuntimeProfile, type RuntimeProfileResult } from "./runtimeProfiles.js";

import { PreviewRuntimeSupervisor, cleanOutput, RUNTIME_PORTS_OPTION, type RuntimeSessionSnapshot } from "./runtimeSupervisor.js";
import { applyRuntimeSessionPorts, selectedRuntimeMainPort } from "./runtimePorts.js";
import { readRuntimeLogs } from "./runtimeLogs.js";
import type { PreviewDevServerManagerOptions } from "./runtimeManagerOptions.js";
export type { PreviewDevServerManagerOptions } from "./runtimeManagerOptions.js";
export { sanitizeDevServerPath } from "./runtimeSupervisor.js";

// S-006: Projekt-Code läuft als Server-Benutzer (gleiche UID) und kann die
// Workbench-API erreichen. Dieser Hinweis steht in jeder Statusantwort, damit
// die Oberfläche ihn beim Start bestätigen kann.
export const PREVIEW_TRUST_HINT =
  "Nur vertrauenswürdige Repos starten: Preview-Befehle laufen als Server-Benutzer.";


export class PreviewDevServerManager {
  private readonly supervisor: PreviewRuntimeSupervisor;
  private readonly watchdogIntervalMilliseconds: number;
  private readonly watchdogMaxAttemptsPerWindow: number;
  private readonly watchdogWindowMilliseconds: number;
  private readonly restartHistory = new Map<string, number[]>();
  private readonly publications = new PreviewRuntimePublications();
  private startQueue: Promise<void> = Promise.resolve();
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private tickPromise: Promise<void> | null = null;

  constructor(private readonly options: PreviewDevServerManagerOptions) {
    this.supervisor = new PreviewRuntimeSupervisor(options);
    this.watchdogIntervalMilliseconds = options.watchdogIntervalMilliseconds ?? 10_000;
    this.watchdogMaxAttemptsPerWindow = options.watchdogMaxAttemptsPerWindow ?? 3;
    this.watchdogWindowMilliseconds = options.watchdogWindowMilliseconds ?? 5 * 60_000;
  }

  async profile(projectId: string): Promise<RuntimeProfileResult> {
    const project = await this.resolveProject(projectId);
    try { return await detectRuntimeProfile(project, this.options.allowedProjectPorts); }
    catch (error) {
      throw new AppError(409, "PREVIEW_RUNTIME_PROFILE_INVALID", error instanceof Error ? error.message : "Die Projektlaufzeit konnte nicht erkannt werden.");
    }
  }

  /** S-013: Aktuelle Befehls-Vorschau mit Hash für die explizite Bestätigung. */
  async commandPreview(projectId: string): Promise<DevServerCommandPreview> {
    const project = await this.resolveProject(projectId);
    return devServerCommandPreview(projectId, project.path, await this.profile(projectId));
  }

  async status(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    let detectedProfile: RuntimeProfileResult;
    try {
      detectedProfile = await this.profile(projectId);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "PREVIEW_RUNTIME_PROFILE_INVALID") throw error;
      return {
        projectId, state: "stopped", command: "Keine startbare Projektlaufzeit", mainPort: null,
        mainServiceId: null, profileSource: "detected", services: [],
        allowedPorts: [...this.options.allowedProjectPorts], warnings: [], publicUrl: null,
        pid: null, startedAt: null, updatedAt: new Date().toISOString(), exitCode: null,
        message: error.message,
      };
    }
    const profile = await this.profileForSession(userId, projectId, detectedProfile);
    const name = this.sessionName(userId, projectId);
    const panes = new Map((await this.supervisor.panes(name)).map((pane) => [pane.serviceId, pane]));
    const services = profile.services.map((service) => serviceState(service, panes.get(service.id)));
    const running = services.filter((service) => service.state === "running");
    const failed = services.filter((service) => service.state === "failed");
    const aggregate = failed.length > 0 ? "failed" : running.length > 0 ? "running" : "stopped";
    const mainPort = this.selectedMainPort(userId, projectId, profile);
    const mainServiceId = profile.services.find((service) => service.port === mainPort)?.id ?? profile.mainServiceId;
    const publication = this.publications.get(this.runtimeKey(userId, projectId));
    return {
      projectId, state: aggregate,
      command: services.length === 1 ? services[0]!.command : `${services.length} Dienste gemeinsam`,
      mainPort, mainServiceId, profileSource: profile.source, services,
      allowedPorts: [...this.options.allowedProjectPorts],
      warnings: profile.warnings.includes(PREVIEW_TRUST_HINT) ? profile.warnings : [...profile.warnings, PREVIEW_TRUST_HINT],
      publicUrl: publication?.url ?? null,
      pid: running[0]?.pid ?? null,
      startedAt: running.map((service) => service.startedAt).filter((value): value is string => value !== null).sort()[0] ?? null,
      updatedAt: new Date().toISOString(),
      exitCode: failed[0]?.exitCode ?? null,
      message: failed.length > 0 ? `${failed.length} ${failed.length === 1 ? "Dienst ist" : "Dienste sind"} fehlgeschlagen.` : null,
    };
  }

  async statuses(userId: string): Promise<PreviewDevServerStatus[]> {
    const projectIds = (await this.supervisor.snapshot()).filter((session) => session.userId === userId && session.projectId).map((session) => session.projectId);
    const statuses = await Promise.all([...new Set(projectIds)].map((projectId) => this.status(userId, projectId).catch(() => null)));
    return statuses.filter((status): status is PreviewDevServerStatus => status !== null);
  }

  async start(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    return this.withStartLock(() => this.startUnlocked(userId, projectId));
  }

  private async startUnlocked(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    const project = await this.resolveProject(projectId);
    const detectedProfile = await this.profile(projectId);
    // S-013: Unbestätigte Projekt-Befehle starten nicht — weder manuell noch
    // über den Watchdog (autoRestart nutzt denselben Pfad).
    assertDevServerCommandConfirmed(this.options.database, userId, devServerCommandPreview(projectId, project.path, detectedProfile));
    const name = this.sessionName(userId, projectId);
    const panes = await this.supervisor.panes(name);
    if (panes.length > 0 && !panes.some((pane) => pane.dead)) return this.status(userId, projectId);
    if (panes.length) await this.supervisor.execute(["kill-session", "-t", name]);
    const profile = await this.assignRuntimePorts(name, detectedProfile);
    if (profile.setupCommand) await this.supervisor.runSetup(project, name, profile.setupCommand);

    for (const [index, service] of profile.services.entries()) {
      const command = this.supervisor.serviceCommand(project, service);
      const args = index === 0
        ? ["new-session", "-d", "-s", name, "-n", service.id, "-c", service.workingDirectory, command]
        : ["new-window", "-d", "-t", name, "-n", service.id, "-c", service.workingDirectory, command];
      const created = index === 0
        ? await this.supervisor.createSessionOutsideWorkbench(args, this.options.startTimeoutMilliseconds)
        : await this.supervisor.run(args, this.options.startTimeoutMilliseconds);
      if (created.status !== 0) {
        if ((await this.supervisor.panes(name)).length > 0) await this.supervisor.run(["kill-session", "-t", name], 5_000);
        throw new AppError(500, "DEV_SERVER_START_FAILED", cleanOutput(created.stderr).trim() || `${service.name} konnte nicht gestartet werden.`);
      }
    }
    await this.supervisor.execute(["set-option", "-t", name, "remain-on-exit", "on"]);
    await this.supervisor.execute(["set-option", "-t", name, "history-limit", "100000"]);
    await this.supervisor.execute(["set-option", "-t", name, "@wrapt_kind", "preview-dev-server"]);
    await this.supervisor.execute(["set-option", "-t", name, "@wrapt_project_id", projectId]);
    await this.supervisor.execute(["set-option", "-t", name, "@wrapt_owner_hash", this.ownerHash(userId)]);
    await this.supervisor.execute(["set-option", "-t", name, "@wrapt_user_id", userId]);
    await this.supervisor.execute(["set-option", "-t", name, "@wrapt_preview_publication_requested", "0"]);
    await this.supervisor.execute(["set-option", "-t", name, RUNTIME_PORTS_OPTION, JSON.stringify(Object.fromEntries(profile.services.map((service) => [service.id, service.port])))]);
    return this.status(userId, projectId);
  }

  async launch(userId: string, projectId: string): Promise<{ status: PreviewDevServerStatus; publication: PreviewRuntimePublication }> {
    const key = this.runtimeKey(userId, projectId);
    const revision = this.publications.revision(key);
    await this.start(userId, projectId);
    if (this.publications.revision(key) !== revision) throw new AppError(409, "PREVIEW_PUBLICATION_CLOSED", "Die Preview wurde während des Starts geschlossen.");
    await this.supervisor.execute(["set-option", "-t", this.sessionName(userId, projectId), "@wrapt_preview_publication_requested", "1"]);
    const profile = await this.profileForSession(userId, projectId, await this.profile(projectId));
    const publication = await this.publish(userId, profile, true);
    if (!publication) throw new AppError(409, "PREVIEW_RUNTIME_NO_PUBLIC_URL", "Die Projektlaufzeit besitzt keinen veröffentlichbaren Hauptdienst.");
    return { status: await this.status(userId, projectId), publication };
  }

  async releasePublication(userId: string, projectId: string): Promise<void> {
    this.publications.revoke(this.runtimeKey(userId, projectId));
    const name = this.sessionName(userId, projectId);
    if ((await this.supervisor.panes(name)).length) await this.supervisor.execute(["set-option", "-t", name, "@wrapt_preview_publication_requested", "0"]);
    await this.publications.forget(this.runtimeKey(userId, projectId));
  }

  async stop(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    return this.withStartLock(() => this.stopUnlocked(userId, projectId));
  }

  private async stopUnlocked(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    await this.resolveProject(projectId);
    const name = this.sessionName(userId, projectId);
    if ((await this.supervisor.panes(name)).length > 0) await this.supervisor.execute(["kill-session", "-t", name]);
    await this.publications.forget(this.runtimeKey(userId, projectId));
    return this.status(userId, projectId);
  }

  async restart(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    return this.withStartLock(async () => {
      await this.stopUnlocked(userId, projectId);
      return this.startUnlocked(userId, projectId);
    });
  }

  async logs(userId: string, projectId: string): Promise<PreviewDevServerLogs> {
    return readRuntimeLogs(this.supervisor, await this.status(userId, projectId), this.sessionName(userId, projectId), this.options.logBytes);
  }

  async saveMainPort(userId: string, projectId: string, mainPort: number | null): Promise<PreviewDevServerStatus> {
    const profile = await this.profileForSession(userId, projectId, await this.profile(projectId));
    if (mainPort !== null && (!this.options.allowedProjectPorts.includes(mainPort) || !profile.services.some((service) => service.port === mainPort))) {
      throw new AppError(400, "DEV_SERVER_PORT_NOT_OWNED", "Der Hauptport muss zu einem erkannten Dienst gehören und aus der erlaubten Projektport-Palette stammen.");
    }
    const mainServiceId = profile.services.find((service) => service.port === mainPort)?.id ?? null;
    this.options.database.saveMainPort(userId, projectId, mainPort, mainServiceId);
    const name = this.sessionName(userId, projectId);
    if (mainPort !== null && (await this.supervisor.sessionOption(name, "@wrapt_preview_publication_requested")) === "1" && (await this.supervisor.panes(name)).some((pane) => !pane.dead)) {
      await this.publish(userId, { ...profile, mainServiceId: profile.services.find((service) => service.port === mainPort)?.id ?? profile.mainServiceId }, true);
    }
    return this.status(userId, projectId);
  }

  preference(userId: string): PreviewHubPreference {
    return this.options.database.hubPreference(userId) ?? { externalOpenMode: "tab", updatedAt: null };
  }

  savePreference(userId: string, externalOpenMode: PreviewExternalOpenMode): PreviewHubPreference {
    return this.options.database.saveHubPreference(userId, externalOpenMode);
  }

  startWatchdog() {
    if (this.watchdogTimer !== null) return;
    this.watchdogTimer = setInterval(() => { void this.tick(); }, this.watchdogIntervalMilliseconds);
  }

  stopWatchdog() {
    if (this.watchdogTimer === null) return;
    clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  async close(): Promise<void> {
    this.stopWatchdog();
    await this.supervisor.close();
    await this.tickPromise;
    await this.startQueue;
  }

  tick(): Promise<void> {
    if (this.tickPromise) return this.tickPromise;
    const loading = this.runTick().finally(() => { if (this.tickPromise === loading) this.tickPromise = null; });
    this.tickPromise = loading;
    return loading;
  }

  private async runTick() {
    try {
      for (const session of await this.supervisor.snapshot()) {
        const { projectId, userId } = session;
        if (!projectId || !userId) continue;
        try {
          await this.tickSession(session);
        } catch (error) {
          this.options.logger?.(`Watchdog-Tick für ${projectId} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      this.options.logger?.(`Watchdog-Tick fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async tickSession(session: RuntimeSessionSnapshot) {
    const { name, userId, projectId, panes } = session;
    if (panes.some((pane) => pane.dead && pane.exitCode !== 0)) {
      await this.autoRestart(name, userId, projectId);
      return;
    }
    if (panes.some((pane) => !pane.dead) && session.publicationRequested) {
      const key = this.runtimeKey(userId, projectId);
      if (this.publications.age(key) >= 10 * 60_000) {
        // `profile` darf nicht im Argument-Ausdruck liegen: Ein Fehler dort
        // läge vor dem `.catch` und würde den Tick als ungefangenes Promise
        // scheitern lassen.
        try {
          const profile = await this.profile(projectId);
          await this.publish(userId, await this.profileForSession(userId, projectId, profile, session.ports), true);
        } catch (error) {
          this.options.logger?.(`Die Preview-Veröffentlichung von ${projectId} konnte nicht erneuert werden: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  private selectedMainPort(userId: string, projectId: string, profile: RuntimeProfileResult): number | null {
    return selectedRuntimeMainPort(this.options.database, this.options.allowedProjectPorts, userId, projectId, profile);
  }

  private async publish(userId: string, profile: RuntimeProfileResult | PreviewRuntimeProfile, force = false): Promise<PreviewRuntimePublication | null> {
    const projectId = profile.projectId;
    const selectedPort = this.selectedMainPort(userId, projectId, profile as RuntimeProfileResult);
    const mainService = profile.services.find((service) => service.port === selectedPort);
    if (!mainService || !this.options.publishRuntime) return null;
    const key = this.runtimeKey(userId, projectId);
    if ((await this.supervisor.sessionOption(this.sessionName(userId, projectId), "@wrapt_preview_publication_requested")) !== "1") return null;
    return this.publications.publish(key, () => this.options.publishRuntime!(userId, { ...profile, mainServiceId: mainService.id }), force);
  }

  private async assignRuntimePorts(sessionName: string, profile: RuntimeProfileResult): Promise<RuntimeProfileResult> {
    const localPorts = await this.options.localPorts();
    const occupied = new Map<number, string>();
    localPorts.forEach((entry) => occupied.set(entry.port, entry.process ?? entry.projectName ?? "einem anderen Prozess"));
    for (const [port, owner] of await this.supervisor.assignedSessionPorts(sessionName)) occupied.set(port, owner);

    const automatic = new Set(profile.autoPortServiceIds);
    for (const service of profile.services) {
      if (service.port === null || automatic.has(service.id)) continue;
      const owner = occupied.get(service.port);
      if (owner) {
        throw new AppError(409, "PREVIEW_RUNTIME_PORT_BUSY", `Der feste Port ${service.port} für ${service.name} wird bereits von ${owner} verwendet. Verwende in preview.config.json bei Bedarf port: "auto".`);
      }
      occupied.set(service.port, service.name);
    }

    const services = profile.services.map((service) => {
      if (!automatic.has(service.id)) return service;
      const port = this.options.allowedProjectPorts.find((candidate) => !occupied.has(candidate));
      if (port === undefined) {
        const needed = profile.services.filter((candidate) => automatic.has(candidate.id)).length;
        const free = this.options.allowedProjectPorts.filter((candidate) => !occupied.has(candidate)).length;
        throw new AppError(409, "PREVIEW_RUNTIME_PORT_CAPACITY", `Das Projekt benötigt ${needed} freie Preview-Ports, verfügbar sind noch ${free} von ${this.options.allowedProjectPorts.length}. Stoppe eine andere Projektlaufzeit oder stelle einen konfigurierten Dienst auf port: null.`);
      }
      occupied.set(port, service.name);
      return { ...service, port };
    });
    return { ...profile, services };
  }

  private async profileForSession(userId: string, projectId: string, profile: RuntimeProfileResult, ports?: string | null): Promise<RuntimeProfileResult> {
    const raw = ports === undefined ? await this.supervisor.sessionOption(this.sessionName(userId, projectId), RUNTIME_PORTS_OPTION) : ports;
    return applyRuntimeSessionPorts(profile, raw, this.options.allowedProjectPorts);
  }

  private async withStartLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.startQueue;
    let release: () => void = () => {};
    this.startQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  private async resolveProject(projectId: string): Promise<Project> {
    let project: Project;
    try { project = await this.options.project(projectId); }
    catch { throw new AppError(404, "PROJECT_NOT_FOUND", "Das ausgewählte Projekt wurde nicht gefunden."); }
    if (project.availability !== "available") throw new AppError(409, "PROJECT_UNAVAILABLE", "Das ausgewählte Projekt ist momentan nicht verfügbar.");
    return project;
  }

  private ownerHash(userId: string): string { return createHash("sha256").update(userId).digest("hex").slice(0, 20); }
  private runtimeKey(userId: string, projectId: string): string { return `${userId}\u0000${projectId}`; }
  private sessionName(userId: string, projectId: string): string {
    const key = createHash("sha256").update(this.runtimeKey(userId, projectId)).digest("hex").slice(0, 24);
    return `wrapt-preview-${key}`;
  }

  private async autoRestart(sessionName: string, userId: string, projectId: string): Promise<void> {
    return this.withStartLock(() => this.autoRestartUnlocked(sessionName, userId, projectId));
  }

  private async autoRestartUnlocked(sessionName: string, userId: string, projectId: string) {
    // Ein Stop während der asynchronen Sammelabfrage darf keinen Neustart auslösen.
    if (!(await this.supervisor.panes(sessionName)).some((pane) => pane.dead && pane.exitCode !== 0)) return;
    const now = Date.now();
    const attempts = (this.restartHistory.get(sessionName) ?? []).filter((at) => at >= now - this.watchdogWindowMilliseconds);
    if (attempts.length >= this.watchdogMaxAttemptsPerWindow) {
      this.options.logger?.(`Projektlaufzeit ${projectId} läuft nach ${attempts.length} automatischen Neustarts weiterhin nicht; nächster Versuch nach dem Backoff-Zeitfenster.`);
      this.restartHistory.set(sessionName, attempts);
      return;
    }
    attempts.push(now);
    this.restartHistory.set(sessionName, attempts);
    this.options.logger?.(`Projektlaufzeit ${projectId} ist fehlgeschlagen und wird automatisch vollständig neu gestartet.`);
    const publicationRequested = (await this.supervisor.sessionOption(sessionName, "@wrapt_preview_publication_requested")) === "1";
    const revision = this.publications.revision(this.runtimeKey(userId, projectId));
    try {
      await this.supervisor.execute(["kill-session", "-t", sessionName]);
      await this.startUnlocked(userId, projectId);
    } catch (error) {
      this.options.logger?.(`Der automatische Neustart von ${projectId} ist fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (publicationRequested && this.publications.revision(this.runtimeKey(userId, projectId)) === revision) {
      await this.supervisor.execute(["set-option", "-t", sessionName, "@wrapt_preview_publication_requested", "1"]);
      try {
        const profile = await this.profile(projectId);
        await this.publish(userId, await this.profileForSession(userId, projectId, profile), true);
      } catch (error) {
        this.options.logger?.(`Die Preview-Veröffentlichung von ${projectId} konnte nach dem Neustart nicht wiederhergestellt werden: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }


}
