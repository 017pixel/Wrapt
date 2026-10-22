// Testfixture: schema-konforme Requests und ein vollständiger Chat-Stub für Karten-UItests.
import type {
  ChatRequestState,
  HermesV2Chat,
  HermesV2Request,
  HermesV2Response,
} from "./chat-types";
import {
  emptyChatComposer,
  type ChatComposerView,
} from "./chat-composer-types";
import { emptyChatWork } from "./chat-work-types";

export const KEY_A = "11111111-1111-4111-8111-111111111111";
export const KEY_B = "22222222-2222-4222-8222-222222222222";

export function requestChatFixture(
  overrides: Partial<HermesV2Chat> & {
    requestStates?: ChatRequestState[];
  } = {},
): HermesV2Chat {
  const noAction = () => undefined;
  return {
    connection: { state: "online", attempt: 0, error: null },
    sessions: { items: [], loading: false, hasMore: false, error: null },
    activeSnapshot: null,
    draft: "",
    submitting: false,
    actionError: null,
    unknownSend: null,
    requestStates: [],
    setDraft: noAction,
    selectSession: noAction,
    refreshSessions: () => Promise.resolve(),
    createSession: () => Promise.reject(new Error("n/a")),
    submit: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    steer: () => Promise.resolve(),
    loadOlder: () => Promise.resolve(),
    readCatalog: () => Promise.resolve(),
    selectModel: () => Promise.resolve(),
    respond: () => Promise.resolve(),
    lockRequest: () => Promise.resolve(),
    resync: () => Promise.resolve(),
    resendUnknown: () => Promise.resolve(),
    continueWithoutResend: () => Promise.resolve(),
    reconnect: noAction,
    clearError: noAction,
    cancelModelSelection: noAction,
    setTitle: () => Promise.resolve(),
    selectReasoning: () => Promise.resolve(),
    uploadAttachment: () => Promise.resolve(),
    removeAttachment: noAction,
    checkUpload: () => Promise.resolve(),
    composer: emptyChatComposer,
    work: emptyChatWork,
    refreshWork: () => Promise.resolve(),
    interruptSubagent: () => Promise.resolve(),
    readSubagentTail: () => Promise.resolve(),
    killProcess: () => Promise.resolve(),
    startBackground: () => Promise.resolve(),
    startBtw: () => Promise.resolve(),
    ...overrides,
  } as HermesV2Chat;
}

/**
 * Viewmodel-Stub aus dem veröffentlichten emptyChatComposer plus gezielte Patches.
 * Args werden ausdrücklich vollständig geliefert; UItests nutzen composerPatch пер Helper.
 */
export function composerFixture(
  overrides: Partial<ChatComposerView> = {},
): ChatComposerView {
  const base = { ...emptyChatComposer, available: true };
  return { ...base, ...overrides };
}

/** Partieller Composerpatch mit garantierten Settings-Restwerten für UItests. */
export function composerPatch(
  patch: Partial<ChatComposerView>,
): ChatComposerView {
  return composerFixture(patch);
}

export function approvalRequest(
  patch: Partial<Extract<HermesV2Request, { kind: "approval" }>> = {},
): Extract<HermesV2Request, { kind: "approval" }> {
  return {
    kind: "approval",
    method: "approval",
    epoch: "e1",
    sessionId: "s1",
    createdAt: 100,
    key: KEY_A,
    command: "sudo rm -rf /tmp/x",
    description: "Dateilöschung im Projekt",
    choices: ["once", "session", "always", "deny"],
    ...patch,
  };
}

export function clarifyRequest(
  patch: Partial<Extract<HermesV2Request, { kind: "clarify" }>> = {},
): Extract<HermesV2Request, { kind: "clarify" }> {
  return {
    kind: "clarify",
    method: "clarify",
    epoch: "e1",
    sessionId: "s1",
    createdAt: 200,
    key: KEY_A,
    questions: [
      {
        id: "q1",
        text: "Welches Ziel?",
        choices: ["Schnell", "Sauber"],
        multiple: false,
      },
    ],
    lockedAnswers: {},
    ...patch,
  };
}

export function secretRequest(
  patch: Partial<Extract<HermesV2Request, { kind: "secret" }>> = {},
): Extract<HermesV2Request, { kind: "secret" }> {
  return {
    kind: "secret",
    method: "secret",
    epoch: "e1",
    sessionId: "s1",
    createdAt: 300,
    key: KEY_A,
    label: "API-Schlüssel",
    hint: "Wird nur an Hermes übermittelt.",
    ...patch,
  };
}

export function setupRequest(
  patch: Partial<Extract<HermesV2Request, { kind: "setup" }>> = {},
): Extract<HermesV2Request, { kind: "setup" }> {
  return {
    kind: "setup",
    method: "setup_choose",
    epoch: "e1",
    sessionId: "s1",
    createdAt: 400,
    key: KEY_A,
    question: "Welches Profil starten?",
    multiple: false,
    options: [
      { id: "opt.home", label: "Zuhause" },
      { id: "opt.work", label: "Arbeit" },
    ],
    ...patch,
  };
}

export function respondCapture(): {
  values: HermesV2Response[];
  onRespond: (response: HermesV2Response) => void;
} {
  const values: HermesV2Response[] = [];
  return {
    values,
    onRespond: (response) => {
      values.push(response);
    },
  };
}
