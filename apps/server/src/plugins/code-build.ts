import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { extensionManifestV1Schema, type LocalPluginSource, type PluginDiagnostic, type ExtensionManifestV1 } from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";

export interface PluginBuildOptions {
  repositoryRoot: string;
  outputDirectory: string;
  sourceDirectory: string;
}

export interface PluginBuildResult {
  manifest: ExtensionManifestV1;
  directory: string;
  diagnostics: PluginDiagnostic[];
}

function outputPath(path: string): string { return path.endsWith(".json") ? `${path}.js` : path.replace(/\.(?:tsx?|jsx?|mjs|cjs)$/, ".js"); }

function importTransformer(rewrite: (value: string) => string): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = rewrite(node.moduleSpecifier.text);
        return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, ts.factory.createStringLiteral(specifier), specifier.endsWith(".json.js") ? undefined : node.attributes);
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        return ts.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, ts.factory.createStringLiteral(rewrite(node.moduleSpecifier.text)), node.attributes);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [ts.factory.createStringLiteral(rewrite(node.arguments[0].text)), ...node.arguments.slice(1)]);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (file) => ts.visitNode(file, visit) as ts.SourceFile;
  };
}

function resolveLocalSource(from: string, value: string, files: Set<string>): string {
  const absolute = resolve("/", dirname(from), value);
  const path = absolute.slice(1);
  const candidates = [path, path.replace(/\.js$/, ".ts"), path.replace(/\.js$/, ".tsx"), `${path}.ts`, `${path}.tsx`, `${path}.js`, `${path}/index.ts`, `${path}/index.tsx`];
  const found = candidates.find((candidate) => files.has(candidate));
  if (!found) throw new AppError(422, "VALIDATION_ERROR", `Import ${value} in ${from} wurde nicht in den Plugin-Quellen gefunden.`);
  return found;
}

function resolveLocalImport(from: string, value: string, files: Set<string>): string {
  const found = resolveLocalSource(from, value, files);
  const result = relative(dirname(outputPath(from)), outputPath(found)).split("\\").join("/");
  return result.startsWith(".") ? result : `./${result}`;
}

function checkSource(source: LocalPluginSource, options: PluginBuildOptions): PluginDiagnostic[] {
  const sdk = join(options.repositoryRoot, "packages/plugin-sdk/src");
  const reactTypes = join(options.repositoryRoot, "apps/web/node_modules/@types/react");
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true, allowJs: true,
    jsx: ts.JsxEmit.React, allowUmdGlobalAccess: true, esModuleInterop: true, resolveJsonModule: true,
    typeRoots: [join(options.repositoryRoot, "apps/server/node_modules/@types"), join(options.repositoryRoot, "apps/web/node_modules/@types")],
    types: ["node", "react"],
    paths: { "@wrapt/plugin-sdk": [join(sdk, "index.ts")], "@wrapt/plugin-sdk/client": [join(sdk, "client.ts")], react: [join(reactTypes, "index.d.ts")] },
  };
  const roots = source.files.filter((file) => /\.(?:tsx?|jsx?|mjs)$/.test(file.path)).map((file) => join(options.sourceDirectory, file.path));
  const program = ts.createProgram(roots, compilerOptions);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
    file: diagnostic.file ? relative(options.sourceDirectory, diagnostic.file.fileName) : "plugin.json",
    ...(diagnostic.file && diagnostic.start !== undefined ? { line: diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 } : {}),
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    severity: diagnostic.category === ts.DiagnosticCategory.Warning ? "warning" as const : "error" as const,
  }));
}

/** Verwendet den mitgelieferten TypeScript-Compiler, ohne Plugin-Paketinstallation. */
export function buildPluginSource(source: LocalPluginSource, options: PluginBuildOptions): PluginBuildResult {
  const diagnostics = checkSource(source, options);
  const spec = source.definition;
  const publisher = spec.id.split(".")[0]!;
  const manifest = extensionManifestV1Schema.parse({
    manifestVersion: 1, id: spec.id, name: spec.name, description: spec.description, version: spec.version,
    publisher, license: "UNLICENSED", trust: "developer", engines: { wrapt: ">=2.18.0", extensionApi: ">=1.0.0" },
    entrypoints: {
      ...(spec.server ? { server: `./server/${outputPath(spec.server)}` } : {}),
      ...(spec.ui ? { ui: `./client/${outputPath(spec.ui)}` } : {}),
    },
    permissions: [], activationEvents: [], contributes: {}, extensionDependencies: spec.dependencies,
  });
  if (diagnostics.some((item) => item.severity === "error")) return { manifest, directory: options.outputDirectory, diagnostics };
  const staged = `${options.outputDirectory}.stage-${randomUUID()}`;
  const previous = `${options.outputDirectory}.previous-${randomUUID()}`;
  const files = new Set(source.files.map((file) => file.path));
  const serverSdk = pathToFileURL(join(options.repositoryRoot, "packages/plugin-sdk/dist/index.js")).href;
  try {
    for (const target of ["server", "client"] as const) {
      const entrypoint = target === "server" ? spec.server : spec.ui;
      if (!entrypoint) continue;
      const reachable = new Set<string>();
      const visit = (path: string): void => {
        if (reachable.has(path)) return;
        reachable.add(path);
        const file = source.files.find((candidate) => candidate.path === path)!;
        for (const imported of ts.preProcessFile(file.content).importedFiles) {
          if (imported.fileName.startsWith(".")) visit(resolveLocalSource(path, imported.fileName, files));
        }
      };
      visit(entrypoint);
      for (const file of source.files) {
        if (!reachable.has(file.path)) continue;
        if (!/\.(?:tsx?|jsx?|mjs|cjs|json)$/.test(file.path) || file.path.endsWith(".d.ts")) continue;
        const path = join(staged, target, outputPath(file.path));
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        if (file.path.endsWith(".json")) {
          JSON.parse(file.content);
          writeFileSync(path, `export default JSON.parse(${JSON.stringify(file.content)});\n`, { mode: 0o600 });
          continue;
        }
        const rewrite = (value: string): string => {
          if (value.startsWith(".")) return resolveLocalImport(file.path, value, files);
          if (value === "@wrapt/plugin-sdk") return target === "server" ? serverSdk : "/api/v1/plugins/sdk/client.js";
          if (value === "@wrapt/plugin-sdk/client") return "/api/v1/plugins/sdk/client.js";
          if (target === "server") {
            if (value.startsWith("node:")) return value;
            throw new AppError(422, "VALIDATION_ERROR", `Nicht verfügbarer Plugin-Import ${value}. Verwende SDK, lokale Module oder node:-Module.`);
          }
          if (value === "react") return "/api/v1/plugins/sdk/react.js";
          throw new AppError(422, "VALIDATION_ERROR", `Nicht verfügbarer Browser-Import ${value}.`);
        };
        // JSX und Hooks verwenden dieselbe React-Instanz wie der Host.
        const content = /\.(?:tsx|jsx)$/.test(file.path) ? `import * as __wraptPluginReact from "react";\n${file.content}` : file.content;
        const output = ts.transpileModule(content, {
          fileName: file.path,
          compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: "__wraptPluginReact.createElement", jsxFragmentFactory: "__wraptPluginReact.Fragment", sourceMap: false },
          transformers: { before: [importTransformer(rewrite)] },
        });
        writeFileSync(path, output.outputText, { mode: 0o600 });
      }
    }
    writeFileSync(join(staged, "extension.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    writeFileSync(join(staged, "package.json"), '{"type":"module"}\n', { mode: 0o600 });
    writeFileSync(join(staged, "plugin-code.json"), JSON.stringify({ formatVersion: 3, sourceRevision: source.revision, definition: spec }), { mode: 0o600 });
    if (existsSync(options.outputDirectory)) renameSync(options.outputDirectory, previous);
    try { renameSync(staged, options.outputDirectory); }
    catch (error) { if (existsSync(previous)) renameSync(previous, options.outputDirectory); throw error; }
    return { manifest, directory: options.outputDirectory, diagnostics };
  } finally { rmSync(staged, { recursive: true, force: true }); rmSync(previous, { recursive: true, force: true }); }
}
