import { useCallback, useEffect, useState } from "react";
import { clampSidebarWidth, parseSidebarLayout, type SidebarLayoutState } from "./sidebarSizing";

const SIDEBAR_LAYOUT_STORAGE_KEY = "wrapt.sidebar.v1";

function readLayout(): SidebarLayoutState {
  try {
    return parseSidebarLayout(localStorage.getItem(SIDEBAR_LAYOUT_STORAGE_KEY));
  } catch {
    // Private Modes verbieten teilweise schon das Lesen.
    return parseSidebarLayout(null);
  }
}

export function useSidebarLayout() {
  const [layout, setLayout] = useState<SidebarLayoutState>(readLayout);

  useEffect(() => {
    const save = window.setTimeout(() => {
      localStorage.setItem(SIDEBAR_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    }, 180);
    // Wird der Tab während des Debounce-Fensters geschlossen (z. B. direkt nach
    // dem Ziehen), sichert pagehide den letzten Stand synchron (F04-10).
    const flush = () => {
      window.clearTimeout(save);
      localStorage.setItem(SIDEBAR_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(save);
      window.removeEventListener("pagehide", flush);
    };
  }, [layout]);

  const applyLayout = useCallback((next: SidebarLayoutState) => {
    setLayout((current) => {
      const width = clampSidebarWidth(next.width);
      if (current.collapsed === next.collapsed && current.width === width) return current;
      return { collapsed: next.collapsed, width };
    });
  }, []);

  return { ...layout, applyLayout };
}
