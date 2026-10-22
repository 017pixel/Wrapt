import type { ComponentType, ReactNode } from "react";
import type { PluginCleanup } from "./schema.js";
export { z } from "zod";

export type PluginUiSurface = "navigation" | "page" | "dashboard" | "topbar" | "statusbar" | "settings" | "context-menu" | "orbit" | "panel";

export interface PluginClientRegistration { dispose(): void }

export interface PluginUiContext {
  projectId?: string;
  selection?: unknown;
}

export interface PluginUiContribution {
  id: string;
  surface: PluginUiSurface;
  title: string;
  path?: string;
  order?: number;
  target?: string;
  Component?: ComponentType<PluginUiContext>;
  action?: () => void | Promise<void>;
  children?: ReactNode;
}

export interface PluginUiEditor {
  list(): readonly Readonly<PluginUiContribution>[];
  get(id: string): Readonly<PluginUiContribution> | undefined;
  update(id: string, changes: Partial<Pick<PluginUiContribution, "title" | "order" | "path" | "Component">>): void;
  hide(id: string): void;
  remove(id: string): void;
  replace(id: string, contribution: Omit<PluginUiContribution, "id" | "surface">): void;
}

export interface PluginClientContext {
  readonly id: string;
  readonly version: string;
  readonly signal: AbortSignal;
  effect(cleanup: PluginCleanup): void;
  rpc: { call<T = unknown>(name: string, input?: unknown): Promise<T> };
  host: { call<T = unknown>(operation: string, input?: unknown): Promise<T> };
  commands: { execute(name: string, input?: unknown): Promise<unknown> };
  events: { on(name: string, handler: (data: unknown) => void): PluginClientRegistration };
  ui: {
    register(contribution: PluginUiContribution): PluginClientRegistration;
    transform(surface: PluginUiSurface, editor: (value: PluginUiEditor) => void, options?: { priority?: number }): PluginClientRegistration;
    invalidate(): void;
    inspect(): readonly Readonly<PluginUiContribution>[];
  };
  slots: {
    register(name: string, Component: ComponentType<PluginUiContext>): PluginClientRegistration;
    render(name: string, context?: PluginUiContext): ReactNode;
  };
  navigate(path: string): void;
  notify(message: string): void;
}

export interface PluginClientDefinition {
  setup(context: PluginClientContext): void | PluginCleanup | Promise<void | PluginCleanup>;
}

export function defineClientPlugin<T extends PluginClientDefinition>(definition: T): T {
  return definition;
}
