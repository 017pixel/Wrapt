import WebSocket from "ws";

export const DEFAULT_PENDING_MESSAGE_LIMIT = 512 * 1024;
export const DEFAULT_BUFFERED_BYTES_LIMIT = 2 * 1024 * 1024;

export type WebSocketBridgeEvent =
  | { type: "forwarded"; direction: "source-to-target" | "target-to-source"; bytes: number }
  | { type: "overload"; reason: string }
  | { type: "close"; direction: "source" | "target"; code: number };

export interface WebSocketBridgeObserver {
  onEvent: (event: WebSocketBridgeEvent) => void;
}

export function rawDataBytes(data: WebSocket.RawData): number {
  if (Array.isArray(data)) return data.reduce((total, chunk) => total + chunk.byteLength, 0);
  return data.byteLength;
}

function mappedCloseCode(code: number): number {
  return code === 1005 || code === 1006 ? 1011 : code;
}

export function bridgeWebSockets(
  source: WebSocket,
  target: WebSocket,
  options: {
    pendingLimit?: number;
    bufferedLimit?: number;
    label: string;
    observer?: WebSocketBridgeObserver;
  },
): void {
  const pendingLimit = options.pendingLimit ?? DEFAULT_PENDING_MESSAGE_LIMIT;
  const bufferedLimit = options.bufferedLimit ?? DEFAULT_BUFFERED_BYTES_LIMIT;
  const pending: Array<{ data: WebSocket.RawData; binary: boolean }> = [];
  let pendingBytes = 0;
  let overloaded = false;

  const overload = (reason: string) => {
    if (overloaded) return;
    overloaded = true;
    options.observer?.onEvent({ type: "overload", reason });
    if (source.readyState === WebSocket.OPEN || source.readyState === WebSocket.CONNECTING) {
      source.close(1013, reason);
    }
    if (target.readyState !== WebSocket.CLOSED) target.terminate();
  };

  const sendBounded = (
    receiver: WebSocket,
    data: WebSocket.RawData,
    binary: boolean,
    direction: "source-to-target" | "target-to-source",
  ): boolean => {
    const bytes = rawDataBytes(data);
    if (receiver.readyState !== WebSocket.OPEN) return false;
    if (receiver.bufferedAmount + bytes > bufferedLimit) {
      overload(`${options.label}-WebSocket-Puffer überschritten`);
      return false;
    }
    try {
      receiver.send(data, { binary });
      options.observer?.onEvent({ type: "forwarded", direction, bytes });
      return true;
    } catch {
      overload(`${options.label}-WebSocket ist nicht erreichbar`);
      return false;
    }
  };

  source.on("message", (data, binary) => {
    if (overloaded) return;
    if (target.readyState === WebSocket.OPEN) {
      sendBounded(target, data, binary, "source-to-target");
      return;
    }
    if (target.readyState !== WebSocket.CONNECTING) return;
    pendingBytes += rawDataBytes(data);
    if (pendingBytes > pendingLimit) {
      overload(`${options.label}-WebSocket-Puffer überschritten`);
      return;
    }
    pending.push({ data, binary });
  });

  target.on("open", () => {
    for (const message of pending.splice(0)) {
      if (!sendBounded(target, message.data, message.binary, "source-to-target")) break;
    }
    pendingBytes = 0;
  });
  target.on("message", (data, binary) => {
    if (!overloaded) sendBounded(source, data, binary, "target-to-source");
  });
  source.on("close", (code, reason) => {
    options.observer?.onEvent({ type: "close", direction: "source", code });
    if (target.readyState === WebSocket.OPEN) target.close(mappedCloseCode(code), reason);
    else if (target.readyState !== WebSocket.CLOSED) target.terminate();
  });
  target.on("close", (code, reason) => {
    options.observer?.onEvent({ type: "close", direction: "target", code });
    if (source.readyState === WebSocket.OPEN) source.close(mappedCloseCode(code), reason);
  });
  source.on("error", () => target.terminate());
  target.on("error", () => {
    if (source.readyState === WebSocket.OPEN) source.close(1011, `${options.label} ist nicht erreichbar`);
  });
}
