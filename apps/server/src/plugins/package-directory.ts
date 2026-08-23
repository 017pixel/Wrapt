import { mkdir, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Baut ein Paket vollständig neben dem Ziel und tauscht es anschließend mit Rollback aus. */
export async function replacePackageDirectory(
  targetDirectory: string,
  populate: (stagingDirectory: string) => Promise<void>,
): Promise<void> {
  const token = randomUUID();
  const stagingDirectory = `${targetDirectory}.tmp-${token}`;
  const backupDirectory = `${targetDirectory}.previous-${token}`;
  let previousMoved = false;

  await mkdir(stagingDirectory, { recursive: true, mode: 0o700 });
  try {
    await populate(stagingDirectory);
    try {
      await rename(targetDirectory, backupDirectory);
      previousMoved = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    try {
      await rename(stagingDirectory, targetDirectory);
    } catch (error) {
      if (previousMoved) await rename(backupDirectory, targetDirectory);
      throw error;
    }
    if (previousMoved) await rm(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}
