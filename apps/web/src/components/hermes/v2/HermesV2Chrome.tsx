import { Link } from "react-router";
import {
  CloseIcon,
  ExternalLinkIcon,
  LayoutPanelIcon,
} from "../../icons";
import {
  hermesV2ClassicHref,
  hermesV2StandaloneHref,
} from "../../../lib/hermesV2Routes";
import { AREA_META, type SelectableArea } from "./resource-areas";

/**
 * Die Marke der Sitzungsspalte ist entfallen: die Spalte beginnt mit der
 * Suchreihe. Im Drawer bleibt allein der Knopf zum Schließen - er gehört
 * zur Bedienung des Drawers, nicht zur Marke.
 */
export function HermesV2SidebarBrand({
  onClose,
}: {
  onClose?: (() => void) | undefined;
}) {
  if (!onClose) return null;
  return (
    <div className="hermesv2-sidebar-brand">
      <button
        type="button"
        className="icon-button hermesv2-drawer-close"
        aria-label="Sitzungsspalte schließen"
        data-modal-autofocus
        onClick={onClose}
      >
        <CloseIcon aria-hidden style={{ color: "currentColor" }} />
      </button>
    </div>
  );
}

/**
 * Eine ruhige Kopfzeile. Der Sitzungstitel gehört zum aktuellen Chat; einen
 * neuen Chat startet man ausschließlich über die Seitenleiste, deshalb gibt
 * es hier keinen eigenen Knopf dafür.
 */
export function HermesV2ChatHeader({
  title,
  area,
  sessionId,
  standalone,
  drawerId,
  sidebarExpanded,
  onToggleSidebar,
}: {
  title: string | null;
  area: SelectableArea;
  sessionId: string | null;
  standalone: boolean;
  drawerId: string;
  sidebarExpanded: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="hermesv2-toolbar">
      <button
        type="button"
        className="icon-button hermesv2-drawer-toggle"
        aria-label="Sitzungen"
        title="Sitzungen"
        aria-expanded={sidebarExpanded}
        aria-controls={drawerId}
        onClick={onToggleSidebar}
      >
        <LayoutPanelIcon aria-hidden style={{ color: "currentColor" }} />
      </button>
      <h1 className="hermesv2-toolbar-title">
        {area === "chat"
          ? title || "Hermes"
          : AREA_META.find((entry) => entry.id === area)?.label}
      </h1>
      <div className="hermesv2-toolbar-links">
        <Link
          className="quiet-button hermesv2-classic-link"
          to={hermesV2ClassicHref(sessionId)}
          title="Klassische Hermes-Oberfläche öffnen"
        >
          Klassisch
        </Link>
        {standalone ? null : (
          <a
            className="icon-button"
            aria-label="Fenster"
            title="In eigenem Fenster öffnen"
            href={hermesV2StandaloneHref(sessionId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLinkIcon aria-hidden style={{ color: "currentColor" }} />
          </a>
        )}
      </div>
    </header>
  );
}

/**
 * Fußzeile der Seitenleiste. Die Einstellungen liegen in den
 * Wrapt-Einstellungen und brauchen hier keinen eigenen Link; im
 * Standalone-Fenster bleibt nur der Rückweg zur Workbench.
 */
export function HermesV2SidebarFooter({
  standalone,
}: {
  standalone: boolean;
}) {
  if (!standalone) return null;
  return (
    <div className="hermesv2-sidebar-footer">
      <Link className="quiet-button" to="/">Zur Workbench</Link>
    </div>
  );
}
