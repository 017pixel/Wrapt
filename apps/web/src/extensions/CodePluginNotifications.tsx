import { useEffect, useState } from "react";

export function CodePluginNotifications() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const receive = (event: Event) => setMessage(String((event as CustomEvent).detail));
    window.addEventListener("wrapt:plugin-notification", receive);
    return () => window.removeEventListener("wrapt:plugin-notification", receive);
  }, []);
  return message ? <div className="connection-banner" role="status"><span>{message}</span><button type="button" className="quiet-button" onClick={() => setMessage("")}>Schließen</button></div> : null;
}
