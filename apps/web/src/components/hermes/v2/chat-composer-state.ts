import type { ChatComposerView, ChatAttachmentView } from "./chat-composer-types";
import type { HermesV2Selection } from "./chat-types";

export interface AttachmentBinding {
  ownerGeneration: number; sessionId: string; epoch: string; cwd: string | null;
  connectionId: string; connectionEpoch: string; socket: number; subscription: number;
}
export interface AttachmentEntry extends ChatAttachmentView { binding: AttachmentBinding }
export interface ComposerDraft {
  model: ChatComposerView["model"];
  reasoning: ChatComposerView["reasoning"];
  title: ChatComposerView["title"];
  attachments: AttachmentEntry[];
  confirmation: { ownerGeneration: number; sessionId: string; epoch: string | null; revision: number; socket: number; selection: HermesV2Selection | null } | null;
}
export const newComposerDraft = (): ComposerDraft => ({ model: { requested: null, status: "idle", confirmation: null },
  reasoning: { requested: null, status: "idle", observed: null }, title: { requested: null, status: "idle", title: null }, attachments: [], confirmation: null });
export const sameSelection = (left: HermesV2Selection | null, right: HermesV2Selection | null) => left?.provider === right?.provider && left?.model === right?.model;
