import type {
  HermesV2CronDetail, HermesV2CronFields, HermesV2CronList, HermesV2CronMutation,
  HermesV2CronRuns, HermesV2Diagnostics, HermesV2Memory, HermesV2Pending,
  HermesV2ResourceSkillDetail, HermesV2ResourceSkills, HermesV2SessionDeleted,
  HermesV2SessionDeletionPreview,
} from "@wrapt/contracts/hermes-v2";
import type { ChatConnectionView } from "./chat-types";

export type ResourceArea = "cron" | "skills" | "memory" | "diagnostics" | "session-delete";
export interface HermesV2ResourcesOptions {
  ownerId: string;
  enabled: boolean;
  active: boolean;
  visible: boolean;
  area: ResourceArea | null;
  signal: AbortSignal;
  deleteSessionId?: string | null;
}
export interface ResourceError {
  code: string;
  message: string;
  outcome: "not_sent" | "rejected" | "unknown";
  status: number | null;
  retryable: false;
}
export interface ResourceRead<T> {
  status: "idle" | "loading" | "ready" | "missing" | "error";
  data: T | null;
  error: ResourceError | null;
  stale: boolean;
}
export interface ResourceConfirmation {
  key: string;
  generation: number;
  targetId: string;
  operation: "cron.run" | "cron.delete" | "session.delete";
  paused: boolean | null;
}
export type ResourceOperation = "cron.create" | "cron.update" | "cron.pause" | "cron.resume"
  | "cron.run" | "cron.delete" | "session.delete";
export interface ResourceActionView {
  key: string;
  operation: ResourceOperation;
  targetId: string | null;
  status: "pending" | "confirmed" | "not_sent" | "rejected" | "unknown";
  result: HermesV2CronMutation | HermesV2SessionDeleted | null;
  error: ResourceError | null;
  reconciled: boolean;
}
export interface ResourceView {
  generation: number;
  available: boolean;
  area: ResourceArea | null;
  connection: ChatConnectionView;
  cron: { list: ResourceRead<HermesV2CronList>; selectedId: string | null;
    detail: ResourceRead<HermesV2CronDetail>; runs: ResourceRead<HermesV2CronRuns> };
  skills: { list: ResourceRead<HermesV2ResourceSkills>; selectedName: string | null;
    detail: ResourceRead<HermesV2ResourceSkillDetail> };
  memory: ResourceRead<HermesV2Memory>;
  pending: ResourceRead<HermesV2Pending>;
  diagnostics: ResourceRead<HermesV2Diagnostics>;
  sessionDeletion: ResourceRead<HermesV2SessionDeletionPreview>;
  actions: readonly ResourceActionView[];
  actionError: ResourceError | null;
  copy: { status: "idle" | "pending" | "copied" | "error"; error: ResourceError | null };
}
export interface ResourceActions {
  refresh(): Promise<void>;
  selectCron(jobId: string | null): void;
  refreshCronDetail(): Promise<void>;
  refreshCronRuns(): Promise<void>;
  selectSkill(name: string | null): void;
  prepareCronConfirmation(operation: "run" | "delete"): ResourceConfirmation | null;
  prepareSessionDeletion(): ResourceConfirmation | null;
  createCron(fields: HermesV2CronFields): Promise<void>;
  updateCron(jobId: string, updates: Partial<HermesV2CronFields>): Promise<void>;
  pauseCron(jobId: string): Promise<void>;
  resumeCron(jobId: string): Promise<void>;
  runCron(confirmation: ResourceConfirmation): Promise<void>;
  deleteCron(confirmation: ResourceConfirmation): Promise<void>;
  deleteSession(confirmation: ResourceConfirmation): Promise<void>;
  reconcileAction(key: string): Promise<void>;
  copyDiagnostics(): Promise<void>;
  clearActionError(): void;
}
export interface HermesV2Resources extends ResourceView, ResourceActions {}
export type { HermesV2CronFields } from "@wrapt/contracts/hermes-v2";
