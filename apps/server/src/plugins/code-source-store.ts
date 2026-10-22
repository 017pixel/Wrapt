import { randomUUID, createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { extensionIdSchema, localPluginDefinitionSchema, localPluginSourceSchema, localPluginStateSchema, localPluginWriteSchema, type LocalPluginSource, type LocalPluginState } from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";
import { z } from "zod";

interface SourceMetadata extends LocalPluginState {
  registrationId: string;
  sourceDigest: string;
}

const sourceMetadataSchema = localPluginStateSchema.extend({ registrationId: z.uuid(), sourceDigest: z.string().regex(/^[a-f0-9]{64}$/) });

function publicState(state: SourceMetadata): LocalPluginState {
  return localPluginStateSchema.parse({ id: state.id, name: state.name, sourceDirectory: state.sourceDirectory, sourceRevision: state.sourceRevision, builtRevision: state.builtRevision, trusted: state.trusted, development: state.development, diagnostics: state.diagnostics });
}

export function writePluginJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flush: true });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}

function sourceFiles(directory: string): LocalPluginSource["files"] {
  const files: LocalPluginSource["files"] = [];
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "plugin.json") continue;
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new AppError(400, "VALIDATION_ERROR", "Plugin-Quellen dürfen keine Symlinks enthalten.");
      if (entry.isDirectory()) { walk(path, `${prefix}${entry.name}/`); continue; }
      if (!entry.isFile() || !/\.(?:[cm]?js|jsx|tsx?|json|css|md)$/.test(entry.name)) continue;
      const stats = lstatSync(path);
      if (stats.size > 200_000 || files.length >= 128) throw new AppError(413, "VALIDATION_ERROR", "Die Plugin-Quellen überschreiten das Dateilimit.");
      files.push({ path: `${prefix}${entry.name}`, content: readFileSync(path, "utf8") });
    }
  };
  walk(directory, "");
  return files;
}

function sourceDigest(source: Pick<LocalPluginSource, "definition" | "files">): string {
  return createHash("sha256").update(JSON.stringify({ definition: source.definition, files: [...source.files].sort((a, b) => a.path.localeCompare(b.path)) })).digest("hex");
}

/** Ein persönlicher Quellbestand; Aktivierung bleibt beim Extension-Manager. */
export class PluginCodeSourceStore {
  constructor(readonly root: string) { mkdirSync(root, { recursive: true, mode: 0o700 }); }

  list(): LocalPluginState[] {
    return readdirSync(this.root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .flatMap((entry) => {
        try { return [publicState(this.metadata(entry.name))]; }
        catch { return []; }
      }).sort((a, b) => a.id.localeCompare(b.id));
  }

  metadata(id: string): SourceMetadata {
    const path = join(this.pluginDirectory(id), "state.json");
    if (!existsSync(path)) throw new AppError(404, "not-found", "Das persönliche Code-Plugin wurde nicht gefunden.");
    return sourceMetadataSchema.parse(JSON.parse(readFileSync(path, "utf8")) as unknown);
  }

  source(id: string): LocalPluginSource {
    const state = this.metadata(id);
    const directory = realpathSync(state.sourceDirectory);
    if (directory !== state.sourceDirectory) throw new AppError(409, "integrity-mismatch", "Der registrierte Plugin-Pfad wurde verändert.");
    const definitionPath = join(directory, "plugin.json");
    if (lstatSync(definitionPath).isSymbolicLink()) throw new AppError(400, "VALIDATION_ERROR", "Das Plugin-Manifest darf kein Symlink sein.");
    const definition = localPluginDefinitionSchema.parse(JSON.parse(readFileSync(definitionPath, "utf8")) as unknown);
    if (definition.id !== id) throw new AppError(409, "operation-conflict", "Die Plugin-ID darf nicht nachträglich geändert werden.");
    const content = { definition, files: sourceFiles(directory) };
    const digest = sourceDigest(content);
    const revision = state.sourceDigest === digest ? state.sourceRevision : state.sourceRevision + 1;
    if (revision !== state.sourceRevision) this.updateState(id, { sourceRevision: revision, sourceDigest: digest, name: definition.name });
    return localPluginSourceSchema.parse({ ...content, revision });
  }

  create(input: unknown): LocalPluginState {
    const parsed = localPluginWriteSchema.parse(input);
    const id = parsed.definition.id;
    if (parsed.expectedRevision !== 0) throw new AppError(409, "operation-conflict", "Neue Plugins beginnen mit Revision 0.");
    const root = this.pluginDirectory(id);
    if (existsSync(root)) throw new AppError(409, "operation-conflict", "Diese persönliche Plugin-ID existiert bereits.");
    const source = localPluginSourceSchema.parse({ definition: parsed.definition, files: parsed.files, revision: 1 });
    const sourceDirectory = join(root, "source");
    try {
      mkdirSync(sourceDirectory, { recursive: true, mode: 0o700 });
      this.writeFiles(sourceDirectory, source);
      const state: SourceMetadata = {
        id, name: source.definition.name, sourceDirectory, sourceRevision: 1, sourceDigest: sourceDigest({ definition: source.definition, files: source.files }),
        builtRevision: null, trusted: false, development: false, diagnostics: [], registrationId: randomUUID(),
      };
      writePluginJson(join(root, "state.json"), state);
      return publicState(state);
    } catch (error) { rmSync(root, { recursive: true, force: true }); throw error; }
  }

  register(directory: string): LocalPluginState {
    const canonical = realpathSync(resolve(directory));
    if (!lstatSync(canonical).isDirectory()) throw new AppError(400, "VALIDATION_ERROR", "Ein lokaler Plugin-Ordner wird erwartet.");
    const definition = localPluginDefinitionSchema.parse(JSON.parse(readFileSync(join(canonical, "plugin.json"), "utf8")) as unknown);
    const source = localPluginSourceSchema.parse({ definition, files: sourceFiles(canonical), revision: 1 });
    if (existsSync(this.pluginDirectory(definition.id))) throw new AppError(409, "operation-conflict", "Dieses Plugin ist bereits registriert.");
    const state: SourceMetadata = {
      id: definition.id, name: definition.name, sourceDirectory: canonical, sourceRevision: 1, sourceDigest: sourceDigest({ definition, files: source.files }),
      builtRevision: null, trusted: false, development: false, diagnostics: [], registrationId: randomUUID(),
    };
    writePluginJson(join(this.pluginDirectory(definition.id), "state.json"), state);
    return publicState(state);
  }

  update(id: string, input: unknown): LocalPluginState {
    const parsed = localPluginWriteSchema.parse(input);
    const current = this.source(id);
    if (parsed.expectedRevision !== current.revision) throw new AppError(409, "operation-conflict", "Die Quellen wurden inzwischen verändert. Lade die aktuelle Revision.");
    if (parsed.definition.id !== id) throw new AppError(400, "VALIDATION_ERROR", "Die Plugin-ID muss erhalten bleiben.");
    const source = localPluginSourceSchema.parse({ definition: parsed.definition, files: parsed.files, revision: current.revision + 1 });
    const state = this.metadata(id);
    // Registrierte Entwicklerordner werden nie durch einen API-Vollwrite ersetzt.
    if (state.sourceDirectory !== join(this.pluginDirectory(id), "source")) throw new AppError(409, "operation-conflict", "Bearbeite registrierte Entwicklerordner direkt mit deinem Editor.");
    const staged = join(this.pluginDirectory(id), `source-${randomUUID()}`);
    const backup = join(this.pluginDirectory(id), `previous-${randomUUID()}`);
    try {
      mkdirSync(staged, { recursive: true, mode: 0o700 });
      this.writeFiles(staged, source);
      renameSync(state.sourceDirectory, backup);
      try { renameSync(staged, state.sourceDirectory); }
      catch (error) { renameSync(backup, state.sourceDirectory); throw error; }
      this.updateState(id, { name: source.definition.name, sourceRevision: source.revision, sourceDigest: sourceDigest({ definition: source.definition, files: source.files }), diagnostics: [] });
      return publicState(this.metadata(id));
    } finally { rmSync(staged, { recursive: true, force: true }); rmSync(backup, { recursive: true, force: true }); }
  }

  updateState(id: string, changes: Partial<SourceMetadata>): SourceMetadata {
    const next = sourceMetadataSchema.parse({ ...this.metadata(id), ...changes, id });
    writePluginJson(join(this.pluginDirectory(id), "state.json"), next);
    return next;
  }

  pluginDirectory(id: string): string { return join(this.root, extensionIdSchema.parse(id)); }

  private writeFiles(directory: string, source: LocalPluginSource): void {
    writePluginJson(join(directory, "plugin.json"), source.definition);
    for (const file of source.files) {
      if (file.path === "plugin.json") throw new AppError(400, "VALIDATION_ERROR", "plugin.json wird aus der Plugin-Definition erzeugt.");
      const path = resolve(directory, file.path);
      if (!path.startsWith(`${directory}${sep}`)) throw new AppError(400, "VALIDATION_ERROR", "Der Dateipfad verlässt das Plugin.");
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, file.content, { mode: 0o600 });
    }
  }
}
