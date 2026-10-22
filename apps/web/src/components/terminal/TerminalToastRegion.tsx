import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "../icons";
import { useTerminalNotices, type TerminalNotice } from "./terminalNotifications";
import "./terminal-notifications.css";

function TerminalToast({ notice }: { notice: TerminalNotice }) {
  const dismiss = useTerminalNotices((state) => state.dismiss);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(notice.id), notice.tone === "error" ? 10_000 : 6_000);
    return () => window.clearTimeout(timer);
  }, [dismiss, notice]);
  return <div className={`terminal-toast is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
    <span>{notice.message}</span>
    {notice.action ? <button type="button" className="terminal-toast-action" onClick={() => { dismiss(notice.id); notice.action?.run(); }}>{notice.action.label}</button> : null}
    <button type="button" className="terminal-toast-close" aria-label="Terminalhinweis schließen" onClick={() => dismiss(notice.id)}><CloseIcon className="h-4 w-4" /></button>
  </div>;
}

/** Portal liegt auch außerhalb gezoomter Orbit-Flächen oben rechts. */
export function TerminalToastRegion() {
  const notices = useTerminalNotices((state) => state.notices);
  return createPortal(<aside className="terminal-toasts" aria-label="Terminalhinweise">{notices.map((notice) => <TerminalToast key={notice.id} notice={notice} />)}</aside>, document.body);
}
