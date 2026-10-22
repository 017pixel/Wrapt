import { useSyncExternalStore, type ReactNode } from "react";
import type { PluginUiContribution, PluginUiContext, PluginUiSurface } from "@wrapt/plugin-sdk/client";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { codePluginUi } from "./code-ui";

export function useCodeUiRevision(): number { return useSyncExternalStore(codePluginUi.subscribe, codePluginUi.getSnapshot); }

export function CodePluginSurface({ surface, target, builtins = [], context = {} }: { surface: PluginUiSurface; target?: string; builtins?: PluginUiContribution[]; context?: PluginUiContext }) {
  useCodeUiRevision();
  const contributions = codePluginUi.resolve(surface, builtins).filter((item) => item.target === undefined || item.target === target);
  return <>{contributions.map((item) => <ErrorBoundary key={item.id} label={item.title}><CodeContribution value={item} context={context} /></ErrorBoundary>)}</>;
}

function CodeContribution({ value, context }: { value: PluginUiContribution; context: PluginUiContext }): ReactNode {
  if (value.Component) return <value.Component {...context} />;
  if (value.action) return <button type="button" className="quiet-button" onClick={() => { void Promise.resolve(value.action?.()).catch(() => undefined); }}>{value.title}</button>;
  return value.children ?? null;
}
