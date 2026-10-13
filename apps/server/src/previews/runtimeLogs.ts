import type { PreviewDevServerLogs, PreviewDevServerStatus, PreviewRuntimeServiceLogs } from "@wrapt/contracts";
import { logLevel, serviceState } from "./runtimeStatus.js";
import { cleanOutput, type PreviewRuntimeSupervisor } from "./runtimeSupervisor.js";

export async function readRuntimeLogs(supervisor: PreviewRuntimeSupervisor, status: PreviewDevServerStatus,
  sessionName: string, logBytes: number): Promise<PreviewDevServerLogs> {
  const projectId = status.projectId;
    const panes = new Map((await supervisor.panes(sessionName)).map((pane) => [pane.serviceId, pane]));
    const serviceLogs: PreviewRuntimeServiceLogs[] = await Promise.all(status.services.map(async (service) => {
      const pane = panes.get(service.id);
      const captured = pane ? await supervisor.run(["capture-pane", "-p", "-J", "-S", "-10000", "-t", `${sessionName}:${service.id}.0`], 4_000) : null;
      const cleaned = captured?.status === 0 ? cleanOutput(captured.stdout) : "";
      const output = cleaned.length > logBytes ? cleaned.slice(-logBytes).replace(/^[^\n]*\n/, "") : cleaned;
      const lines = output.split("\n").map((text) => text.trimEnd()).filter(Boolean).map((text) => ({ serviceId: service.id, level: logLevel(text), text }));
      return {
        serviceId: service.id, name: service.name, role: service.role, port: service.port,
        state: serviceState(service, pane).state, output, lines,
        errorCount: lines.filter((line) => line.level === "error").length,
        warningCount: lines.filter((line) => line.level === "warning").length,
        truncated: output.length < cleaned.length,
      };
    }));
    const output = serviceLogs.filter((service) => service.output).map((service) => `# ${service.name}\n${service.output.trimEnd()}`).join("\n\n");
    return {
      projectId, output: output.slice(-262_144), truncated: serviceLogs.some((service) => service.truncated) || output.length > 262_144,
      services: serviceLogs,
      errorCount: serviceLogs.reduce((sum, service) => sum + service.errorCount, 0),
      warningCount: serviceLogs.reduce((sum, service) => sum + service.warningCount, 0),
      capturedAt: new Date().toISOString(),
    };
}
