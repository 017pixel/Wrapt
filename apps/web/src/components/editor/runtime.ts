import { create } from "zustand";

interface EditorRuntimeState {
  ready: Record<string, boolean>;
  files: Record<string, string>;
  folders: Record<string, string>;
  setReady(folder: string, ready: boolean): void;
  rememberFile(folder: string, file: string): void;
  rememberFolder(projectId: string, folder: string): void;
  disconnected(): void;
}

/** Sitzungszustand, bewusst ohne localStorage und ohne Dateiinhalte. */
export const useEditorRuntime = create<EditorRuntimeState>((set) => ({
  ready: {}, files: {}, folders: {},
  setReady: (folder, ready) => set((state) => ({ ready: { ...state.ready, [folder]: ready } })),
  rememberFile: (folder, file) => set((state) => ({ files: { ...state.files, [folder]: file } })),
  rememberFolder: (projectId, folder) => set((state) => state.folders[projectId] === folder ? state : ({ folders: { ...state.folders, [projectId]: folder } })),
  disconnected: () => set({ ready: {} }),
}));

export function requestEditor(folder: string | null) {
  window.dispatchEvent(new CustomEvent("wrapt:editor-navigate", { detail: { folder } }));
}

export function editorStartupUrl(source: string, folder: string): string {
  const file = useEditorRuntime.getState().files[folder];
  if (!file) return source;
  const url = new URL(source, window.location.origin);
  const resource = new URL(`vscode-remote://${url.host}`);
  resource.pathname = file;
  url.searchParams.set("payload", JSON.stringify([["openFile", resource.href]]));
  return `${url.pathname}${url.search}`;
}
