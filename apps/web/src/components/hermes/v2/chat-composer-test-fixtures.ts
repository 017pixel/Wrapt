import type { HermesV2ComposerSettings, HermesV2Snapshot } from "@wrapt/contracts/hermes-v2";
import type { OperationResult } from "./gateway-protocol";
import { snapshot } from "./chat-test-fixtures";
import { ChatAttachmentClient } from "./chat-attachment-client";

export const selection = { provider: "test", model: "model-a" };
export const settings: HermesV2ComposerSettings = { reasoning: { effort: "high", wire: "medium" },
  approvals: { mode: "smart", scope: "global", editable: false, effectiveBypass: false, options: [] } };
export const composerCatalog = (): OperationResult<"catalog.read">["data"] => ({ commands: [], hermesEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"],
  models: { current: selection, providers: [{ id: "test", label: "Test", available: true, models: [{ id: "model-a", label: "Modell A", reasoningEfforts: [],
    fast: false, priceInput: null, priceOutput: null, reportedReasoning: true, canDisableReasoning: true }] }] } });
export const composerSnapshot = (id = "a", patch: Partial<HermesV2Snapshot> = {}) => snapshot(id, { selection, composer: settings, ...patch });
export class TestUploads {
  calls: { method: string; path: string; sessionId: string | null; connectionId: string | null; uploadId: string; signal: AbortSignal | null; parts: string[] }[] = [];
  statuses = new Map<string, unknown>();
  handle: ((call: TestUploads["calls"][number]) => Response | Promise<Response> | null) | null = null;
  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input), "https://workbench.test"), headers = new Headers(init?.headers);
    const uploadId = headers.get("X-Hermes-V2-Upload-Id") ?? url.pathname.split("/").at(-1)!;
    const call = { method: init?.method ?? "GET", path: url.pathname, sessionId: url.searchParams.get("sessionId"), connectionId: headers.get("X-Hermes-V2-Connection-Id"),
      uploadId, signal: init?.signal ?? null, parts: init?.body instanceof FormData ? [...init.body.keys()] : [] };
    this.calls.push(call);
    if (call.method === "POST") {
      const file = (init!.body as FormData).get("file") as File;
      this.statuses.set(uploadId, { uploadId, state: "ready", attachment: { id: this.calls.length.toString(16).padStart(64, "0"),
        name: file.name, bytes: file.size, mime: file.type || "application/octet-stream", kind: "file-reference", expiresAt: Date.now() + 86_400_000 } });
    }
    const response = this.handle?.(call); if (response) return response;
    return this.result(this.statuses.get(uploadId) ?? { uploadId, state: "not_sent", attachment: null });
  };
  result(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }); }
  client() { return new ChatAttachmentClient(this.fetch); }
}
