import type { HermesV2Attachment, HermesV2ComposerSettings, HermesV2Effort, HermesV2Selection } from "@wrapt/contracts/hermes-v2";
import type { ChatErrorInfo } from "./chat-types";

export type ChatApprovalMode = NonNullable<HermesV2ComposerSettings["approvals"]["mode"]>;

export interface ChatAttachmentView {
  uploadId: string;
  name: string;
  bytes: number;
  mime: string;
  status: "uploading" | "receiving" | "ready" | "unknown" | "not_sent" | "expired";
  attachment: HermesV2Attachment | null;
  error: ChatErrorInfo | null;
}
export interface ChatComposerView {
  available: boolean;
  settings: HermesV2ComposerSettings | null;
  model: {
    requested: HermesV2Selection | null;
    status: "idle" | "pending" | "confirmation" | "deferred" | "unknown";
    confirmation: { selection: HermesV2Selection; message: string } | null;
  };
  reasoning: {
    requested: HermesV2Effort | null;
    status: "idle" | "pending" | "observed" | "unconfirmed" | "unknown";
    observed: HermesV2ComposerSettings["reasoning"] | null;
  };
  title: { requested: string | null; status: "idle" | "pending" | "applied" | "unconfirmed" | "unknown"; title: string | null };
  attachments: readonly ChatAttachmentView[];
}
export const emptyChatComposer: ChatComposerView = {
  available: false, settings: null,
  model: { requested: null, status: "idle", confirmation: null },
  reasoning: { requested: null, status: "idle", observed: null },
  title: { requested: null, status: "idle", title: null }, attachments: [],
};
