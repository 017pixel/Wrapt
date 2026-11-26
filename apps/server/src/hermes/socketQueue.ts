/**
 * Serialisiert asynchrone WebSocket-Nachrichten pro Socket. Die
 * WebSocket-Reihenfolge garantiert nur die Zustellung, nicht die Reihenfolge
 * der asynchronen Verarbeitung.
 */
export function createOrderedMessageHandler(handler: (raw: unknown) => Promise<void>): (raw: unknown) => void {
  let chain: Promise<void> = Promise.resolve();
  return (raw: unknown) => {
    chain = chain.then(() => handler(raw)).catch(() => undefined);
  };
}
