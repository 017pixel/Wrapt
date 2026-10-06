import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { optimizeTuiLayout } from "./tui-performance.mjs";

// Der offizielle Hermes-Compiler baut eine temporäre Quellkopie. Weder dessen
// Git-Zustand noch die Dateien laufender TUI-Prozesse werden verändert.
export async function buildHermesTui({ checkout, out }) {
  checkout = resolve(checkout);
  out = resolve(out);
  const compiler = join(checkout, "scripts/build/tui.mjs");
  if (!existsSync(compiler)) throw new Error("Der offizielle Hermes-TUI-Compiler fehlt.");
  const temporary = await mkdtemp(join(tmpdir(), "wrapt-hermes-tui-"));
  const source = join(temporary, "source");
  try {
    await mkdir(source);
    for (const relative of [
      "ui-tui/src", "ui-tui/package.json", "ui-tui/tsconfig.json",
      "ui-tui/packages/hermes-ink", "apps/shared/src", "apps/shared/package.json",
      "apps/shared/tsconfig.json", "scripts/build", "package.json", "tsconfig.json",
      "package-lock.json", ".npmrc", "pm/lock.json",
    ]) {
      const input = join(checkout, relative);
      if (!existsSync(input)) continue;
      const target = join(source, relative);
      await mkdir(dirname(target), { recursive: true });
      await cp(input, target, {
        recursive: true,
        filter: (file) => !["node_modules", "dist", ".git"].includes(file.split("/").at(-1)),
      });
    }
    for (const relative of ["node_modules", "ui-tui/node_modules", "apps/shared/node_modules"]) {
      if (existsSync(join(checkout, relative))) {
        await mkdir(dirname(join(source, relative)), { recursive: true });
        await symlink(join(checkout, relative), join(source, relative), "dir");
      }
    }
    const layoutPath = join(source, "ui-tui/src/components/appLayout.tsx");
    const layout = await readFile(layoutPath, "utf8");
    const optimization = optimizeTuiLayout(layout);
    await writeFile(layoutPath, optimization.source);
    const { buildTui } = await import(pathToFileURL(compiler).href);
    const result = await buildTui({ source, out });
    await writeFile(join(out, "wrapt-performance.json"), JSON.stringify({
      schema: 1, transcriptMemo: optimization.applied,
    }) + "\n");
    return { ...result, optimized: optimization.applied };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
