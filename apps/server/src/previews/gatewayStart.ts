/**
 * Startet die Slot-Listener einzeln. Ein belegter Port darf die übrigen
 * Listener nicht verhindern; der Fehler wird pro Slot gemeldet.
 */
export interface SlotListenerStartResult<T> {
  listeners: T[];
  unavailable: Array<{ slotId: number; error: string }>;
}

export async function startSlotListeners<T>(
  definitions: readonly { id: number }[],
  create: (definition: { id: number }) => Promise<T>,
  report: (definition: { id: number }, error: string) => void = () => undefined,
): Promise<SlotListenerStartResult<T>> {
  const results = await Promise.allSettled(definitions.map((definition) => create(definition)));
  const listeners: T[] = [];
  const unavailable: Array<{ slotId: number; error: string }> = [];
  results.forEach((result, index) => {
    const definition = definitions[index]!;
    if (result.status === "fulfilled") {
      listeners.push(result.value);
      return;
    }
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    unavailable.push({ slotId: definition.id, error: message });
    report(definition, message);
  });
  return { listeners, unavailable };
}
