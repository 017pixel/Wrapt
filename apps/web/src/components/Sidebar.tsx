import { useMemo, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useNavigationRegistry } from "../extensions/useNavigationRegistry";
import type { OwnedNavigationItem } from "../extensions/navigationRegistry";
import { isPageVisibleIn, useSidebarPreferences, type SidebarSectionKey, type PageRouteId } from "../stores/sidebarPreferences";
import { WorkspaceSwitcher } from "./workspaces/WorkspaceSwitcher";
import { useShortcutState } from "./shortcuts/shortcutState";
import { SidebarNavLink } from "./sidebar/SidebarNavLink";
import { orderNavigation } from "./sidebar/navigationOrdering";
import { useSidebarResize } from "./sidebar/useSidebarResize";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  sidebarModeClassNames,
  type SidebarLayoutState,
} from "../lib/sidebarSizing";
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
  maxWidth?: number;
  onLayoutChange: (layout: SidebarLayoutState) => void;
}

export function Sidebar({ collapsed, width, maxWidth, onLayoutChange }: SidebarProps) {
  const shellRef = useRef<HTMLDivElement>(null);
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
  const effectiveMaxWidth = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, maxWidth ?? SIDEBAR_WIDTH_MAX));
  const visibleWidth = Math.min(effectiveMaxWidth, Math.max(SIDEBAR_WIDTH_MIN, width));
  const modeClasses = sidebarModeClassNames(collapsed, visibleWidth);
  const compact = collapsed || visibleWidth <= SIDEBAR_WIDTH_MIN;
  const resize = useSidebarResize({ collapsed, width: visibleWidth, maxWidth: effectiveMaxWidth, shellRef, onCommit: onLayoutChange });

  return (
    <div
      ref={shellRef}
      className={`sidebar-shell hidden md:flex ${modeClasses}`.trim()}
      style={{ "--sidebar-width": `${collapsed ? SIDEBAR_COLLAPSED_WIDTH : visibleWidth}px` } as CSSProperties}
    >
      <aside className="workspace-sidebar flex-col">
        <div className="sidebar-brand">
          <div className="sidebar-mark">
            <img
              className="sidebar-mark-image"
              src={`${import.meta.env.BASE_URL}favicon.svg`}
              alt=""
              width={20}
              height={20}
              draggable={false}
              onError={(event) => { event.currentTarget.style.display = "none"; }}
            />
          </div>
          <div className="sidebar-label" aria-hidden={compact}>Wrapt</div>
        </div>
        <div className="workspace-switcher-sidebar-slot"><WorkspaceSwitcher compact={compact} /></div>
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
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Breite der Seitennavigation ändern"
        aria-valuemin={SIDEBAR_WIDTH_MIN}
        aria-valuemax={effectiveMaxWidth}
        aria-valuenow={collapsed ? SIDEBAR_WIDTH_MIN : visibleWidth}
        aria-valuetext={collapsed ? "Eingeklappt" : `${visibleWidth} Pixel`}
        tabIndex={0}
        onPointerDown={resize.onPointerDown}
        onKeyDown={resize.onKeyDown}
      />
    </div>
  );
}
