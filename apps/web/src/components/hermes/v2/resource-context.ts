import type { OwnerRecord } from "./chat-owners";
import type { ChatRuntime } from "./chat-runtime";
import type { HermesV2ResourcesOptions } from "./resource-types";
import { staleResource } from "./resource-error";

export interface ResourceCapture {
  generation: number;
  owner: OwnerRecord;
  ownerGeneration: number;
  sessionId: string | null;
  socket: number;
  binding: string | null;
  scope: string | null;
}
export class ResourceContext {
  generation = 0;
  scope: string | null = null;
  options: HermesV2ResourcesOptions | null = null;
  mounted = false;
  constructor(readonly chat: ChatRuntime) {}
  visible(): boolean {
    const options = this.options;
    const owner = options ? this.chat.owners.records.get(options.ownerId) : null;
    return this.mounted && this.chat.enabled() && !!options?.enabled && options.active && options.visible
      && !options.signal.aborted && options.area !== null && !!owner?.mounted
      && (typeof document === "undefined" || document.visibilityState !== "hidden")
      && this.chat.client.getSnapshot().state === "online";
  }
  capture(): ResourceCapture {
    if (!this.visible()) throw staleResource();
    const owner = this.chat.owners.records.get(this.options!.ownerId)!;
    return { generation: this.generation, owner, ownerGeneration: owner.generation,
      sessionId: owner.sessionId, socket: this.chat.client.generation,
      binding: this.chat.client.getComposerBinding()?.id ?? null, scope: this.scope };
  }
  valid(capture: ResourceCapture): boolean {
    return this.visible() && this.generation === capture.generation
      && this.chat.owners.records.get(this.options!.ownerId) === capture.owner
      && capture.owner.mounted && capture.owner.generation === capture.ownerGeneration
      && capture.owner.sessionId === capture.sessionId && this.chat.client.generation === capture.socket
      && (this.chat.client.getComposerBinding()?.id ?? null) === capture.binding;
  }
  assert(capture: ResourceCapture, mutation = false): void {
    if (!this.valid(capture) || (mutation && capture.scope !== this.scope)) throw staleResource(mutation ? "unknown" : "not_sent");
  }
}
