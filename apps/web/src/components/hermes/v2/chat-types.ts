import type { z } from "zod";
import type {
  hermesV2BackgroundSchema, HermesV2Command, HermesV2ModelCatalog, HermesV2Request,
  HermesV2Response, HermesV2Selection, HermesV2Session, HermesV2Subagent, HermesV2Usage,
  HermesV2Attachment, HermesV2ComposerSettings, HermesV2Effort,
} from "@wrapt/contracts/hermes-v2";
import type { ChatApprovalMode, ChatComposerView } from "./chat-composer-types";
import type { ChatWorkView } from "./chat-work-types";

export type { HermesV2Request, HermesV2Response, HermesV2Selection, HermesV2Session };
type HermesV2Background = z.infer<typeof hermesV2BackgroundSchema>;
export type SendOutcome = "not_sent" | "unknown";
export interface ChatErrorInfo {
  code: string;
  message: string;
  outcome: SendOutcome;
  readEvidence?: string | null;
}
export interface ChatConnectionView {
  state: "idle" | "connecting" | "online" | "reconnecting" | "offline" | "incompatible";
  attempt: number;
  error: ChatErrorInfo | null;
}
export interface ChatToolView {
  id: string;
  toolId: string;
  turnId: string;
  name: string;
  status: "running" | "complete" | "unknown";
  outcome: "success" | "error" | "unknown";
  input: string | null;
  output: string | null;
  durationMs: number | null;
}
export interface ChatMessageView {
  id: string;
  rowId: number | null;
  logicalId: string | null;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  reasoning: string | null;
  timestamp: number | null;
  status: "streaming" | "complete" | "interim" | "unknown";
  error: string | null;
  tools: readonly ChatToolView[];
  readEvidence?: string | null;
  /** Raw-Historyseite für gezieltes Erneuern abgelaufener sichtbarer Projektionen. */
  readOffset?: number;
  attachments?: readonly HermesV2Attachment[];
}
export interface ChatCatalogView {
  commands: readonly HermesV2Command[];
  models: HermesV2ModelCatalog | null;
  loading: boolean;
  error: ChatErrorInfo | null;
  hermesEfforts?: readonly HermesV2Effort[];
}
export interface ChatSessionView {
  sessionId: string;
  session: HermesV2Session | null;
  epoch: string | null;
  cursor: number;
  generation: number;
  loading: boolean;
  error: ChatErrorInfo | null;
  messages: readonly ChatMessageView[];
  tools: readonly ChatToolView[];
  requests: readonly HermesV2Request[];
  generatingTool: string | null;
  running: boolean | null;
  turnStartedAt: number | null;
  writable: boolean;
  blockedReason: string | null;
  queuedText: string | null;
  selection: HermesV2Selection | null;
  reasoningEffort: string | null;
  usage: HermesV2Usage | null;
  subagents: readonly HermesV2Subagent[];
  background: readonly HermesV2Background[];
  hasOlder: boolean;
  loadingOlder: boolean;
  catalog: ChatCatalogView;
  composer?: HermesV2ComposerSettings | null;
}
export interface ChatSessionsView {
  items: readonly HermesV2Session[];
  loading: boolean;
  hasMore: boolean;
  error: ChatErrorInfo | null;
}
export interface UnknownSendView {
  operation: string;
  warning: string;
  resynced: boolean;
  canResend: boolean;
}
/** Gemeinsamer lokaler Status. Antwortwerte werden niemals gespeichert. */
export interface ChatRequestState {
  key: string;
  epoch: string;
  status: "pending" | "unknown";
}
export interface HermesV2ChatOptions {
  ownerId: string;
  sessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
  /** Geparkte Routen behalten ihre Auswahl; false beendet keinen Hermes-Turn. */
  active?: boolean;
  /** Sichtbarkeit ist von Route-Aktivität unabhängig. */
  visible?: boolean;
}
export interface CreateChatSession {
  projectId: string | null;
  title?: string;
  selection?: HermesV2Selection;
}
export interface HermesV2ChatActions {
  /** Promise<void>-Aktionen zeigen Fehler im Viewmodel und resolven; createSession rejectet. */
  /** Der Runtime hält den flüchtigen Draft pro Owner und Session. UI nutzt diesen Setter. */
  setDraft(text: string): void;
  selectSession(sessionId: string | null): void;
  refreshSessions(query?: string): Promise<void>;
  createSession(options: CreateChatSession): Promise<string>;
  /** Ohne text wird der Draft gesendet. Nur ein unverändert gebliebener Draft wird geleert. */
  submit(text?: string, mode?: "normal" | "queue"): Promise<void>;
  stop(): Promise<void>;
  steer(text: string): Promise<void>;
  refreshWork(): Promise<void>;
  interruptSubagent(subagentId: string): Promise<void>;
  readSubagentTail(subagentId: string): Promise<void>;
  killProcess(processId: string): Promise<void>;
  startBackground(text: string): Promise<void>;
  startBtw(text: string): Promise<void>;
  loadOlder(): Promise<void>;
  readCatalog(): Promise<void>;
  selectModel(selection: HermesV2Selection, confirmed?: boolean): Promise<void>;
  cancelModelSelection(): void;
  setTitle(title: string): Promise<void>;
  selectReasoning(effort: HermesV2Effort): Promise<void>;
  setApprovalMode(mode: ChatApprovalMode): Promise<void>;
  uploadAttachment(file: File): Promise<void>;
  removeAttachment(uploadId: string): void;
  checkUpload(uploadId: string): Promise<void>;
  respond(request: HermesV2Request, response: HermesV2Response): Promise<void>;
  lockRequest(request: HermesV2Request, questionId: string, answer: string | null): Promise<void>;
  resync(): Promise<void>;
  /** UI zeigt vorher unknownSend.warning; nur nach erfolgreichem Resync zulässig. */
  resendUnknown(options: { acknowledgeDuplicateRisk: true }): Promise<void>;
  /** Ausdrückliche lokale Entscheidung, ohne Annahmebehauptung oder Coremutation. */
  continueWithoutResend(): Promise<void>;
  reconnect(): void;
  clearError(): void;
}
export interface HermesV2Chat extends HermesV2ChatActions {
  connection: ChatConnectionView;
  sessions: ChatSessionsView;
  activeSnapshot: ChatSessionView | null;
  draft: string;
  submitting: boolean;
  actionError: ChatErrorInfo | null;
  unknownSend: UnknownSendView | null;
  requestStates: readonly ChatRequestState[];
  composer: ChatComposerView;
  work: ChatWorkView;
}
/** Export der Implementierung: useHermesV2Chat(options): HermesV2Chat. */
export type UseHermesV2Chat = (options: HermesV2ChatOptions) => HermesV2Chat;
