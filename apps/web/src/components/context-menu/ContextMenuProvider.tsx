import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contextMenuSurfaceSchema, hostContextMenuSurfaceSchema } from "@wrapt/extension-contracts";
import { contextMenuConfigSchema, defaultContextMenuConfig, type ContextMenuConfigResponse } from "@wrapt/contracts";
import { useNavigate } from "react-router";
import { contextMenuRegistry } from "../../extensions/contextMenuRegistry";
import { commandRegistry } from "../../extensions/commandRegistry";
import { hostContextMenuId } from "../../extensions/hostContextMenus";
import { useNavigationRegistry } from "../../extensions/useNavigationRegistry";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { rankedToolIds, recordToolUsage, useToolUsage } from "../../stores/toolUsage";
import { GlobalContextMenu, type ContextMenuQuickAction, type RenderedContextMenuItem } from "./GlobalContextMenu";
import { contextMenuEventWasClaimed, GLOBAL_CONTEXT_MENU_EVENT, showGlobalContextMenu, type GlobalContextMenuAction, type GlobalContextMenuRequest } from "./contextMenuEvents";
import { addBreadcrumb, describeClickTarget, formatStepsReport, getRecentSteps } from "../../lib/crashReport";
import { writeClipboardText } from "../../lib/clipboard";
import { CopyIcon } from "../icons";
import "./context-menu.css";

async function loadStepsEnvironment() {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4_000);
    const response = await fetch("/api/v1/health", { signal: controller.signal });
    window.clearTimeout(timeout);
    if (!response.ok) return { appVersion: null, bootId: null, webBuildId: null, backendReachable: false };
    const body = await response.json() as { version?: string; bootId?: string; webBuildId?: number | null };
    return {
      appVersion: body.version ?? null,
      bootId: body.bootId ?? null,
      webBuildId: body.webBuildId ?? null,
      backendReachable: true,
    };
  } catch {
    return { appVersion: null, bootId: null, webBuildId: null, backendReachable: false };
  }
}

async function copyRecentSteps() {
  const steps = getRecentSteps();
  const environment = await loadStepsEnvironment();
  const text = formatStepsReport(steps, environment);
  await writeClipboardText(text);
  addBreadcrumb(`Schritte-Protokoll kopiert (${steps.length} Schritte)`);
}

const nonFreeContextMenuTargetSelector = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "option",
  "summary",
  "img",
  "video",
  "audio",
  "canvas",
  "pre",
  "code",
  "[contenteditable]:not([contenteditable=\"false\"])",
  "[data-context-menu-ignore]",
  "[role=button]",
  "[role=checkbox]",
  "[role=link]",
  "[role=menuitem]",
  "[role=option]",
  "[role=switch]",
  "[role=tab]",
].join(", ");

function isFreeHostArea(target: Element): boolean {
  return target.closest("iframe, .global-context-menu, .global-context-menu-backdrop") === null
    && target.closest(nonFreeContextMenuTargetSelector) === null;
}

function surfaceEnabled(request: GlobalContextMenuRequest, config: typeof defaultContextMenuConfig): boolean {
  if (!config.enabled) return false;
  const hostSurface = hostContextMenuSurfaceSchema.safeParse(request.surface);
  if (!hostSurface.success) return true;
  return config.surfaces[hostSurface.data]?.enabled ?? true;
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const navigation = useNavigationRegistry();
  const registry = useSyncExternalStore(contextMenuRegistry.subscribe, contextMenuRegistry.getSnapshot);
  const configQuery = useQuery(wraptQueries.contextMenu());
  const usageEntries = useToolUsage((state) => state.entries);
  const [request, setRequest] = useState<GlobalContextMenuRequest | null>(null);
  const config = contextMenuConfigSchema.parse(configQuery.data?.contextMenu ?? defaultContextMenuConfig);

  useLayoutEffect(() => {
    const receive = (event: Event) => {
      const customEvent = event as CustomEvent<GlobalContextMenuRequest>;
      if (!customEvent.detail || !surfaceEnabled(customEvent.detail, config)) return;
      customEvent.preventDefault();
      addBreadcrumb(`Kontextmenü geöffnet: ${customEvent.detail.surface}${customEvent.detail.title ? ` (${customEvent.detail.title})` : ""}`);
      setRequest(customEvent.detail);
    };
    window.addEventListener(GLOBAL_CONTEXT_MENU_EVENT, receive);
    return () => window.removeEventListener(GLOBAL_CONTEXT_MENU_EVENT, receive);
  }, [config]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(".global-context-menu")) return;
      const description = describeClickTarget(event.target instanceof Element ? event.target : null);
      if (description) addBreadcrumb(description);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    const fallback = (event: MouseEvent) => {
      if (event.defaultPrevented || contextMenuEventWasClaimed(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !isFreeHostArea(target)) return;
      const host = target.closest<HTMLElement>("[data-context-menu-surface]");
      const parsed = contextMenuSurfaceSchema.safeParse(host?.dataset.contextMenuSurface);
      const accepted = showGlobalContextMenu({
        surface: parsed.success ? parsed.data : "host.context-menu.empty",
        x: event.clientX,
        y: event.clientY,
        ...(parsed.success && host?.dataset.contextMenuTitle ? { title: host.dataset.contextMenuTitle } : {}),
      });
      if (accepted) event.preventDefault();
    };
    document.addEventListener("contextmenu", fallback);
    return () => document.removeEventListener("contextmenu", fallback);
  }, []);

  const availableTools = useMemo(() => navigation.items.filter((item) =>
    item.value.contribution.group !== "account" && item.value.contribution.group !== "system",
  ), [navigation]);
  const quickToolIds = config.quickActions.mode === "manual"
    ? config.quickActions.manual
    : rankedToolIds(usageEntries, availableTools.map((item) => item.contributionId));
  const quickActions: ContextMenuQuickAction[] = useMemo(() => {
    const tools: ContextMenuQuickAction[] = quickToolIds.flatMap((id) => {
      const item = availableTools.find((candidate) => candidate.contributionId === id);
      if (!item) return [];
      const Icon = item.value.runtime.icon;
      return [{
        id,
        label: item.value.contribution.label,
        ...(Icon ? { icon: <Icon className="h-4 w-4" /> } : {}),
        run: () => {
          addBreadcrumb(`Schnellaktion gewählt: ${item.value.contribution.label} → ${item.value.route.path}`);
          recordToolUsage(id);
          navigate(item.value.route.path);
        },
      }];
    });
    tools.push({
      id: "wrapt.steps.copy",
      label: "Letzte Schritte kopieren",
      icon: <CopyIcon className="h-4 w-4" />,
      run: () => {
        void copyRecentSteps().catch(() => {
          addBreadcrumb("Schritte-Protokoll kopieren fehlgeschlagen");
        });
      },
    });
    return tools;
  }, [availableTools, navigate, quickToolIds]);

  const pinQuickAction = useCallback(async (toolId: string) => {
    const fallback = rankedToolIds(usageEntries, availableTools.map((item) => item.contributionId));
    const manual = [toolId, ...(config.quickActions.mode === "manual" ? config.quickActions.manual : fallback)]
      .filter((id, index, list) => list.indexOf(id) === index)
      .slice(0, 3);
    const next = { ...config, quickActions: { mode: "manual" as const, manual } };
    const response = await apiClient.saveContextMenu(next);
    if (response) queryClient.setQueryData<ContextMenuConfigResponse>(wraptQueries.contextMenu().queryKey, response);
  }, [availableTools, config, queryClient, usageEntries]);

  const renderedItems = useMemo(() => {
    if (!request) return [];
    const overrides = new Map((request.actions ?? []).map((action) => [action.id, action]));
    if (request.quickActionToolId) {
      const id = request.surface === "host.context-menu.extensions"
        ? hostContextMenuId("extensions.quick-pin")
        : hostContextMenuId("tool.quick-pin");
      if (!overrides.has(id)) overrides.set(id, {
        id,
        label: "In Schnellaktionen fixieren",
        onSelect: () => pinQuickAction(request.quickActionToolId!),
      });
    }
    return (registry.bySurface.get(request.surface) ?? []).flatMap((item): RenderedContextMenuItem[] => {
      if (!contextMenuRegistry.visibleIn(item, request.contextValues ?? new Map())) return [];
      const override: GlobalContextMenuAction | undefined = overrides.get(item.contributionId);
      if (item.value.runtime.requiresHostAction && !override) return [];
      const command = commandRegistry.get(item.value.contribution.commandId);
      if (!command) return [];
      const Icon = item.value.runtime.icon;
      const label = override?.label ?? command.value.contribution.title;
      const baseRun = override?.onSelect ?? (() => { void commandRegistry.execute(item.value.contribution.commandId); });
      return [{
        id: item.contributionId,
        label,
        ...(override?.icon !== undefined ? { icon: override.icon } : Icon ? { icon: <Icon className="h-4 w-4" /> } : {}),
        disabled: override?.disabled ?? false,
        danger: override?.danger ?? item.value.contribution.group === "danger",
        ...(override?.checked === undefined ? {} : { checked: override.checked }),
        group: item.value.contribution.group,
        run: () => {
          addBreadcrumb(`Menüaktion gewählt: ${label} [${request.surface}]`);
          void baseRun();
        },
      }];
    });
  }, [pinQuickAction, registry, request]);

  const close = useCallback(() => setRequest(null), []);
  return <>
    {children}
    {request && (renderedItems.length > 0 || quickActions.length > 0) ? <GlobalContextMenu request={request} items={renderedItems} quickActions={quickActions} onClose={close} /> : null}
  </>;
}
