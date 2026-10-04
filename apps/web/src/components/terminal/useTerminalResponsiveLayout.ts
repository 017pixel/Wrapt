import { useEffect, useState } from "react";
import { useResponsiveShell, usesTabletSidebar } from "../../lib/useResponsiveShell";

/** Trennt Touch-Bedienung von der mobilen Einspalten-Anordnung des Terminals. */
export function useTerminalResponsiveLayout() {
  const responsive = useResponsiveShell();
  const isMobile = responsive.mode !== "desktop" && !usesTabletSidebar(responsive.mode, responsive.orientation);
  const [sidebarVisible, setSidebarVisible] = useState(!isMobile);

  useEffect(() => {
    setSidebarVisible(!isMobile);
  }, [isMobile]);

  return {
    responsive,
    isMobile,
    hasTouchControls: responsive.isTouchShell,
    sidebarVisible,
    setSidebarVisible,
    showSingleMobilePane: isMobile,
  };
}
