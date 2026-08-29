import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate } from "react-router";
import { CloseIcon } from "./icons";
import { useNavigationRegistry } from "../extensions/useNavigationRegistry";
import type { OwnedNavigationItem } from "../extensions/navigationRegistry";
import { prefetchRouteTarget } from "../lib/routePrefetch";
import { wraptQueries } from "../lib/queryOptions";
import { isPageVisibleIn, useSidebarPreferences, type PageRouteId } from "../stores/sidebarPreferences";
import { openGlobalContextMenu } from "./context-menu/contextMenuEvents";
import { hostContextMenuId } from "../extensions/hostContextMenus";
import { useSidebarNavigationReorder } from "./sidebar/useSidebarNavigationReorder";
import { orderNavigation } from "./sidebar/navigationOrdering";

const navigationGroupKickers: ReadonlyArray<{ group: "workspace" | "tools" | "account"; kicker: string }> = [
  { group: "workspace", kicker: "Workspace" },
  { group: "tools", kicker: "Werkzeuge" },
  { group: "account", kicker: "Account und System" },
];

function isNavigationItemVisible(item: OwnedNavigationItem, hiddenPages: ReadonlySet<string>): boolean {
  const visibilityKey = item.value.runtime.legacyVisibilityKey;
  return visibilityKey === undefined
    ? item.value.contribution.visibleByDefault
    : isPageVisibleIn(hiddenPages, visibilityKey as PageRouteId);
}

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

// Muss zur Dauer von `navigation-page-exit` in index.css passen: Solange läuft
// die Seite nach links aus dem Bild, erst danach verlässt sie den Baum.
const NAVIGATION_EXIT_MS = 240;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function MobileNav({ open, onClose, triggerRef }: MobileNavProps) {
  const location = useLocation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const focusTrigger = useRef<() => void>(() => undefined);
  focusTrigger.current = () => triggerRef?.current?.focus();
  const openedPath = useRef(location.pathname);
  const previousPath = useRef(location.pathname);
  // Beim Schließen bleibt die Seite noch kurz im Baum, damit sie nicht
  // verschwindet, sondern nach links hinausgleitet, während die gewählte
  // Ansicht von rechts nachrückt.
  const [phase, setPhase] = useState<"closed" | "open" | "closing">(open ? "open" : "closed");
  // Abonniert statt einmalig gelesen — Änderungen in den Einstellungen greifen sofort.
  const hiddenPages = useSidebarPreferences((state) => state.hiddenPages);
  const navigationOrder = useSidebarPreferences((state) => state.navigationOrder);
  const navigation = useNavigationRegistry();
  const notifications = useQuery(wraptQueries.notifications());
  const filteredSections = useMemo(() => navigationGroupKickers.map(({ group, kicker }) => ({
    kicker,
    items: orderNavigation(navigation.byGroup[group].filter((item) => isNavigationItemVisible(item, hiddenPages)), navigationOrder),
  })).filter((section) => section.items.length > 0), [navigation, hiddenPages, navigationOrder]);

  useEffect(() => {
    const changed = previousPath.current !== location.pathname;
    previousPath.current = location.pathname;
    if (open && changed) onClose();
  }, [location.pathname, onClose, open]);

  useEffect(() => {
    if (open) {
      setPhase("open");
      return;
    }
    if (prefersReducedMotion()) {
      setPhase("closed");
      return;
    }
    setPhase((current) => (current === "open" ? "closing" : current));
    const timer = window.setTimeout(() => setPhase("closed"), NAVIGATION_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    openedPath.current = window.location.pathname;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    const previousHistoryState = window.history.state as Record<string, unknown> | null;
    const overlayState = { ...(previousHistoryState ?? {}), workbenchNavigation: true };
    window.history.pushState(overlayState, "", window.location.href);
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    // Fokus auf den Schließen-Knopf (erstes fokussierbares Element im Header) —
    // so landet die Tastatur im Dialog, ohne einen Navigationseintrag auszuwählen.
    closeButtonRef.current?.focus({ preventScroll: true });
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus({ preventScroll: true }), 0);

    const closeFromHistory = () => onClose();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if ((window.history.state as Record<string, unknown> | null)?.workbenchNavigation) window.history.back();
        else onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("popstate", closeFromHistory);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", closeFromHistory);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.clearTimeout(focusTimer);
      if (window.location.pathname === openedPath.current) {
        // Erst nach dem kurzen Exit-Übergang fokussieren: Bis dahin kann der
        // Trigger durch den Render des schließenden Layers noch nicht wieder
        // interaktiv sein.
        window.setTimeout(() => focusTrigger.current(), NAVIGATION_EXIT_MS + 20);
      }
    };
  }, [open, onClose, triggerRef]);

  const requestClose = () => {
    if ((window.history.state as Record<string, unknown> | null)?.workbenchNavigation) window.history.back();
    else onClose();
  };

  if (phase === "closed") return null;

  const closing = phase === "closing";

  return (
    <div
      ref={dialogRef}
      className={`mobile-navigation-page ${closing ? "is-closing" : "is-opening"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-navigation-title"
      aria-hidden={closing || undefined}
      inert={closing || undefined}
    >
      <header className="mobile-navigation-header">
        <div>
          <p className="mobile-navigation-kicker">Menü</p>
          <h2 id="mobile-navigation-title">Navigation</h2>
        </div>
        <button ref={closeButtonRef} autoFocus={open} type="button" onClick={requestClose} className="icon-button mobile-navigation-close" aria-label="Navigation schließen">
          <CloseIcon className="h-[18px] w-[18px]" />
        </button>
      </header>

      <nav className="mobile-navigation-list" aria-label="Hauptnavigation">
        {filteredSections.length === 0 ? (
          <div className="mobile-navigation-empty">
            <strong>Keine Seite sichtbar</strong>
            <span>In den Einstellungen sind alle Seiten ausgeblendet.</span>
          </div>
        ) : null}
        {filteredSections.map((section) => (
          <div key={section.kicker} className="mobile-navigation-section">
            <p className="mobile-navigation-section-kicker">{section.kicker}</p>
            <div className="mobile-navigation-grid">
              {section.items.map((item) => <NavigationLink key={item.contributionId} item={item} badge={item.value.route.path === "/inbox" ? notifications.data?.unreadCount ?? 0 : 0} />)}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

function NavigationLink({ item, badge = 0 }: { item: OwnedNavigationItem; badge?: number }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const navigation = useNavigationRegistry();
  const togglePage = useSidebarPreferences((state) => state.togglePage);
  const reorderEnabled = useSidebarPreferences((state) => state.navigationReorderEnabled);
  const toggleReorder = useSidebarPreferences((state) => state.toggleNavigationReorder);
  const moveBefore = useSidebarPreferences((state) => state.moveNavigationBefore);
  const { label, icon: Icon } = { label: item.value.contribution.label, icon: item.value.runtime.icon };
  const to = item.value.route.path;
  const visibilityKey = item.value.runtime.legacyVisibilityKey as PageRouteId | undefined;
  const prefetch = () => prefetchRouteTarget(client, to);
  const availableIds = navigation.items.map((entry) => entry.contributionId);
  const touchReorder = useSidebarNavigationReorder({ enabled: reorderEnabled, itemId: item.contributionId, availableIds, moveBefore });
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) => `mobile-navigation-item ${isActive ? "is-active" : ""} ${touchReorder.active ? "is-touch-reordering" : ""}`}
      data-navigation-id={item.contributionId}
      onPointerEnter={prefetch}
      // Auf dem Handy ist `pointerdown` der früheste sichere Zeitpunkt.
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
            { id: hostContextMenuId("tool.pin"), label: "An erste Stelle anheften", checked: useSidebarPreferences.getState().navigationOrder[0] === item.contributionId, onSelect: () => moveBefore(item.contributionId, navigation.items[0]?.contributionId ?? item.contributionId, availableIds) },
            { id: hostContextMenuId("tool.reorder"), label: reorderEnabled ? "Reihenfolge sperren" : "Reihenfolge ändern", checked: reorderEnabled, onSelect: toggleReorder },
            { id: hostContextMenuId("tool.settings"), onSelect: () => navigate("/settings#einstellungen:rechtsklick") },
          ],
        });
      }}
    >
      <span className="mobile-navigation-icon-slot">
        {Icon ? <Icon className="mobile-navigation-icon" aria-hidden /> : null}
      </span>
      <span className="mobile-navigation-highlight">
        <span className="mobile-navigation-label">{label}</span>
        {badge > 0 ? <span className="mobile-navigation-badge" aria-label={`${badge} ungelesen`}>{badge > 99 ? "99+" : badge}</span> : null}
      </span>
    </NavLink>
  );
}
