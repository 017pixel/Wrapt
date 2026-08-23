import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { migrateLegacyConfigValue, WRAPT_EXAMPLE_CONFIG, WRAPT_LOCAL_CONFIG } from "./legacy-migration.js";

export function persistLocalConfig(
  configDirectory: string,
  update: (base: Record<string, unknown>) => Record<string, unknown>,
  validate: (value: unknown) => unknown,
): void {
  const localPath = join(configDirectory, WRAPT_LOCAL_CONFIG);
  let base: Record<string, unknown>;
  try {
    base = migrateLegacyConfigValue(
      JSON.parse(readFileSync(localPath, "utf8")) as Record<string, unknown>,
    ) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    base = JSON.parse(
      readFileSync(join(configDirectory, WRAPT_EXAMPLE_CONFIG), "utf8"),
    ) as Record<string, unknown>;
  }

  const next = update(base);
  validate(next);
  const temporaryPath = `${localPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporaryPath, localPath);
  chmodSync(localPath, 0o600);
}
