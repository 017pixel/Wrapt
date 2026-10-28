import { useMemo } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon, WraptIcon } from "./icons";
import { useNavigationRegistry } from "../extensions/useNavigationRegistry";
import type { OwnedNavigationItem } from "../extensions/navigationRegistry";
import { isPageVisibleIn, useSidebarPreferences, type SidebarSectionKey, type PageRouteId } from "../stores/sidebarPreferences";
import { WorkspaceSwitcher } from "./workspaces/WorkspaceSwitcher";
import { useShortcutState } from "./shortcuts/shortcutState";
import { SidebarNavLink } from "./sidebar/SidebarNavLink";
import { orderNavigation } from "./sidebar/navigationOrdering";
import "./sidebar/sidebar-layout.css";

function isNavigationItemVisible(item: OwnedNavigationItem, hiddenPages: ReadonlySet<string>): boolean {
  const visibilityKey = item.value.runtime.legacyVisibilityKey;
  return visibilityKey === undefined
    ? item.value.contribution.visibleByDefault
    : isPageVisibleIn(hiddenPages, visibilityKey as PageRouteId);
}

function SectionHeader({ label, sectionKey }: { label: string; sectionKey: SidebarSectionKey }) {
  const toggle = useSidebarPreferences((s) => s.toggleSection);
  const isCollapsed = useSidebarPreferences((s) => s.collapsedSections[sectionKey]);
  // Immer eingehängt: Im eingeklappten Zustand blendet CSS den Text aus und
  // zeigt stattdessen eine Trennlinie (siehe sidebar-layout.css). Kein
  // bedingtes Unmount — das war der Sprung in der alten Animation.
  // Bewusst ohne Pfeil-Icon: Der Kopf bleibt klickbar und klappt die Sektion
  // auf und zu, zeigt aber kein Chevron.
  return (
    <button type="button" className="sidebar-section-header" onClick={() => toggle(sectionKey)} aria-expanded={!isCollapsed} aria-label={`${label} ${isCollapsed ? "ausklappen" : "einklappen"}`}>
      <span className="sidebar-section-label">{label}</span>
    </button>
  );
}

function useSectionCollapsed(sectionKey: SidebarSectionKey) {
  return useSidebarPreferences((s) => s.collapsedSections[sectionKey]);
}

// Hülle um Sektionsinhalte: bleibt immer eingehängt, damit das Auf- und
// Zuklappen per CSS animieren kann (siehe .sidebar-section-body).
function SectionBody({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <div className={`sidebar-section-body${collapsed ? " is-collapsed" : ""}`}>
      <div className="sidebar-section-body-inner">{children}</div>
    </div>
  );
}

interface SidebarProps {
  collapsed: boolean;
  width: number;
  onToggle: () => void;
  onResize: (width: number) => void;
}

export function Sidebar({ collapsed, width, onToggle, onResize }: SidebarProps) {
  const showingNumbers = useShortcutState((state) => state.showingNumbers);
  // Das Set abonnieren, nicht die (stabile) Methode: sonst rechnen die Memos unten
  // beim Umschalten der Seiten-Sichtbarkeit nie neu.
  const hiddenPages = useSidebarPreferences((s) => s.hiddenPages);
  const navigationOrder = useSidebarPreferences((s) => s.navigationOrder);
  const navigation = useNavigationRegistry();
  // Alle Sektions-Hooks bedingungslos und ganz oben: früher standen sie hinter `!collapsed &&`
  // im JSX, wodurch beim Ein-/Ausklappen die Hook-Anzahl sprang und React die Seite abbrach.
  const workspaceSectionCollapsed = useSectionCollapsed("workspace");
  const toolsSectionCollapsed = useSectionCollapsed("tools");
  const footerSectionCollapsed = useSectionCollapsed("footer");
  const visiblePrimaryNavItems = useMemo(() => orderNavigation(navigation.byGroup.workspace.filter((item) => isNavigationItemVisible(item, hiddenPages)), navigationOrder), [navigation, hiddenPages, navigationOrder]);
  const visibleToolRouteItems = useMemo(() => orderNavigation(navigation.byGroup.tools.filter((item) => isNavigationItemVisible(item, hiddenPages)), navigationOrder), [navigation, hiddenPages, navigationOrder]);
  const visibleFooterNavItems = useMemo(() => orderNavigation(navigation.byGroup.account.filter((item) => isNavigationItemVisible(item, hiddenPages)), navigationOrder), [navigation, hiddenPages, navigationOrder]);
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const handleMove = (moveEvent: globalThis.PointerEvent) => onResize(startWidth + moveEvent.clientX - startX);
    const handleEnd = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd, { once: true });
    // pointercancel (Touch-Unterbrechung, Alt-Tab) muss genauso aufräumen,
    // sonst bleiben cursor/userSelect dauerhaft gesetzt (F04-07).
    window.addEventListener("pointercancel", handleEnd, { once: true });
  };

  return (
    <div
      className={`sidebar-shell hidden md:flex ${collapsed ? "is-collapsed" : ""}`}
      style={{ "--sidebar-width": `${collapsed ? 56 : width}px` } as CSSProperties}
    >
      <aside className="workspace-sidebar flex-col">
        <div className="sidebar-brand">
          <div className="sidebar-mark"><WraptIcon className="h-[18px] w-[18px]" /></div>
          <div className="sidebar-label" aria-hidden={collapsed}>Wrapt</div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={onToggle}
            aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
            title={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
          >
            {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
          </button>
        </div>
        <div className="workspace-switcher-sidebar-slot"><WorkspaceSwitcher compact={collapsed} /></div>
        <nav className="sidebar-scroll sidebar-primary-navigation" aria-label="Seiten und Werkzeuge">
          <div className="sidebar-section">
            <SectionHeader label="Allgemein" sectionKey="workspace" />
            <SectionBody collapsed={workspaceSectionCollapsed && !showingNumbers}>
              {visiblePrimaryNavItems.map((item) => (
                <SidebarNavLink key={item.contributionId} item={item} />
              ))}
            </SectionBody>
          </div>
          <div className="sidebar-section">
            <SectionHeader label="Werkzeuge" sectionKey="tools" />
            <SectionBody collapsed={toolsSectionCollapsed && !showingNumbers}>
              {visibleToolRouteItems.map((item) => (
                <SidebarNavLink key={item.contributionId} item={item} />
              ))}
            </SectionBody>
          </div>
        </nav>
        <nav className="sidebar-footer sidebar-section" aria-label="Account und System">
          <SectionHeader label="Account und System" sectionKey="footer" />
          <SectionBody collapsed={footerSectionCollapsed && !showingNumbers}>
            {visibleFooterNavItems.map((item) => (
              <SidebarNavLink key={item.contributionId} item={item} />
            ))}
          </SectionBody>
        </nav>
      </aside>
      {!collapsed ? (
        <div className="sidebar-resize-handle" role="separator" aria-orientation="vertical" onPointerDown={startResize} />
      ) : null}
    </div>
  );
}
