import { constants } from "node:fs";
import { copyFile, link, unlink } from "node:fs/promises";
import { AppError } from "../utils/errors.js";
import { filesystemFailure } from "./fileSystemHelpers.js";

/**
 * Veröffentlicht eine temporäre Datei atomar, ohne ein inzwischen entstandenes
 * Ziel zu überschreiben. Hardlink + Unlink ersetzt das prüfende Rename; auf
 * Dateisystemen ohne Hardlinks wird exklusiv kopiert.
 */
export async function publishFileNoReplace(temporary: string, target: string): Promise<void> {
  try {
    await link(temporary, target);
    await unlink(temporary).catch(() => undefined);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") throw new AppError(409, "FILE_EXISTS", "Ein Eintrag mit diesem Namen existiert bereits.");
    if (code !== "EPERM" && code !== "EOPNOTSUPP" && code !== "ENOSYS" && code !== "EXDEV") filesystemFailure(error);
  }
  try {
    await copyFile(temporary, target, constants.COPYFILE_EXCL);
  } catch (error) {
    filesystemFailure(error);
  }
  await unlink(temporary).catch(() => undefined);
}
