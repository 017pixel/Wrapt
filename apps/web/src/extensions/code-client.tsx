import * as React from "react";
import { z } from "zod";
import type { PluginCleanup } from "@wrapt/plugin-sdk";
import type { PluginClientContext, PluginClientDefinition, PluginUiContext } from "@wrapt/plugin-sdk/client";
import { codePluginUi } from "./code-ui";
import { pageRouteRegistry } from "./pageRouteRegistry";
import { mutate, request } from "../lib/apiClient/transport";

const bridge = globalThis as unknown as Record<symbol, unknown>;
bridge[Symbol.for("wrapt.plugin.bridge.v1")] = { React, z };

export async function pluginRequest<T>(path: string, body?: unknown, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "POST"): Promise<T> {
  return (method === "GET"
    ? request(`/plugins/${path}`, z.unknown())
    : mutate(`/plugins/${path}`, method, z.unknown(), body)) as Promise<T>;
}

export interface CodeClientRelease { id: string; version: string; revision: string; generation?: string; entrypoint?: string }
interface ClientBinding { signature: string; controller: AbortController; cleanups: PluginCleanup[] }

export class CodePluginClientRuntime {
  private readonly bindings = new Map<string, ClientBinding>();
  private readonly events = new Map<string, Set<(data: unknown) => void>>();
  private readonly slots = new Map<string, { owner: string; Component: React.ComponentType<PluginUiContext> }>();

  constructor(private readonly navigate: (path: string) => void, private readonly notify: (message: string) => void) {}

  async sync(releases: CodeClientRelease[]): Promise<void> {
    const active = new Set(releases.filter((release) => release.entrypoint).map((release) => release.id));
    for (const id of this.bindings.keys()) if (!active.has(id)) await this.unload(id);
    for (const release of releases) {
      if (!release.entrypoint) continue;
      const signature = `${release.version}:${release.revision}:${release.generation ?? ""}`;
      if (this.bindings.get(release.id)?.signature === signature) continue;
      await this.unload(release.id);
      const binding = { signature, controller: new AbortController(), cleanups: [] as PluginCleanup[] };
      this.bindings.set(release.id, binding);
      try {
        const module = await import(/* @vite-ignore */ release.entrypoint) as { default?: PluginClientDefinition };
        if (binding.controller.signal.aborted) continue;
        if (typeof module.default?.setup !== "function") throw new Error("Das UI-Modul muss defineClientPlugin({ setup }) exportieren.");
        const cleanup = await module.default.setup(this.context(release, binding));
        if (typeof cleanup === "function") binding.cleanups.push(cleanup);
      } catch (error) {
        await this.unload(release.id);
        this.notify(`${release.id}: ${error instanceof Error ? error.message : "UI konnte nicht geladen werden"}`);
      }
    }
  }

  deliver(event: { name: string; data: unknown }): void {
    for (const listener of this.events.get(event.name) ?? []) {
      try { listener(event.data); } catch { /* Fehler eines Plugins unterbricht andere Listener nicht. */ }
    }
  }

  async close(): Promise<void> { for (const id of this.bindings.keys()) await this.unload(id); }

  private async unload(id: string): Promise<void> {
    const binding = this.bindings.get(id);
    if (!binding) return;
    this.bindings.delete(id);
    binding.controller.abort();
    codePluginUi.removeOwner(id);
    for (const [name, slot] of this.slots) if (slot.owner === id) this.slots.delete(name);
    for (const cleanup of binding.cleanups.reverse()) { try { await cleanup(); } catch { /* Cleanup wird vollständig durchlaufen. */ } }
  }

  private context(release: CodeClientRelease, binding: ClientBinding): PluginClientContext {
    const own = (name: string) => name.includes(":") ? name : `${release.id}:${name}`;
    const track = <T extends { dispose(): void }>(registration: T): T => { binding.cleanups.push(() => registration.dispose()); return registration; };
    const result = async <T,>(path: string, input: unknown) => (await pluginRequest<{ result: T }>(path, input)).result;
    return {
      id: release.id, version: release.version, signal: binding.controller.signal,
      effect: (cleanup) => { binding.cleanups.push(cleanup); },
      rpc: { call: (name, input) => result(`runtime/${encodeURIComponent(release.id)}/rpc/${encodeURIComponent(name)}`, input) },
      host: { call: (operation, input) => result(`host/${encodeURIComponent(operation)}`, input) },
      commands: { execute: (name, input) => result(`commands/${encodeURIComponent(own(name))}`, input) },
      events: { on: (name, handler) => {
        const key = own(name);
        const handlers = this.events.get(key) ?? new Set();
        handlers.add(handler); this.events.set(key, handlers);
        return track({ dispose: () => { handlers.delete(handler); if (handlers.size === 0) this.events.delete(key); } });
      } },
      ui: {
        register: (contribution) => {
          if (contribution.surface === "page" && pageRouteRegistry.getSnapshot().routes.some((route) => route.value.contribution.path === contribution.path)) throw new Error("Diese Route wird bereits von Wrapt verwendet. Nutze eine eigene Plugin-Route oder ui.transform zum Ersetzen.");
          return track(codePluginUi.register(release.id, contribution));
        },
        transform: (surface, editor, options) => track(codePluginUi.transform(release.id, surface, editor, options?.priority)),
        invalidate: codePluginUi.invalidate, inspect: () => codePluginUi.inspect(),
      },
      slots: {
        register: (name, Component) => {
          const key = own(name);
          if (this.slots.has(key)) throw new Error(`Der Slot ${key} existiert bereits.`);
          this.slots.set(key, { owner: release.id, Component });
          codePluginUi.invalidate();
          return track({ dispose: () => { this.slots.delete(key); codePluginUi.invalidate(); } });
        },
        render: (name, context) => { const slot = this.slots.get(own(name)); return slot ? React.createElement(slot.Component, context) : null; },
      },
      navigate: this.navigate, notify: this.notify,
    };
  }
}
