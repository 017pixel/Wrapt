import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

interface PluginPackageOwner {
  readonly id: string;
  readonly slug: string;
}

/** Entfernt ein lokales Paket nur, wenn es noch zum angefragten Draft gehört. */
export async function removeOwnedPluginPackage(
  publishedDirectory: string,
  owner: PluginPackageOwner,
): Promise<boolean> {
  const packageDirectory = join(publishedDirectory, owner.slug);
  try {
    const stored = JSON.parse(await readFile(join(packageDirectory, "plugin.json"), "utf8")) as {
      id?: unknown;
    };
    if (typeof stored.id === "string" && stored.id !== owner.id) return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    // Beschädigte lokale Pakete dürfen für denselben Slug bereinigt werden.
  }
  await rm(packageDirectory, { recursive: true, force: true });
  return true;
}
