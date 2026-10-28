import { HermesV2Toast } from "./HermesV2Toast";
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
  active = true,
  onReconnect,
}: {
  active?: boolean;
  connection: ChatConnectionView;
  onReconnect: () => void;
}) {
  if (!active || !["offline", "incompatible", "reconnecting"].includes(connection.state)) return null;
  const detail = connection.error?.message;
  const message = `${LABEL[connection.state]}${detail ? `: ${detail}` : ""}`;
  return <HermesV2Toast key={message} message={message}>
    <button type="button" className="quiet-button" onClick={onReconnect}>Verbinden</button>
  </HermesV2Toast>;
}
