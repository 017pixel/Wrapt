import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HermesV2ClientMessage, HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { integrationFixture } from "./organization/integration-fixture.js";
type Input = { [K in HermesV2ClientMessage["op"]]: Omit<Extract<HermesV2ClientMessage, { op: K }>, "id"|"v"> }[HermesV2ClientMessage["op"]];

export async function composerFixture() {
  const f = await integrationFixture();
  const original = f.core.resultHook!;
  let pendingTitle = false;
  let capability = true;
  let disable: boolean | undefined = true;
  let lazy = false;
  let approvalMode = "manual";
  const reasoning = new Map<string, string>();
  f.core.resultHook = (method, params, result) => {
    const value = original(method, params, result);
    const session = [...f.core.sessions.values()].find((entry) => entry.liveId === params.session_id);
    if (method === "file.attach") {
      const name = String(params.name);
      const path = join(f.root, "attachments", name);
      mkdirSync(join(f.root, "attachments"), { recursive: true });
      writeFileSync(path, Buffer.from(String(params.data_url).split(",")[1]!, "base64"), { flag: "wx" });
      return { attached: true, uploaded: true, name, path, ref_path: `attachments/${name}`, ref_text: `@file:attachments/${name}` };
    }
    if (method === "session.title") { session!.title = String(params.title); return { title: session!.title, pending: pendingTitle }; }
    if (method === "config.set" && params.key === "reasoning") { reasoning.set(session!.id, String(params.value)); return { key: "reasoning", value: params.value }; }
    if (method === "config.set" && params.key === "approvals.mode") { approvalMode = String(params.value); return { key: "approvals.mode", value: params.value }; }
    if (["session.activate", "session.resume", "session.create"].includes(method)) {
      const reply = value as { info: object };
      const effort = lazy ? "" : reasoning.get(session?.id ?? "") ?? "high";
      return { ...reply, info: { ...reply.info, reasoning_effort: effort, reasoning_effort_wire: effort === "ultra" ? "max" : effort,
        approval_mode: approvalMode, yolo: false } };
    }
    if (method === "model.options") {
      const catalog = value as { providers: Array<{ capabilities: object }> };
      return { ...catalog, providers: catalog.providers.map((provider) => ({ ...provider,
        capabilities: { "model-a": { reasoning: capability, can_disable_reasoning: disable }, "model-b": { reasoning: true } } })) };
    }
    return value;
  };
  function browser(owner = "a", composer = true) {
    const manager = f.pool.get(owner);
    const id = randomUUID();
    const messages: HermesV2ServerMessage[] = [];
    manager.add({ id, composer, readEvidence: true, send: (message) => messages.push(message) });
    const run = async (input: Input) => {
      const message = { v: 1, id: randomUUID(), ...input } as HermesV2ClientMessage;
      await manager.handle(id, message);
      return messages.find((entry) => (entry.type === "result" || entry.type === "error") && entry.id === message.id)!;
    };
    return { id, manager, messages, run };
  }
  function upload(client: ReturnType<typeof browser>, session: string, bytes = Buffer.from("Dateiinhalt"),
    uploadId: string = randomUUID(), extraHeaders: Record<string, string> = {}, extra = "") {
    const boundary = "wrapt-test-boundary";
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n`), bytes,
      Buffer.from(`\r\n${extra}--${boundary}--\r\n`)]);
    return f.app.inject({ method: "POST", url: `/api/v1/hermes/v2/attachments?sessionId=${session}`, payload,
      headers: { host: "workbench.test", origin: "http://workbench.test", "tailscale-user-login": client.manager.principal,
        "content-type": `multipart/form-data; boundary=${boundary}`, "x-hermes-v2-connection-id": client.id,
        "x-hermes-v2-upload-id": uploadId, ...extraHeaders } });
  }
  return { ...f, browser, upload, pendingTitle: (value: boolean) => { pendingTitle = value; },
    capability: (value: boolean, canDisable?: boolean) => { capability = value; disable = canDisable; }, lazy: (value: boolean) => { lazy = value; } };
}
