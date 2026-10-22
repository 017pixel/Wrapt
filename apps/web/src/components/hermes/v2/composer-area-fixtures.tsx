// Geteilte Fixture-Teile für die ComposerArea-UItests: Snapshot, Chatstub, Helfer.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import type {
  ChatRequestState,
  ChatSessionView,
  HermesV2Chat,
} from "./chat-types";
import { HermesV2ComposerArea } from "./HermesV2ComposerArea";
import { composerFixture, requestChatFixture } from "./request-card-fixtures";

export function command(partial: {
  key: string;
  action?:
    | "new"
    | "resume"
    | "stop"
    | "model"
    | "help"
    | "title"
    | "queue"
    | "steer"
    | "skill"
    | null;
  kind?: "builtin" | "skill" | "unsupported";
  argumentHint?: string | null;
  aliases?: string[];
  disabledReason?: string | null;
}) {
  return {
    key: partial.key,
    label: partial.key.replace(/^\//, "").toUpperCase(),
    description: "Beschreibung",
    kind: partial.kind ?? "builtin",
    action: partial.action ?? null,
    argumentHint: partial.argumentHint ?? null,
    disabledReason: partial.disabledReason ?? null,
    aliases: partial.aliases,
    argumentMode: null,
    subcommands: undefined,
    desktopSubcommands: undefined,
  };
}

export function snapshot(
  overrides: Partial<ChatSessionView> = {},
): ChatSessionView {
  return {
    sessionId: "s1",
    session: {
      id: "s1",
      title: "Alte Sitzung",
      preview: "",
      source: "",
      model: "m1",
      provider: "p1",
      cwd: null,
      projectId: null,
      messageCount: 0,
      updatedAt: null,
      running: false,
      startedAt: null,
      draft: false,
    },
    epoch: "e1",
    cursor: 0,
    generation: 1,
    loading: false,
    error: null,
    messages: [],
    tools: [],
    requests: [],
    running: false,
    turnStartedAt: null,
    writable: true,
    blockedReason: null,
    queuedText: null,
    selection: { provider: "p1", model: "m1" },
    reasoningEffort: null,
    usage: null,
    subagents: [],
    background: [],
    hasOlder: false,
    loadingOlder: false,
    generatingTool: null,
    catalog: {
      commands: [
        command({ key: "/model", action: "model" }),
        command({ key: "/stop", action: "stop" }),
        command({
          key: "/research-test",
          kind: "skill",
          action: "skill",
          argumentHint: "Aufgabe",
        }),
        command({
          key: "/foreign",
          kind: "unsupported",
          disabledReason: "Nur in der klassischen Oberfläche",
        }),
      ],
      models: null,
      loading: false,
      error: null,
      hermesEfforts: ["low", "high"],
    },
    ...overrides,
  };
}

export const composerSettings = () => ({
  reasoning: { effort: "high", wire: null },
  approvals: {
    mode: "manual" as const,
    effectiveBypass: false,
    scope: "global" as const,
    editable: true as const,
    options: [
      { mode: "manual" as const, available: true },
      { mode: "smart" as const, available: true },
      { mode: "off" as const, available: true },
    ],
  },
});

/** Overrides mit Composer-Patch: Settings bleiben default erhalten. */
export function chatFixture({
  composerPatch,
  ...overrides
}: {
  composerPatch?: Partial<HermesV2Chat["composer"]>;
} & Partial<Omit<HermesV2Chat, "requestStates" | "composer">> & {
    requestStates?: ChatRequestState[];
  } = {}): HermesV2Chat {
  return requestChatFixture({
    activeSnapshot: snapshot(),
    composer: composerFixture({
      settings: composerSettings(),
      ...composerPatch,
    }),
    setDraft: vi.fn(),
    submit: vi.fn().mockResolvedValue(undefined),
    setTitle: vi.fn().mockResolvedValue(undefined),
    selectReasoning: vi.fn().mockResolvedValue(undefined),
    setApprovalMode: vi.fn().mockResolvedValue(undefined),
    selectModel: vi.fn().mockResolvedValue(undefined),
    cancelModelSelection: vi.fn(),
    uploadAttachment: vi.fn().mockResolvedValue(undefined),
    removeAttachment: vi.fn(),
    checkUpload: vi.fn().mockResolvedValue(undefined),
    readCatalog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Partial<HermesV2Chat> & { requestStates?: ChatRequestState[] });
}

export const textbox = () =>
  screen.getByRole("textbox", {
    name: "Nachricht an Hermes",
  }) as HTMLTextAreaElement;
export const notices = () =>
  Array.from(document.querySelectorAll("[role='status'], [role='alert']")).map(
    (node) => node.textContent ?? "",
  );

export type RenderOverrides = {
  draft: string;
  onOpenSessions: () => void;
  onOverlayActiveReturns: (open: boolean) => void;
  /** Routerbasis wie in der echten Wrapt-Oberfläche. */
  basename?: string;
};

export function renderArea(
  chat: HermesV2Chat,
  overrides: Partial<RenderOverrides> = {},
) {
  render(
    // Routed Kontext wie überall: der Notice-Link läuft über den Router.
    <MemoryRouter
      {...(overrides.basename
        ? {
            basename: overrides.basename,
            initialEntries: [`${overrides.basename}/hermes-v2`],
          }
        : {})}
    >
      <HermesV2ComposerArea
        chat={chat}
        snapshot={chat.activeSnapshot}
        value={overrides.draft ?? chat.draft}
        disabled={false}
        disabledReason={null}
        running={false}
        submitting={false}
        active
        onSubmit={chat.submit}
        onNewSession={vi.fn()}
        onOpenSessions={overrides.onOpenSessions}
        onOverlayActive={overrides.onOverlayActiveReturns}
      />
    </MemoryRouter>,
  );
  return chat;
}
