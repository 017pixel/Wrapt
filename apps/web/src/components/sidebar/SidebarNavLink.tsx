import { NavLink, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ComponentType, CSSProperties } from "react";
import type { OwnedNavigationItem } from "../../extensions/navigationRegistry";
import { useNavigationRegistry } from "../../extensions/useNavigationRegistry";
import { useSidebarPreferences, type PageRouteId } from "../../stores/sidebarPreferences";
import { prefetchRouteTarget } from "../../lib/routePrefetch";
import { navigationUsesExactMatch } from "../sidebarNavigation";
import { openGlobalContextMenu } from "../context-menu/contextMenuEvents";
import { hostContextMenuId } from "../../extensions/hostContextMenus";
import { useSidebarNavigationReorder } from "./useSidebarNavigationReorder";
import { orderNavigation } from "./navigationOrdering";
import { ShortcutBadge } from "../shortcuts/ShortcutBadge";
import { useNavigationDrag } from "./useNavigationDrag";

export function SidebarNavLink({ item }: { item: OwnedNavigationItem }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const togglePage = useSidebarPreferences((state) => state.togglePage);
  const reorderEnabled = useSidebarPreferences((state) => state.navigationReorderEnabled);
  const toggleReorder = useSidebarPreferences((state) => state.toggleNavigationReorder);
  const moveBefore = useSidebarPreferences((state) => state.moveNavigationBefore);
  const navigation = useNavigationRegistry();
  const { label, icon: Icon } = { label: item.value.contribution.label, icon: item.value.runtime.icon };
  const NavigationIcon = Icon as ComponentType<{ className?: string; style?: CSSProperties }> | undefined;
  const to = item.value.route.path;
  const visibilityKey = item.value.runtime.legacyVisibilityKey as PageRouteId | undefined;
  const prefetch = () => prefetchRouteTarget(client, to);
  const groupItems = navigation.items.filter((entry) => entry.value.contribution.group === item.value.contribution.group);
  const availableIds = groupItems.map((entry) => entry.contributionId);
  const firstId = orderNavigation(groupItems, useSidebarPreferences.getState().navigationOrder)[0]?.contributionId;
  const touchReorder = useSidebarNavigationReorder({ enabled: reorderEnabled, itemId: item.contributionId, availableIds, moveBefore });
  const drag = useNavigationDrag({ itemId: item.contributionId, availableIds, enabled: reorderEnabled });
  return (
    <NavLink
      ref={drag.ref}
      to={to}
      end={navigationUsesExactMatch(to)}
      className={`sidebar-item ${touchReorder.active || drag.active ? "is-touch-reordering" : ""}`}
      data-navigation-id={item.contributionId}
      onPointerEnter={prefetch}
      // Touch kennt kein Überfahren: `pointerdown` feuert vor dem Klick und
      // verschafft Bündel und Daten den entscheidenden Vorsprung.
      onPointerDown={(event) => { prefetch(); touchReorder.onPointerDown(event); }}
      onPointerMove={touchReorder.onPointerMove}
      onPointerUp={touchReorder.onPointerUp}
      onPointerCancel={touchReorder.onPointerCancel}
      onClick={touchReorder.onClick}
      onFocus={prefetch}
      onContextMenu={(event) => {
        if (touchReorder.suppressContextMenu()) { event.preventDefault(); event.stopPropagation(); return; }
        openGlobalContextMenu(event, {
        surface: "host.context-menu.tool",
        title: label,
        quickActionToolId: item.contributionId,
        actions: [
          { id: hostContextMenuId("tool.open"), icon: Icon ? <Icon className="h-4 w-4" /> : undefined, onSelect: () => navigate(to) },
          { id: hostContextMenuId("tool.new-tab"), onSelect: () => window.open(to, "_blank", "noopener,noreferrer") },
          ...(visibilityKey && visibilityKey !== "settings" ? [{ id: hostContextMenuId("tool.hide"), onSelect: () => togglePage(visibilityKey) }] : []),
          { id: hostContextMenuId("tool.pin"), label: "An erste Stelle anheften", checked: firstId === item.contributionId, onSelect: () => moveBefore(item.contributionId, firstId ?? item.contributionId, availableIds) },
          { id: hostContextMenuId("tool.reorder"), label: reorderEnabled ? "Reihenfolge sperren" : "Reihenfolge ändern", checked: reorderEnabled, onSelect: toggleReorder },
          { id: hostContextMenuId("tool.settings"), onSelect: () => navigate("/settings#einstellungen:rechtsklick") },
        ],
      });}}
      aria-label={label}
      title={reorderEnabled ? `${label} · Ziehen zum Sortieren · Alt + ↑/↓` : label}
      draggable={reorderEnabled}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
      onKeyDown={drag.onKeyDown}
    >
      {NavigationIcon ? <NavigationIcon className="sidebar-item-icon h-4 w-4 shrink-0" style={{ color: "inherit" }} /> : null}
      <span className="sidebar-item-text">{label}</span>
      <ShortcutBadge itemId={item.contributionId} />
    </NavLink>
  );
}
