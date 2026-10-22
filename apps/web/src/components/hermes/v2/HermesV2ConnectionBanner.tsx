import type { ChatConnectionView } from "./chat-types";

const LABEL: Record<ChatConnectionView["state"], string> = {
  idle: "Nicht verbunden",
  connecting: "Verbindet…",
  online: "Verbunden",
  reconnecting: "Verbindung wird aufgebaut…",
  offline: "Nicht verbunden",
  incompatible: "Nicht kompatibel",
};

/** Ehrlicher Verbindungszustand; reconnect bleibt explizit als Aktion. */
export function HermesV2ConnectionBanner({
  connection,
  onReconnect,
}: {
  connection: ChatConnectionView;
  onReconnect: () => void;
}) {
  if (connection.state === "online") return null;
  const detail = connection.error?.message;
  return (
    <div
      className="hermesv2-connection"
      data-state={connection.state}
      role="status"
    >
      <p>
        {LABEL[connection.state]}
        {detail ? ` – ${detail}` : ""}
      </p>
      <button type="button" className="quiet-button" onClick={onReconnect}>
        Verbinden
      </button>
    </div>
  );
}
