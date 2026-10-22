import type {
  HermesV2CronDetail, HermesV2CronList, HermesV2CronRuns, HermesV2Diagnostics,
  HermesV2Memory, HermesV2Pending, HermesV2ResourceSkillDetail, HermesV2ResourceSkills,
  HermesV2SessionDeletionPreview,
} from "@wrapt/contracts/hermes-v2";
import type { ChatConnectionView } from "./chat-types";
import type { ResourceActionView, ResourceArea, ResourceError, ResourceRead, ResourceView } from "./resource-types";

export interface ResourceData {
  cronList: HermesV2CronList;
  cronDetail: HermesV2CronDetail;
  cronRuns: HermesV2CronRuns;
  skills: HermesV2ResourceSkills;
  skillDetail: HermesV2ResourceSkillDetail;
  memory: HermesV2Memory;
  pending: HermesV2Pending;
  diagnostics: HermesV2Diagnostics;
  sessionDeletion: HermesV2SessionDeletionPreview;
}
export type ResourceSlot = keyof ResourceData;
export const idleResourceRead = <T>(): ResourceRead<T> => ({ status: "idle", data: null, error: null, stale: false });
export class ResourceState {
  reads: { [K in ResourceSlot]: ResourceRead<ResourceData[K]> } = this.emptyReads();
  selectedCron: string | null = null;
  selectedSkill: string | null = null;
  actions: ResourceActionView[] = [];
  error: ResourceError | null = null;
  copy: ResourceView["copy"] = { status: "idle", error: null };
  private emptyReads() {
    return { cronList: idleResourceRead<HermesV2CronList>(), cronDetail: idleResourceRead<HermesV2CronDetail>(),
      cronRuns: idleResourceRead<HermesV2CronRuns>(), skills: idleResourceRead<HermesV2ResourceSkills>(),
      skillDetail: idleResourceRead<HermesV2ResourceSkillDetail>(), memory: idleResourceRead<HermesV2Memory>(),
      pending: idleResourceRead<HermesV2Pending>(), diagnostics: idleResourceRead<HermesV2Diagnostics>(),
      sessionDeletion: idleResourceRead<HermesV2SessionDeletionPreview>() };
  }
  set<K extends ResourceSlot>(slot: K, read: ResourceRead<ResourceData[K]>): void { this.reads = { ...this.reads, [slot]: read }; }
  clearContents(): void {
    this.reads = this.emptyReads();
    this.copy = { status: "idle", error: null };
    // Nur Ziel/Unsicherheit bleibt flüchtig als Wiederholungssperre erhalten.
    this.actions = this.actions.filter((action) => action.status === "unknown").map((action) => ({ ...action, result: null, reconciled: false }));
    this.error = null;
  }
  view(generation: number, available: boolean, area: ResourceArea | null, connection: ChatConnectionView): ResourceView {
    return { generation, available, area, connection,
      cron: { list: this.reads.cronList, selectedId: this.selectedCron, detail: this.reads.cronDetail, runs: this.reads.cronRuns },
      skills: { list: this.reads.skills, selectedName: this.selectedSkill, detail: this.reads.skillDetail },
      memory: this.reads.memory, pending: this.reads.pending, diagnostics: this.reads.diagnostics,
      sessionDeletion: this.reads.sessionDeletion, actions: this.actions, actionError: this.error, copy: this.copy };
  }
}
