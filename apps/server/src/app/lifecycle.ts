import type { FastifyInstance } from "fastify";
import { settings } from "../config/settings.js";
import { systemService } from "../services/systemService.js";
import type { AppDependencies } from "./dependencies.js";

export interface LifecycleState {
  previewLogRotation: NodeJS.Timeout | null;
}

export async function startBackgroundServices(app: FastifyInstance, deps: AppDependencies, state: LifecycleState) {
  const isolatedTest = settings.runtimeMode === "test";
  if (isolatedTest && !settings.testIsolation) {
    throw new Error("NODE_ENV=test benötigt WRAPT_E2E=true für einen isolierten Serverstart.");
  }
  await deps.pluginCode.authoring.start();
  if (!isolatedTest) {
    systemService.startMetricsHistory();
    // Boot-Hook der Account-Recovery (D-009): offene Aktivierungs-Journale
    // deterministisch abschließen, statt sie beim nächsten Lesen nachzuholen.
    // Best-Effort im Hintergrund; Fehler landen im Log, nicht im Boot.
    void deps.accounts.reconcile().catch((error) => app.log.warn({ err: error }, "Account-Reconcile beim Start fehlgeschlagen"));
    deps.liveUsage.start();
    deps.analytics.start();
    deps.usageTimeline.start();
    deps.hermesResultSync.start();
    deps.t3StatusSync.start();
    deps.terminalStatusSync.start();
    await deps.agentSessionSync.start();
  }
  await deps.previewSlots.startListeners();
  if (!isolatedTest) deps.previewDevServers.startWatchdog();
  if (settings.previews.diagnosticsEnabled) {
    // Tageswechsel: abgeschlossene Tage komprimieren, alte Tage entfernen.
    state.previewLogRotation = setInterval(() => {
      void deps.previewDiagnostics.rotate().catch((error) => app.log.error({ err: error }, "Preview-Logrotation fehlgeschlagen"));
    }, 3_600_000);
    state.previewLogRotation.unref();
    void deps.previewDiagnostics.rotate().catch((error) => app.log.error({ err: error }, "Initiale Preview-Logrotation fehlgeschlagen"));
  }
}

export function registerShutdown(app: FastifyInstance, deps: AppDependencies, state: LifecycleState) {
  app.addHook("onClose", async () => {
    await deps.pluginCode.close();
    systemService.stopMetricsHistory();
    await deps.previewDevServers.close();
    deps.liveUsage.stop();
    await deps.analytics.stop();
    await deps.usageTimeline.stop();
    await deps.hermesResultSync.stop();
    await deps.t3StatusSync.stop();
    deps.terminalStatusSync.stop();
    await deps.agentSessionSync.stop();
    await deps.previewSlots.stopListeners();
    if (state.previewLogRotation) clearInterval(state.previewLogRotation);
    await deps.previewDiagnostics.close();
    await deps.hermesManager.close();
    await deps.terminals.shutdown();
    await deps.terminalSupervisor?.close();
    deps.operationalMetrics.close();
    deps.previewDevServerDatabase.close();
    deps.previewSlotDatabase.close();
    deps.terminalDatabase.close();
    await deps.notificationPush.close();
    deps.notificationDatabase.close();
    await deps.orbitDatabase.close();
    deps.notesDatabase.close();
    deps.orbitAssets.close();
    deps.fileGallery.close();
    deps.fileManager.close();
    deps.skillEditor.close();
    deps.projectRegistryDatabase.close();
    deps.uiSettingsDatabase.close();
    deps.projectActivityDatabase.close();
    await deps.operationalAudit.close();
    deps.usageDatabase.close();
    deps.extensionDatabase.close();
  });
}
