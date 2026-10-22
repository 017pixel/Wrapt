// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { editorsHaveUnsavedChanges, registerEditorReloadGuard } from "./reloadGuard";

it("prüft ungespeicherte Editoren ohne Speicher- oder Unload-Effekte auszulösen", () => {
  const unload = vi.fn();
  window.addEventListener("beforeunload", unload);
  const unregister = registerEditorReloadGuard(() => true);
  try {
    expect(editorsHaveUnsavedChanges()).toBe(true);
    expect(unload).not.toHaveBeenCalled();
    unregister();
    expect(editorsHaveUnsavedChanges()).toBe(false);
  } finally { unregister(); window.removeEventListener("beforeunload", unload); }
});
