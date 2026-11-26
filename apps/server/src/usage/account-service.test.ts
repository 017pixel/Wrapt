import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { AccountService } from "./account-service.js";
import { UsageDatabase } from "./database.js";
import { AppError } from "../utils/errors.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "account-service-"));
  directories.push(root);
  const database = new UsageDatabase(join(root, "usage.sqlite"));
  const profilesRoot = join(root, "profiles");
  const sharedHome = join(root, ".claude");
  const service = new AccountService({
    database,
    allowedRoots: [root],
    profilesRoot,
    codexbarConfigPath: join(root, "codexbar.json"),
    sharedHomes: {
      codex: { sharedHome: join(root, ".codex"), authFileName: "auth.json" },
      opencode: { sharedHome: join(root, ".opencode"), authFileName: "auth.json" },
      claude: { sharedHome, authFileName: ".credentials.json" },
    },
  });
  return { root, database, profilesRoot, sharedHome, service };
}

it("verweigert das Löschen des aktiven Accounts", async () => {
  const { database, profilesRoot, sharedHome, service } = await setup();
  const active = database.createAccount({ provider: "claude", label: "Aktiv", profilePath: join(profilesRoot, "claude", "aktiv"), source: "local" });
  await mkdir(active.profilePath, { recursive: true });
  await writeFile(join(active.profilePath, ".credentials.json"), "{}");
  await mkdir(sharedHome, { recursive: true });
  await symlink(join(active.profilePath, ".credentials.json"), join(sharedHome, ".credentials.json"));
  await expect(service.remove(active.id)).rejects.toMatchObject({ code: "ACCOUNT_ACTIVE", statusCode: 409 });
  expect(database.getAccount(active.id).id).toBe(active.id);
  database.close();
});

it("löscht einen inaktiven Account, ohne den aktiven Symlink zu verändern", async () => {
  const { database, profilesRoot, sharedHome, service } = await setup();
  const active = database.createAccount({ provider: "claude", label: "Aktiv", profilePath: join(profilesRoot, "claude", "aktiv"), source: "local" });
  const inactive = database.createAccount({ provider: "claude", label: "Inaktiv", profilePath: join(profilesRoot, "claude", "inaktiv"), source: "local" });
  await mkdir(active.profilePath, { recursive: true });
  await writeFile(join(active.profilePath, ".credentials.json"), "{}");
  await mkdir(sharedHome, { recursive: true });
  const link = join(sharedHome, ".credentials.json");
  await symlink(join(active.profilePath, ".credentials.json"), link);
  await service.remove(inactive.id);
  expect(() => database.getAccount(inactive.id)).toThrow();
  expect(await service.listWithState()).toMatchObject([{ id: active.id, active: true }]);
  database.close();
});

it("meldet einen fehlenden Account als 404", async () => {
  const { service, database } = await setup();
  await expect(service.remove("00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(AppError);
  database.close();
});
