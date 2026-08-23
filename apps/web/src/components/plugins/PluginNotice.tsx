import type { ReactNode } from "react";
import { CloseIcon } from "../icons";

interface PluginNoticeProps {
  children: ReactNode;
  onClose: () => void;
  tone?: "info" | "bad";
}

export function PluginNotice({ children, onClose, tone = "info" }: PluginNoticeProps) {
  return <div className={`plugins-message ${tone === "bad" ? "is-bad" : ""}`} role={tone === "bad" ? "alert" : "status"}>
    <div className="plugins-message-content">{children}</div>
    <button type="button" className="icon-button plugins-message-close" onClick={onClose} aria-label="Hinweis schließen">
      <CloseIcon className="h-3.5 w-3.5" />
    </button>
  </div>;
}
