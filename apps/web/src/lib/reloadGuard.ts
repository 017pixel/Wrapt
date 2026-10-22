const guards = new Set<() => boolean>();

/** Eigene Abfrage statt synthetischem beforeunload: dessen Listener können speichern. */
export function registerEditorReloadGuard(hasUnsavedChanges: () => boolean): () => void {
  guards.add(hasUnsavedChanges);
  return () => { guards.delete(hasUnsavedChanges); };
}

export function editorsHaveUnsavedChanges(): boolean {
  return [...guards].some((guard) => guard());
}
