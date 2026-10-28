import type { HermesV2CronFields, HermesV2CronJob } from "@wrapt/contracts/hermes-v2";

export type CronFieldKey = "name" | "prompt" | "schedule" | "repeat" | "paused" | "projectId";

export const NO_PROJECT = "";

export interface FormDraft {
  name: string;
  prompt: string;
  schedule: string;
  repeat: string;
  paused: boolean;
  /** null = in Bearbeiten noch nicht berührt; "" = ohne Projekt; sonst Projekt-ID. */
  projectId: string | null;
}

export function draftFromJob(job: HermesV2CronJob | null): FormDraft {
  return {
    name: job?.name ?? "",
    prompt: job?.prompt ?? "",
    schedule: job?.schedule ?? "",
    repeat: job === null || job?.repeat === null ? "" : String(job.repeat),
    paused: job?.paused ?? false,
    projectId: job ? null : "",
  };
}

export function cronUpdates(initial: HermesV2CronJob, draft: FormDraft, touched: ReadonlySet<CronFieldKey>): Partial<HermesV2CronFields> {
  const changes: Partial<HermesV2CronFields> = {};
  if (touched.has("name") && draft.name !== initial.name) changes.name = draft.name;
  if (touched.has("prompt") && draft.prompt !== initial.prompt)
    changes.prompt = draft.prompt;
  if (touched.has("schedule") && draft.schedule !== (initial.schedule ?? ""))
    changes.schedule = draft.schedule;
  if (touched.has("repeat")) {
    const next = draft.repeat.trim() === "" ? null : draft.repeat.trim();
    const normalized =
      typeof initial.repeat === "number" &&
      Number.isInteger(Number(next)) &&
      String(initial.repeat) === next
        ? initial.repeat
        : next;
    if (normalized !== initial.repeat) changes.repeat = normalized;
  }
  if (touched.has("paused") && draft.paused !== initial.paused)
    changes.paused = draft.paused;
  if (touched.has("projectId")) {
    changes.projectId = draft.projectId === NO_PROJECT ? null : draft.projectId ?? null;
  }
  return changes;
}
