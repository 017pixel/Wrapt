import type { LocalPort, Project, PreviewRuntimeProfile } from "@wrapt/contracts";
import type { PreviewDevServerDatabase } from "./devServerDatabase.js";
import type { PreviewRuntimePublication } from "./runtimePublications.js";
import type { CommandRunner } from "./runtimeSupervisor.js";

export interface PreviewDevServerManagerOptions {
  database: PreviewDevServerDatabase;
  tmuxExecutable: string;
  allowedProjectPorts: readonly number[];
  logBytes: number;
  startTimeoutMilliseconds: number;
  project: (projectId: string) => Promise<Project>;
  localPorts: () => Promise<LocalPort[]>;
  publishRuntime?: (userId: string, profile: PreviewRuntimeProfile) => Promise<PreviewRuntimePublication>;
  runner?: CommandRunner;
  watchdogIntervalMilliseconds?: number;
  watchdogMaxAttemptsPerWindow?: number;
  watchdogWindowMilliseconds?: number;
  tmuxSocket?: string;
  useSystemdSupervisor?: boolean;
  logger?: (message: string) => void;
}
