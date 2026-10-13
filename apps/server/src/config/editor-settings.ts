import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { absoluteFilesystemPathSchema } from "@wrapt/contracts";
import { boundedIntegerFromEnvironment } from "./settings-helpers.js";

export const editorSettingsShape = {
  CODE_SERVER_PORT: boundedIntegerFromEnvironment(8080, 1, 65_535),
  CODE_SERVER_LEGACY_PORT: boundedIntegerFromEnvironment(8080, 1, 65_535),
  // VS Code serve-web betreibt /editor selbst. code-server erhält den Pfad ohne Präfix.
  EDITOR_BACKEND: z.enum(["code-server", "vscode"]).default("code-server"),
  VSCODE_WEB_DATA_DIR: absoluteFilesystemPathSchema.default(join(homedir(), ".local/share/wrapt/vscode-web/data")),
  EDITOR_HTML_MAX_BYTES: boundedIntegerFromEnvironment(2_097_152, 16_384, 16_777_216),
};

export function resolveEditorSettings(environment: {
  CODE_SERVER_PORT: number;
  CODE_SERVER_LEGACY_PORT: number;
  EDITOR_BACKEND: "code-server" | "vscode";
  VSCODE_WEB_DATA_DIR: string;
  EDITOR_HTML_MAX_BYTES: number;
}) {
  return {
    codeServerPort: environment.CODE_SERVER_PORT,
    codeServerLegacyPort: environment.CODE_SERVER_LEGACY_PORT,
    editorBackend: environment.EDITOR_BACKEND,
    vscodeWebDataDirectory: environment.VSCODE_WEB_DATA_DIR,
    editorHtmlMaxBytes: environment.EDITOR_HTML_MAX_BYTES,
  };
}
