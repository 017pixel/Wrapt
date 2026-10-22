import { isAbsolute } from "node:path";
import { validateCwd } from "../../terminal/restore.js";
import { GatewayError } from "./errors.js";

export class CwdPolicy {
  constructor(private readonly roots: readonly string[], private readonly denied: readonly string[] = []) {}

  async validate(cwd: unknown): Promise<string> {
    if (typeof cwd !== "string" || !isAbsolute(cwd) || cwd.includes("\0")) {
      throw new GatewayError("PROJECT_FORBIDDEN", "Für diese Session ist kein erlaubtes Arbeitsverzeichnis bekannt.");
    }
    try {
      return await validateCwd(cwd, [...this.roots], [...this.denied]);
    } catch {
      throw new GatewayError("PROJECT_FORBIDDEN", "Das Arbeitsverzeichnis liegt außerhalb der erlaubten Projektpfade oder ist nicht verfügbar.");
    }
  }
}
