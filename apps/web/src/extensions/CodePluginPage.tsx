import { createElement, type ComponentType } from "react";
import { useLocation } from "react-router";
import type { PluginUiContribution } from "@wrapt/plugin-sdk/client";
import { pageRouteRegistry } from "./pageRouteRegistry";
import { NotFound, pageComponent } from "./routeHost";
import { codePluginUi } from "./code-ui";
import { useCodeUiRevision } from "./code-surface";

const components = new Map<string, ComponentType>();

export function builtinCodePages(): PluginUiContribution[] {
  const snapshot = pageRouteRegistry.getSnapshot();
  return snapshot.pages.map((page) => {
    const path = snapshot.routes.find((route) => route.value.contribution.pageId === page.contributionId)?.value.contribution.path;
    return { id: page.contributionId, surface: "page", title: page.value.contribution.title, ...(path === undefined ? {} : { path }) };
  });
}

/** Geparkte Router-Seiten lesen die aktuelle Bindung auch nach Reload/Dispose. */
function CodePluginPage({ pageId }: { pageId: string }) {
  useCodeUiRevision();
  const location = useLocation();
  const value = codePluginUi.resolve("page", builtinCodePages()).find((item) => item.id === pageId);
  const original = pageRouteRegistry.getSnapshot().pages.find((page) => page.contributionId === pageId);
  if (!value || !original && value.path !== location.pathname) return <NotFound />;
  const Component = value.Component ?? (original ? pageComponent(original) : undefined);
  return Component ? <Component /> : <NotFound />;
}

export function codePageComponent(id: string): ComponentType {
  let Component = components.get(id);
  if (!Component) { Component = () => createElement(CodePluginPage, { pageId: id }); components.set(id, Component); }
  return Component;
}
