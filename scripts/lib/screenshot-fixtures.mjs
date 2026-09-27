// Legt die reinen Dummy-Fixtures der Screenshot-Instanz an: drei kleine
// Beispielprojekte (inklusive lokaler Git-Historie), die Projektliste, den
// Extension-Katalog und erfundene Anmeldedateien für die Dummy-Accounts.
import { execFileSync } from "node:child_process";
import { access, cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Dummy-JWT ohne echte Signatur; dient nur dem Auslesen der Kontoidentität. */
function fakeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

function codexAuthFile({ email, accountId, plan }) {
  return `${JSON.stringify({
    tokens: { id_token: fakeJwt({ email, "https://api.openai.com/auth": { chatgpt_plan_type: plan } }), account_id: accountId },
    last_refresh: new Date().toISOString(),
  }, null, 2)}\n`;
}

async function writeProjectFiles(projectsRoot) {
  await mkdir(join(projectsRoot, "nordlicht", "src"), { recursive: true });
  await mkdir(join(projectsRoot, "feldnotiz", "src"), { recursive: true });
  await mkdir(join(projectsRoot, "sandkasten"), { recursive: true });

  await writeFile(join(projectsRoot, "nordlicht", "README.md"), [
    "# Nordlicht",
    "",
    "Kundenportal für kleine Energiegenossenschaften. Beispielprojekt der",
    "Wrapt-Demo, enthält ausschließlich erfundene Daten.",
    "",
    "## Entwicklung",
    "",
    "```bash",
    "npm run dev",
    "```",
    "",
    "Der Devserver läuft auf Port 3440 und liefert eine statische Vorschau.",
    "",
  ].join("\n"));
  await writeFile(join(projectsRoot, "nordlicht", "package.json"), `${JSON.stringify({
    name: "nordlicht",
    version: "0.4.0",
    private: true,
    type: "module",
    scripts: { dev: `node server.mjs` },
  }, null, 2)}\n`);
  await writeFile(join(projectsRoot, "nordlicht", "server.mjs"), [
    "import { createServer } from \"node:http\";",
    "",
    "const port = Number(process.env.PORT ?? 3440);",
    "const page = `<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\">",
    "<title>Nordlicht</title></head><body style=\"font-family:sans-serif;background:#0a0a0a;color:#f5f5f5;padding:48px\">",
    "<h1>Nordlicht Kundenportal</h1><p>Lokale Vorschau für die Wrapt-Demo.</p></body></html>`;",
    "",
    "createServer((_request, response) => {",
    "  response.writeHead(200, { \"content-type\": \"text/html; charset=utf-8\" });",
    "  response.end(page);",
    "}).listen(port, \"127.0.0.1\", () => console.log(`Nordlicht-Vorschau läuft auf http://127.0.0.1:${port}`));",
    "",
  ].join("\n"));
  await writeFile(join(projectsRoot, "nordlicht", "src", "app.js"), [
    "export function verbrauchProQuartal(werte) {",
    "  return werte.reduce((summe, wert) => summe + wert, 0) / werte.length;",
    "}",
    "",
  ].join("\n"));
  await writeFile(join(projectsRoot, "nordlicht", ".gitignore"), "node_modules/\n");

  await writeFile(join(projectsRoot, "feldnotiz", "README.md"), [
    "# Feldnotiz",
    "",
    "Kleine Notiz-API für Außentermine. Beispielprojekt der Wrapt-Demo.",
    "",
  ].join("\n"));
  await writeFile(join(projectsRoot, "feldnotiz", "package.json"), `${JSON.stringify({
    name: "feldnotiz",
    version: "0.2.1",
    private: true,
    type: "module",
    scripts: { start: "node src/index.js" },
  }, null, 2)}\n`);
  await writeFile(join(projectsRoot, "feldnotiz", "src", "index.js"), [
    "export const notizen = [",
    "  { id: 1, titel: \"Zählerstand Hof 12\", ort: \"nordlicht\" },",
    "  { id: 2, titel: \"Rückruf Technik\", ort: \"feldnotiz\" },",
    "];",
    "",
  ].join("\n"));

  await writeFile(join(projectsRoot, "sandkasten", "README.md"), [
    "# Sandkasten",
    "",
    "Ort für Experimente und Prototypen. Beispielprojekt der Wrapt-Demo.",
    "",
  ].join("\n"));
  await writeFile(join(projectsRoot, "sandkasten", "playground.md"), [
    "## Offene Ideen",
    "",
    "- [ ] Kurzbefehl für Notizen",
    "- [ ] Farbschema für Diagramme",
    "- [x] Preview-Slots testen",
    "",
  ].join("\n"));
}

function gitCommit(projectPath) {
  const options = { cwd: projectPath, stdio: "ignore" };
  const now = new Date().toISOString();
  const identity = ["-c", "user.email=demo@example.com", "-c", "user.name=demo"];
  execFileSync("git", [...identity, "init", "-q"], options);
  execFileSync("git", [...identity, "add", "-A"], options);
  execFileSync("git", [...identity, "commit", "-q", "-m", "Initialer Stand"], {
    ...options,
    env: { ...process.env, GIT_AUTHOR_DATE: now, GIT_COMMITTER_DATE: now },
  });
}

async function ensureGitRepository(projectPath) {
  try {
    await access(join(projectPath, ".git"));
    return;
  } catch {
    // Noch kein Repository — wird unten angelegt.
  }
  gitCommit(projectPath);
}

export async function writeFixtureData({ root, repositoryRoot, basePort }) {
  const projectsRoot = join(root, "projects");
  const configDirectory = join(root, "config");
  const dataDirectory = join(root, "data");
  await mkdir(projectsRoot, { recursive: true });
  await mkdir(dataDirectory, { recursive: true });
  // Neutraler Shell-Prompt für die Terminal-Screenshots: keine echten
  // Benutzer-/Hostnamen aus /etc/bashrc (HOME der Fixture-Shell ist der Root).
  await writeFile(join(root, ".bash_profile"), [
    "export HOSTNAME=demo-server",
    "export PS1='demo-server:\\W demo$ '",
    "export BASH_SILENCE_DEPRECATION_WARNING=1",
    "",
  ].join("\n"));
  await writeProjectFiles(projectsRoot);

  for (const name of ["nordlicht", "feldnotiz", "sandkasten"]) {
    await ensureGitRepository(join(projectsRoot, name));
  }

  const projects = {
    projects: [
      {
        id: "nordlicht",
        name: "Nordlicht",
        description: "Kundenportal (Web-App)",
        path: join(projectsRoot, "nordlicht"),
        enabled: true,
        sortOrder: 1,
        previews: [{ id: "web", name: "Web", url: null, targetPort: basePort + 30, path: "/", mode: "hybrid", dependencies: [] }],
      },
      { id: "feldnotiz", name: "Feldnotiz", description: "Notizen-API", path: join(projectsRoot, "feldnotiz"), enabled: true, sortOrder: 2, previews: [] },
      { id: "sandkasten", name: "Sandkasten", description: "Experimente", path: join(projectsRoot, "sandkasten"), enabled: true, sortOrder: 3, previews: [] },
    ],
  };
  await writeFile(join(configDirectory, "projects.local.json"), `${JSON.stringify(projects, null, 2)}\n`, { mode: 0o600 });

  const extensionCatalogDirectory = join(dataDirectory, "extension-catalog");
  try {
    await access(join(extensionCatalogDirectory, "demo-clock", "extension.json"));
  } catch {
    await cp(join(repositoryRoot, "tests/fixtures/extension-catalog"), extensionCatalogDirectory, { recursive: true });
  }

  const profiles = {
    "codex-arbeit": { provider: "codex", label: "arbeit", content: codexAuthFile({ email: "arbeit@example.com", accountId: "acct-arbeit", plan: "plus" }) },
    "codex-privat": { provider: "codex", label: "privat", content: codexAuthFile({ email: "privat@example.com", accountId: "acct-privat", plan: "pro" }) },
    "opencode-demo": { provider: "opencode", label: "opencode-demo", content: `${JSON.stringify({ "opencode-go": { type: "api", key: "demo-schluessel" } }, null, 2)}\n` },
  };
  const profilePaths = {};
  for (const [key, profile] of Object.entries(profiles)) {
    const directory = join(dataDirectory, "profiles-fixture", key);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const fileName = profile.provider === "opencode" ? "auth.json" : "auth.json";
    await writeFile(join(directory, fileName), profile.content, { mode: 0o600 });
    profilePaths[key] = directory;
  }

  await writeFile(join(dataDirectory, "codexbar.json"), `${JSON.stringify({ version: 1, providers: [] }, null, 2)}\n`, { mode: 0o600 });

  return { projectsRoot, profilePaths };
}
